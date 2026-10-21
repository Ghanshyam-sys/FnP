import re
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Max
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from engine.client import EngineUnavailable

from .. import audit, catalogue
from ..models import (
    Answer, AnswerType, AnswerValue, Assessment, Department, EvidenceFile, EvidenceRule, Polarity, Question,
    QuestionnaireVersion, QuestionSection, Stage,
)
from ..permissions import IsReviewer
from .common import Conflict, ServiceUnavailable
from .evidence import remove_files

# Formats the reviewer may allow on a question; all are formats the engine reads.
CONFIGURABLE_FILE_TYPES = ["pdf", "xlsx", "csv", "jpg", "png", "docx"]


def _question_payload(q: Question) -> dict:
    return {
        "qid": q.qid,
        "section": q.section.name,
        "text": q.text,
        "polarity": q.polarity,
        "weight": float(q.weight),
        "isKnockout": q.is_knockout,
        "evidenceRequired": q.evidence_required,
        "answerType": q.answer_type,
        # The document types chosen for a question added here (engine codes); empty otherwise.
        "evidenceOptions": q.evidence_options,
        # Added in this app's configuration, so its document types are chosen here.
        "addedHere": q.added_here,
        "allowsNa": q.allows_na,
        "acceptsSupporting": q.accepts_supporting,
        "checks": q.checks,
        "allowedAnswers": q.allowed_answers,
        "fileTypes": q.file_types,
        "maxFiles": q.max_files,
    }


def _version_payload(version: QuestionnaireVersion) -> dict:
    questions = catalogue.questions(version.pk)
    return {
        "version": version.label,
        "sections": [
            {"name": s.name, "weight": float(s.weight)}
            for s in QuestionSection.objects.filter(version=version).order_by("position")
        ],
        "questions": [_question_payload(q) for q in questions.values()],
    }


class CatalogueView(APIView):
    """The active question set and the evidence options for every question and the CV."""

    def get(self, request):
        try:
            # The engine's lists, with the types chosen for questions added here.
            options = {**catalogue.evidence_options(), **catalogue.added_question_options()}
        except EngineUnavailable:
            raise ServiceUnavailable() from None
        return Response({
            **_version_payload(catalogue.active_version()),
            "cvFileTypes": catalogue.CV_FILE_TYPES,
            "evidenceOptions": options,
            # The largest document accepted, so the form can say so and refuse a bigger one at once.
            "maxUploadBytes": settings.EVIDENCE_MAX_BYTES,
        })


class DepartmentListView(APIView):
    """The departments an assessment can be filed under, for the application form and the queue
    filter."""

    def get(self, request):
        return Response([
            {"key": d.key, "name": d.name, "blurb": d.blurb} for d in Department.objects.order_by("pk")
        ])


class QuestionSettingSerializer(serializers.Serializer):
    allowedAnswers = serializers.ListField(child=serializers.ChoiceField(choices=Answer.values), min_length=1)
    fileTypes = serializers.ListField(child=serializers.ChoiceField(choices=CONFIGURABLE_FILE_TYPES), min_length=1)
    maxFiles = serializers.ChoiceField(choices=[1, 2])
    # Optional: left out, the question keeps its weight.
    weight = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"), required=False)


def _section_weight_errors(sections, questions: dict, weights: dict) -> dict:
    """Each section's weight is fixed: its questions' weights, as edited, must add up to it
    exactly, so the sections keep their share of the score and the total stays the same. Only the
    sections where a weight changes are checked: a save of other settings is never refused over
    weights it does not touch."""
    errors = {}
    touched = {questions[qid].section_id for qid in weights}
    for section in sections:
        if section.pk not in touched:
            continue
        total = sum(
            (weights.get(q.qid, q.weight) for q in questions.values() if q.section_id == section.pk), Decimal(0)
        )
        if total != section.weight:
            errors[section.name] = (
                f"The question weights add up to {total.normalize():f}; they must add up to the "
                f"section weight, {section.weight.normalize():f}."
            )
    return errors


_STALE = "These settings were changed by someone else. Reload them and make your changes again."


