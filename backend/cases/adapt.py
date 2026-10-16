"""Translation between our data and the Data Authentication API's formats, in both directions.

Outbound, only what the engine needs leaves the system: the four applicant fields it reads (not
nationality, ID number or phone) and files under neutral names. Inbound, every engine link is
replaced by our own access-checked one, so no engine URL or request id reaches the browser."""

import re

from django.utils import timezone

from . import catalogue, validation
from .models import (
    ApplicantProfile,
    Assessment,
    EvidenceFile,
    EvidenceRole,
    Question,
)

CV_DOC_TYPE = "curriculum_vitae"
# Anything after the page number (a stray quote, say) is dropped.
_HIGHLIGHT = re.compile(r"/authentication/evidence-highlight/[^/]+/([A-Za-z0-9._-]+\.pdf)(?:#page=(\d+)[^/]*)?$")


# ---- Outbound ---------------------------------------------------------------------------------

def submission_payload(
    assessment: Assessment,
    questions: dict[str, Question],
    answers: dict[str, str],
    profile: ApplicantProfile | None,
    evidence: list[EvidenceFile],
) -> dict:
    """The submission in the format the engine reads (the test set's form_data with a
    cv_verification block). Unanswered questions are No, as on the form."""
    by_qid: dict[str, list[EvidenceFile]] = {}
    for e in evidence:
        by_qid.setdefault(e.qid, []).append(e)

    sections: list[dict] = []
    for q in questions.values():
        if not sections or sections[-1]["section"] != q.section.name:
            sections.append({"section": q.section.name, "section_weight": float(q.section.weight), "questions": []})
        answer = answers.get(q.qid, catalogue.default_answer(q))
        sections[-1]["questions"].append({
            "qid": q.qid,
            "question": q.text,
            "question_weight": float(q.weight),
            "polarity": q.polarity,
            "knockout": int(q.is_knockout),
            "answer": answer,
            "evidence_required": catalogue.evidence_required(q, answer),
            "evidence": [{"doc_type": e.doc_type, "role": e.role} for e in by_qid.get(q.qid, [])],
            "checks_to_perform": q.checks,
        })

    return {
        "application_id": assessment.public_id,
        "licensee": assessment.entity,
        "applicant": {
            "full_name": assessment.applicant_name,
            "proposed_role": assessment.position,
            "date_of_birth": profile.date_of_birth.isoformat() if profile and profile.date_of_birth else "",
            "town": profile.town if profile else "",
        },
        "submitted_at": timezone.now().isoformat(),
        "sections": sections,
        "cv_verification": {
            "doc_type": CV_DOC_TYPE,
            "mandatory": True,
            "evidence": [{"doc_type": e.doc_type, "role": EvidenceRole.PRIMARY} for e in by_qid.get("CV", [])],
            "checks_to_perform": ["Document_Check", "Name_Check"],
        },
    }


def submission_files(evidence: list[EvidenceFile]) -> list[tuple[str, object, str, str]]:
    """(name, open file, content type, doc_type) per document. Names are neutral — the doc type
    and a counter — so the applicant's own file names are not passed on."""
    files, seen = [], {}
    try:
        for e in evidence:
            ext = validation.extension(e.original_name) or "bin"
            seen[e.doc_type] = seen.get(e.doc_type, 0) + 1
            name = f"{e.doc_type}{'' if seen[e.doc_type] == 1 else seen[e.doc_type]}.{ext}"
            files.append((name, e.file.open("rb"), e.content_type, e.doc_type))
    except BaseException:
        # One document missing from storage: the caller never receives the list, so the files
        # already opened are closed here rather than left open in a long-running worker.
        for _, fh, *_ in files:
            fh.close()
        raise
    return files


# ---- Inbound ----------------------------------------------------------------------------------

def highlight_url(assessment: Assessment, engine_url: str | None) -> str | None:
    """Our link for one of the engine's highlighted PDFs, keeping the page anchor."""
    match = _HIGHLIGHT.search(engine_url or "")
    if not match:
        return None
    name, page = match.groups()
    return f"/api/assessments/{assessment.public_id}/highlights/{name}" + (f"#page={page}" if page else "")