def _start_version(current: QuestionnaireVersion) -> QuestionnaireVersion:
    """The next version, not active yet, for the edit made from `current`. Inside the caller's
    transaction: two reviewers saving at once publish one after the other, and the second, waiting
    on this lock, then finds the version it edited is no longer the active one."""
    locked = QuestionnaireVersion.objects.select_for_update().filter(pk=current.pk, is_active=True)
    if locked.first() is None:
        raise Conflict(_STALE)
    next_number = QuestionnaireVersion.objects.aggregate(n=Max("pk"))["n"] + 1
    return QuestionnaireVersion.objects.create(label=f"v{next_number}", is_active=False)


def _make_active(current: QuestionnaireVersion, new: QuestionnaireVersion) -> None:
    """Puts the new version in force in place of the one it was edited from."""
    QuestionnaireVersion.objects.filter(pk=current.pk).update(is_active=False)
    QuestionnaireVersion.objects.filter(pk=new.pk).update(is_active=True)


class QuestionnaireView(APIView):
    """Reviewer: the question settings in force, and the published defaults to restore. PUT
    publishes a new version with changed answer options, formats, file counts and question weights.
    Section weights are fixed: a section's question weights must add up to its weight, so only how
    a section's weight is shared between its questions changes. PUT names the version it was edited from, so a reviewer who
    edited settings another reviewer has since replaced is told, rather than undoing that change."""

    permission_classes = [IsReviewer]

    def get(self, request):
        published = QuestionnaireVersion.objects.order_by("pk").first()
        try:
            # "Other — please specify" is not one to choose: every question offers it anyway.
            choices = [
                {"code": o["code"], "label": o["label"]}
                for o in catalogue.all_engine_options() if o["code"] != catalogue.OTHER_CODE
            ]
        except EngineUnavailable:
            # The page still opens; only a new question's document types cannot be chosen.
            choices = []
        return Response({
            "current": _version_payload(catalogue.active_version()),
            "published": _version_payload(published),
            "configurableFileTypes": CONFIGURABLE_FILE_TYPES,
            # The document types a new question can take (the engine's, for any question).
            "evidenceOptionChoices": choices,
            # The checks a question's documents can be given (the engine runs them on submission).
            "checkChoices": catalogue.check_choices(),
            "defaultChecks": catalogue.DEFAULT_CHECKS,
        })


    def put(self, request):
        body = request.data if isinstance(request.data, dict) else {}
        if "sections" in body:
            return _publish_structure(request, body)
        settings_by_qid, edited_from = body.get("questions"), body.get("version")
        if not isinstance(settings_by_qid, dict):
            raise ValidationError({"questions": "Expected an object keyed by question."})
        if not isinstance(edited_from, str):
            raise ValidationError({"version": "Name the version these settings were edited from."})
        current = catalogue.active_version()
        if current.label != edited_from:
            raise Conflict(_STALE)
        questions = catalogue.questions(current.pk)
        changes, errors = {}, {}
        for qid, raw in settings_by_qid.items():
            if qid not in questions:
                errors[qid] = "Unknown question."
                continue
            data = QuestionSettingSerializer(data=raw)
            if data.is_valid():
                v = data.validated_data
                # Order answers and formats canonically so identical settings compare equal.
                changes[qid] = {
                    "allowed_answers": [a for a in Answer.values if a in v["allowedAnswers"]],
                    "file_types": [t for t in CONFIGURABLE_FILE_TYPES if t in v["fileTypes"]],
                    "max_files": v["maxFiles"],
                }
                if "weight" in v:
                    changes[qid]["weight"] = v["weight"]
            else:
                errors[qid] = data.errors
        if errors:
            raise ValidationError(errors)
        current_sections = list(QuestionSection.objects.filter(version=current).order_by("position"))
        # The weights that actually change (the page sends every question's weight).
        weights = {
            qid: c["weight"] for qid, c in changes.items() if "weight" in c and c["weight"] != questions[qid].weight
        }
        section_errors = _section_weight_errors(current_sections, questions, weights)
        if section_errors:
            raise ValidationError({"sections": section_errors})

        unchanged = all(
            getattr(questions[qid], field) == value for qid, c in changes.items() for field, value in c.items()
        )
        if unchanged:
            return Response(_version_payload(current))

        with transaction.atomic():
            new = _start_version(current)
            sections = {
                s.pk: QuestionSection.objects.create(version=new, name=s.name, weight=s.weight, position=s.position)
                for s in current_sections
            }
            Question.objects.bulk_create([
                Question(
                    version=new, section=sections[q.section_id], qid=q.qid, text=q.text, polarity=q.polarity,
                    weight=changes.get(q.qid, {}).get("weight", q.weight), is_knockout=q.is_knockout, evidence_required=q.evidence_required,
                    allows_na=q.allows_na, accepts_supporting=q.accepts_supporting, checks=q.checks,
                    answer_type=q.answer_type, evidence_options=q.evidence_options, added_here=q.added_here,
                    allowed_answers=changes.get(q.qid, {}).get("allowed_answers", q.allowed_answers),
                    file_types=changes.get(q.qid, {}).get("file_types", q.file_types),
                    max_files=changes.get(q.qid, {}).get("max_files", q.max_files),
                    position=q.position,
                )
                for q in questions.values()
            ])
            _make_active(current, new)
            audit.record(
                request.user, "questionnaire.publish", target_type="questionnaire", target_id=new.label,
                metadata={"changed": sorted(changes)},
            )
        new.refresh_from_db()
        return Response(_version_payload(new))


class QuestionnaireImpactView(APIView):
    """Reviewer: what changing the questions would reach on the forms not yet submitted, read when
    the reviewer is about to apply a change (so the numbers are current): how many such forms there
    are, and for each question how many have an answer saved and how many a document attached. A
    publish clears these where a question is deleted, retyped or no longer takes a document."""

    permission_classes = [IsReviewer]

    def get(self, request):
        drafts = Assessment.objects.filter(stage=Stage.NOT_SUBMITTED)
        return Response({
            "drafts": drafts.count(),
            # One answer per question per form (a unique rule), so rows are forms.
            "answered": dict(
                AnswerValue.objects.filter(assessment__stage=Stage.NOT_SUBMITTED)
                .values_list("qid").annotate(n=Count("pk")).order_by()
            ),
            # Forms with a current document under each question.
            "documents": dict(
                EvidenceFile.objects.filter(assessment__stage=Stage.NOT_SUBMITTED, superseded_at__isnull=True)
                .values_list("qid").annotate(n=Count("assessment", distinct=True)).order_by()
            ),
        })


# ---- Editing the whole questionnaire: sections and questions added, changed or deleted --------

class QuestionEditSerializer(serializers.Serializer):
    # An existing question's code; left out (or null) for a question added in this edit.
    qid = serializers.CharField(max_length=10, required=False, allow_null=True, allow_blank=True)
    text = serializers.CharField(max_length=2000, trim_whitespace=True)
    polarity = serializers.ChoiceField(choices=Polarity.values)
    answerType = serializers.ChoiceField(choices=AnswerType.values, default=AnswerType.CHOICE)
    weight = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"))
    allowedAnswers = serializers.ListField(child=serializers.ChoiceField(choices=Answer.values), default=list)
    fileTypes = serializers.ListField(child=serializers.ChoiceField(choices=CONFIGURABLE_FILE_TYPES), default=list)
    maxFiles = serializers.ChoiceField(choices=[1, 2], default=1)
    evidenceRequired = serializers.ChoiceField(choices=EvidenceRule.values)
    evidenceOptions = serializers.ListField(child=serializers.CharField(max_length=60), default=list)
    # The checks the engine runs on its documents. Left out, the question keeps the ones it has.
    checks = serializers.ListField(child=serializers.CharField(max_length=200, allow_blank=True), required=False, max_length=40)


class SectionEditSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, trim_whitespace=True)
    weight = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"))
    questions = serializers.ListField(child=QuestionEditSerializer(), min_length=1)


# The total every questionnaire's section weights add up to.
TOTAL_WEIGHT = Decimal("100")


def _number(d: Decimal) -> str:
    return f"{d.normalize():f}"