def question_results(result: dict) -> list[dict]:
    """One row per question for the question_result table."""
    rows = []
    for section in result.get("sections", []):
        for q in section.get("questions", []):
            determination = q.get("determination") or {}
            rows.append({
                "qid": q["qid"],
                "status": q["question_status"],
                "verdict": determination.get("verdict") or "",
                "confidence": q.get("confidence"),
            })
    return rows


def authentication(assessment: Assessment, result: dict, evidence: list[EvidenceFile]) -> dict:
    """The engine's authentication result in the API's shape, with our links."""
    # A question can hold two documents of the same type (a primary and a supporting one), so each
    # is found by its role too; the type alone is the fallback for an entry that names no role.
    files: dict[tuple, EvidenceFile] = {}
    for e in evidence:
        files.setdefault((e.qid, e.doc_type, e.role), e)
        files.setdefault((e.qid, e.doc_type, None), e)

    def document(qid: str, doc: dict) -> dict:
        own = files.get((qid, doc.get("doc_type"), doc.get("role"))) or files.get((qid, doc.get("doc_type"), None))
        return {
            "docType": doc.get("doc_type"),
            "role": doc.get("role"),
            "status": doc.get("document_status"),
            "url": f"/api/assessments/{assessment.public_id}/evidence/{own.public_id}/file" if own else None,
        }

    def question(q: dict) -> dict:
        d = q.get("determination")
        return {
            "qid": q["qid"],
            "question": q.get("question"),
            "answer": q.get("user_answer"),
            "status": q["question_status"],
            "confidence": q.get("confidence"),
            "summary": q.get("summary"),
            "checks": [
                {
                    "name": c.get("name"),
                    "label": c.get("label"),
                    "status": c.get("check_status"),
                    "confidence": c.get("confidence"),
                    "note": c.get("note"),
                }
                for c in q.get("checks", [])
            ],
            "determination": None if not d else {
                "engineAnswer": d.get("engine_answer"),
                "verdict": d.get("verdict"),
                "note": d.get("note"),
                "evidenceLine": d.get("evidence_line"),
                "highlightUrl": highlight_url(assessment, d.get("evidence_url")),
            },
            "documents": [document(q["qid"], doc) for doc in q.get("evidence_documents", [])],
        }

    def finding(f: dict) -> dict:
        return {**f, "evidence_url": highlight_url(assessment, f.get("evidence_url"))}

    summary = result.get("data_authentication_summary", {})
    cv = result.get("cvVerification")
    return {
        "outcome": summary.get("outcome"),
        "isClean": summary.get("isClean"),
        "overallConfidence": summary.get("overallConfidence"),
        "checksRun": summary.get("checksRun"),
        "questionsWithIssues": summary.get("questionsWithIssues"),
        "sections": [
            {
                "section": s.get("section"),
                "issueCount": s.get("issueCount", 0),
                "questions": [question(q) for q in s.get("questions", [])],
            }
            for s in result.get("sections", [])
        ],
        "cvVerification": None if not cv else {
            "docType": cv.get("docType"),
            "status": cv.get("status"),
            "gateChecks": cv.get("gateChecks", []),
            "consistencyFindings": [finding(f) for f in cv.get("consistencyFindings", [])],
            "suitabilityFindings": [finding(f) for f in cv.get("suitabilityFindings", [])],
            "flagCount": cv.get("flagCount", 0),
        },
    }


def score_from_engine(document: dict) -> dict:
    """The engine's score document reduced to the fields we store."""
    summary = document["score_summary"]
    return {
        "risk_score": summary["risk_score"],
        "normalised": summary["normalised_risk_score"],
        "band": summary["risk_band"],
        "knock_out": summary["knock_out_triggered"],
        "recommendation": summary["recommendation"],
        "lines": document.get("questions", []),
    }


def final_assessment(assessment: Assessment, document: dict) -> dict:
    """The engine's written assessment with its links replaced and its request id removed."""
    clean = {k: v for k, v in document.items() if k != "request_id"}
    clean["concerns"] = [
        {**c, "evidence_url": highlight_url(assessment, c.get("evidence_url"))} for c in document.get("concerns", [])
    ]
    return clean