def _new_qids(count: int) -> list[str]:
    """Codes for questions added now: N1, N2 ... numbered on from every code ever used, so a deleted
    question's code is never given to another (answers and past cases are filed under codes)."""
    every = set(Question.objects.values_list("qid", flat=True).distinct())
    used = [int(m[1]) for qid in every if (m := re.fullmatch(r"N(\d+)", qid))]
    codes, n = [], max(used, default=0)
    while len(codes) < count:
        n += 1
        if f"N{n}" not in every:
            codes.append(f"N{n}")
    return codes


def _own_options(codes: list[str], engine_codes: set[str] | None) -> tuple[list[str], str | None]:
    """The document types chosen for a question added here, in order and once each: the engine's
    codes it knows, and names the reviewer typed in (as CUSTOM:<name>, spaces tidied). Unknown
    engine codes are left out; a name too long or with control characters is refused."""
    options: list[str] = []
    seen: set[str] = set()
    for code in codes:
        name = catalogue.custom_name(code)
        if name is None:
            if engine_codes and code in engine_codes and code not in seen:
                seen.add(code)
                options.append(code)
            continue
        name = " ".join(name.split())
        if not name:
            continue
        if len(name) > catalogue.CUSTOM_NAME_MAX:
            return [], f"A document name can be at most {catalogue.CUSTOM_NAME_MAX} characters."
        if any(ord(ch) < 32 or 0xD800 <= ord(ch) <= 0xDFFF for ch in name):
            return [], "A document name cannot contain control characters."
        if name.casefold() in seen:
            continue
        seen.add(name.casefold())
        options.append(catalogue.CUSTOM_PREFIX + name)
    return options, None


def _clean_checks(raw: list[str]) -> tuple[list[str], str | None]:
    """The checks chosen for a question, in order and once each, named as the engine names them
    (a check typed in is turned into that form). A name too long or with control characters is
    refused; one with no letters or digits is left out."""
    checks: list[str] = []
    seen: set[str] = set()
    for text in raw:
        if any(ord(ch) < 32 or 0xD800 <= ord(ch) <= 0xDFFF for ch in text):
            return [], "A check cannot contain control characters."
        name = catalogue.check_name(text)
        if name is None:
            continue
        if len(name) > catalogue.CHECK_MAX:
            return [], f"A check's name can be at most {catalogue.CHECK_MAX} characters."
        if name.casefold() in seen:
            continue
        seen.add(name.casefold())
        checks.append(name)
    return checks, None


def _publish_structure(request, body: dict):
    """Publishes a new version from the whole questionnaire as edited: its sections in order, each
    with its weight and its questions. A question in the current version not sent is deleted (from
    this version on: a case already submitted keeps its own); one sent without a code is added.

    The rules: the section weights add up to 100; each section's question weights add up to its
    weight; a question taking documents allows at least one format, and one added here names the
    engine's document types it takes. Any question can be changed, its polarity and answer type
    included; where the answer type changes (Yes/No to words, or back), answers already saved for
    it on forms not yet submitted no longer fit, so they are cleared and asked for again."""
    edited_from = body.get("version")
    if not isinstance(edited_from, str):
        raise ValidationError({"version": "Name the version these settings were edited from."})
    data = serializers.ListField(child=SectionEditSerializer(), min_length=1)
    data = data.run_validation(body.get("sections")) if isinstance(body.get("sections"), list) else None
    if data is None:
        raise ValidationError({"sections": "Expected a list of sections."})
    current = catalogue.active_version()
    if current.label != edited_from:
        raise Conflict(_STALE)
    existing = catalogue.questions(current.pk)

    errors: dict[str, str] = {}
    general: list[str] = []
    names = [section["name"] for section in data]
    if len({n.casefold() for n in names}) != len(names):
        general.append("Two sections have the same name. Give each section its own name.")
    total = sum((section["weight"] for section in data), Decimal(0))
    if total != TOTAL_WEIGHT:
        general.append(f"The section weights add up to {_number(total)}; they must add up to 100.")
    if general:
        errors["detail"] = " ".join(general)
    section_errors: dict[str, str] = {}
    seen: set[str] = set()
    # Existing questions whose answer type changes: their saved draft answers are cleared.
    retyped: list[str] = []
    added = sum(1 for section in data for q in section["questions"] if not q.get("qid"))
    fresh = iter(_new_qids(added))
    try:
        engine_codes = None
        rows = []
        for section in data:
            sum_q = sum((q["weight"] for q in section["questions"]), Decimal(0))
            if sum_q != section["weight"]:
                section_errors[section["name"]] = (
                    f"The question weights add up to {_number(sum_q)}; they must add up to the section "
                    f"weight, {_number(section['weight'])}."
                )
            for position, q in enumerate(section["questions"], start=1):
                qid = q.get("qid") or None
                # A question in force, or one deleted earlier and now brought back (restoring the
                # published model does that): its latest edition.
                before = (existing.get(qid) or _latest_edition(qid)) if qid else None
                label = qid or f"question {position} in {section['name']} (new)"
                if qid and before is None:
                    errors[f"questions.{qid}"] = "Unknown question. Reload the settings and try again."
                    continue
                if qid in seen:
                    errors[f"questions.{qid}"] = "This question is listed twice."
                    continue
                if qid:
                    seen.add(qid)
                    if q["answerType"] != before.answer_type:
                        retyped.append(qid)
                text_type = q["answerType"] == AnswerType.TEXT
                rule = q["evidenceRequired"]
                allowed = [] if text_type else [a for a in Answer.values if a in q["allowedAnswers"]]
                if not text_type and not allowed:
                    errors[f"questions.{label}"] = "Choose at least one answer option."
                    continue
                if text_type and rule == EvidenceRule.IF_YES:
                    errors[f"questions.{label}"] = "A text question either always takes a document or never does."
                    continue
                takes_documents = rule != EvidenceRule.NEVER
                file_types = [t for t in CONFIGURABLE_FILE_TYPES if t in q["fileTypes"]] if takes_documents else []
                if takes_documents and not file_types:
                    errors[f"questions.{label}"] = "Choose at least one accepted file type."
                    continue
                options: list[str] = []
                # A question added here names its document types; one the engine knows uses the engine's.
                needs_own_options = takes_documents and (before is None or before.added_here)
                if needs_own_options:
                    # Only names the reviewer typed in need nothing from the engine.
                    if engine_codes is None and any(catalogue.custom_name(c) is None for c in q["evidenceOptions"]):
                        engine_codes = {o["code"] for o in catalogue.all_engine_options()}
                    options, problem = _own_options(q["evidenceOptions"], engine_codes)
                    if problem:
                        errors[f"questions.{label}"] = problem
                        continue
                    if not options:
                        errors[f"questions.{label}"] = "Choose the document types this question takes."
                        continue
                # The checks run on its documents: as sent (none for a question that takes none),
                # or, left out, the ones it has.
                if "checks" in q:
                    checks, problem = _clean_checks(q["checks"]) if takes_documents else ([], None)
                    if problem:
                        errors[f"questions.{label}"] = problem
                        continue
                else:
                    checks = list(before.checks) if before else []
                rows.append({
                    "section": section["name"], "qid": qid or next(fresh), "text": q["text"],
                    "polarity": q["polarity"], "answer_type": q["answerType"], "weight": q["weight"],
                    "is_knockout": before.is_knockout if before else False,
                    "added_here": before.added_here if before else True,
                    "evidence_required": rule, "evidence_options": options,
                    "allows_na": before.allows_na if before else Answer.NA in allowed,
                    "checks": checks,
                    "allowed_answers": allowed, "file_types": file_types,
                    "max_files": q["maxFiles"] if takes_documents else 1,
                    "accepts_supporting": (
                        before.accepts_supporting if before else takes_documents and q["maxFiles"] == 2
                    ),
                })
    except EngineUnavailable:
        raise ServiceUnavailable() from None
    if section_errors:
        errors["sections"] = section_errors
    if errors:
        raise ValidationError(errors)

    # Nothing changed: publish nothing.
    current_sections = list(QuestionSection.objects.filter(version=current).order_by("position"))
    if [(s.name, s.weight) for s in current_sections] == [(sec["name"], sec["weight"]) for sec in data] and [
        _row_of(q) for q in existing.values()
    ] == rows:
        return Response(_version_payload(current))

    with transaction.atomic():
        new = _start_version(current)
        # The forms not yet submitted follow the new version: they are locked first, so a save or
        # upload on one either finishes before this publish or waits for it and then checks its
        # change against the new settings (views/form.py, views/evidence.py).
        list(Assessment.objects.select_for_update().filter(stage=Stage.NOT_SUBMITTED).values_list("pk", flat=True))
        sections = {
            section["name"]: QuestionSection.objects.create(
                version=new, name=section["name"], weight=section["weight"], position=i + 1
            )
            for i, section in enumerate(data)
        }
        Question.objects.bulk_create([
            Question(version=new, position=i + 1, **{**row, "section": sections[row["section"]]})
            for i, row in enumerate(rows)
        ])
        _make_active(current, new)
        if retyped:
            # Forms not yet submitted follow the new version: a Yes saved for a question now answered
            # in words (or words for one now Yes/No) would not fit it.
            AnswerValue.objects.filter(assessment__stage=Stage.NOT_SUBMITTED, qid__in=retyped).delete()
        _drop_unneeded_draft_documents(existing, new)
        _drop_deleted_from_drafts(set(existing) - {row["qid"] for row in rows})
        kept = {row["qid"] for row in rows}
        audit.record(
            request.user, "questionnaire.publish", target_type="questionnaire", target_id=new.label,
            metadata={
                "added": sorted(kept - set(existing)),
                "deleted": sorted(set(existing) - kept),
                "retyped": sorted(retyped),
                "sections": [section["name"] for section in data],
            },
        )
    new.refresh_from_db()
    return Response(_version_payload(new))


def _drop_deleted_from_drafts(deleted: set[str]) -> None:
    """A question deleted from the questionnaire is no longer on a form not yet submitted: its
    answer and documents there are taken off too, so none is left that the form cannot show or
    remove, or that would be sent with nothing to answer."""
    if not deleted:
        return
    AnswerValue.objects.filter(assessment__stage=Stage.NOT_SUBMITTED, qid__in=deleted).delete()
    held = EvidenceFile.objects.filter(assessment__stage=Stage.NOT_SUBMITTED, qid__in=deleted, superseded_at__isnull=True)
    remove_files(held)


def _drop_unneeded_draft_documents(before: dict, new: QuestionnaireVersion) -> None:
    """After a question's document rule or answer type changes, a form not yet submitted can hold
    a document the question no longer asks for (one now taking none, or a Yes's document for a
    question now answered in words). Such documents are taken off, as changing the answer itself
    would do, so the form is never left holding one it cannot show or remove."""
    published = Question.objects.filter(version=new)
    changed = {
        q.qid: q for q in published
        if q.qid in before and (
            q.evidence_required != before[q.qid].evidence_required or q.answer_type != before[q.qid].answer_type
        )
    }
    if not changed:
        return
    held = EvidenceFile.objects.filter(
        assessment__stage=Stage.NOT_SUBMITTED, qid__in=changed, superseded_at__isnull=True
    )
    answers = {
        (a, q): v for a, q, v in AnswerValue.objects.filter(
            assessment__stage=Stage.NOT_SUBMITTED, qid__in=changed
        ).values_list("assessment_id", "qid", "value")
    }
    unneeded = [
        e for e in held
        if not catalogue.evidence_required(
            changed[e.qid], answers.get((e.assessment_id, e.qid), catalogue.default_answer(changed[e.qid]))
        )
    ]
    if unneeded:
        remove_files(unneeded)


def _latest_edition(qid: str) -> Question | None:
    """The question with this code as last published, in any version."""
    return Question.objects.filter(qid=qid).order_by("-version_id").first()


def _row_of(q: Question) -> dict:
    """A saved question in the shape _publish_structure builds, to tell whether anything changed."""
    return {
        "section": q.section.name, "qid": q.qid, "text": q.text, "polarity": q.polarity,
        "answer_type": q.answer_type, "weight": q.weight, "is_knockout": q.is_knockout,
        "evidence_required": q.evidence_required, "evidence_options": list(q.evidence_options),
        "added_here": q.added_here,
        "allows_na": q.allows_na, "checks": list(q.checks), "allowed_answers": list(q.allowed_answers),
        "file_types": list(q.file_types), "max_files": q.max_files, "accepts_supporting": q.accepts_supporting,
    }
