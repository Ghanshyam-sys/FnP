"""The application's library ("Your documents"): uploaded first, several at once, then attached to
questions (or the CV) from there; detached back into it; removed from it everywhere."""

import pytest
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile

from cases.models import Assessment, AuditEvent, CaseDocument, EvidenceFile, Stage, Submission
from cases.tests import factories as make
from cases.tests.test_phase2_api import applicant, opened, reviewer  # noqa: F401  (fixtures)

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("engine_options")]

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def pdf(n=1, name=None):
    return SimpleUploadedFile(name or f"scan-{n}.pdf", b"%PDF-1.7\n%doc " + str(n).encode() + b"\n", content_type="application/pdf")


def add(api, aid, file):
    return api.post(f"/api/assessments/{aid}/documents", {"file": file}, multipart=True)


def attach(api, aid, document_id, qid="A1", code="NATIONAL_ID", **fields):
    data = {"documentId": document_id, "qid": qid, "optionCode": code, **fields}
    return api.post(f"/api/assessments/{aid}/evidence", data, multipart=True)


def library(api, aid):
    return api.get(f"/api/assessments/{aid}/form").json()["documents"]


def test_documents_are_uploaded_first_and_the_same_file_twice_is_one(applicant, opened):
    first = add(applicant, opened, pdf(1, "passport.pdf"))
    assert first.status_code == 201 and first.json()["duplicate"] is False
    assert first.json()["fileName"] == "passport.pdf" and first.json()["format"] == "pdf"
    assert add(applicant, opened, pdf(2, "degree.pdf")).status_code == 201
    again = add(applicant, opened, pdf(1, "passport copy.pdf"))
    assert again.status_code == 200 and again.json()["duplicate"] is True and again.json()["id"] == first.json()["id"]
    docs = library(applicant, opened)
    assert [d["fileName"] for d in docs] == ["passport.pdf", "degree.pdf"] and all(d["usedBy"] == [] for d in docs)
    assert EvidenceFile.objects.count() == 0  # nothing attached yet
    assert AuditEvent.objects.filter(action="document.upload").count() == 2


def test_the_library_refuses_a_format_no_question_takes_and_a_disguised_file(applicant, opened):
    exe = SimpleUploadedFile("setup.exe", b"MZ....", content_type="application/octet-stream")
    refused = add(applicant, opened, exe)
    assert refused.status_code == 400 and "Upload" in refused.json()["file"]
    fake = SimpleUploadedFile("scan.pdf", b"not a pdf", content_type="application/pdf")
    assert add(applicant, opened, fake).status_code == 400


def test_a_document_is_attached_from_the_library_and_can_answer_several_questions(applicant, opened):
    doc = add(applicant, opened, pdf(1, "id.pdf")).json()
    response = attach(applicant, opened, doc["id"])
    assert response.status_code == 201 and response.json()["documentId"] == doc["id"]
    assert response.json()["fileName"] == "id.pdf" and response.json()["qid"] == "A1"
    # The same document, attached under the CV as well: one upload, two places.
    assert attach(applicant, opened, doc["id"], qid="CV", code="CURRICULUM_VITAE").status_code == 201
    (entry,) = library(applicant, opened)
    assert sorted(u["qid"] for u in entry["usedBy"]) == ["A1", "CV"]
    stored = CaseDocument.objects.get().file.name
    assert set(EvidenceFile.objects.values_list("file", flat=True)) == {stored}  # one stored file


def test_a_question_only_takes_a_library_document_in_its_formats(applicant, opened):
    image = add(applicant, opened, SimpleUploadedFile("id.png", PNG, content_type="image/png")).json()
    refused = attach(applicant, opened, image["id"])
    assert refused.status_code == 400 and "accepts PDF" in refused.json()["file"]
    missing = attach(applicant, opened, "00000000-0000-0000-0000-000000000000")
    assert missing.status_code == 400 and "documentId" in missing.json()
    assert attach(applicant, opened, "not-an-id").status_code == 400


def test_detaching_keeps_the_document_in_the_library(applicant, opened, django_capture_on_commit_callbacks):
    doc = add(applicant, opened, pdf()).json()
    evidence = attach(applicant, opened, doc["id"]).json()
    with django_capture_on_commit_callbacks(execute=True):
        assert applicant.delete(f"/api/assessments/{opened}/evidence/{evidence['id']}").status_code == 204
    (entry,) = library(applicant, opened)
    assert entry["id"] == doc["id"] and entry["usedBy"] == []
    assert default_storage.exists(CaseDocument.objects.get().file.name)


def test_an_answer_no_longer_needing_a_document_puts_it_back_in_the_library(applicant, opened):
    applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"FC5": "Yes"}})
    doc = add(applicant, opened, pdf()).json()
    assert attach(applicant, opened, doc["id"], qid="FC5", code="BANK_REFERENCE_LETTER").status_code == 201
    applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"FC5": "No"}})
    assert not EvidenceFile.objects.filter(qid="FC5").exists()
    assert [d["id"] for d in library(applicant, opened)] == [doc["id"]]


def test_removing_a_document_takes_it_off_every_question_and_deletes_its_file(
    applicant, opened, django_capture_on_commit_callbacks
):
    doc = add(applicant, opened, pdf()).json()
    attach(applicant, opened, doc["id"])
    stored = CaseDocument.objects.get().file.name
    with django_capture_on_commit_callbacks(execute=True):
        assert applicant.delete(f"/api/assessments/{opened}/documents/{doc['id']}").status_code == 204
    assert library(applicant, opened) == [] and not EvidenceFile.objects.exists()
    assert not default_storage.exists(stored)
    assert applicant.delete(f"/api/assessments/{opened}/documents/{doc['id']}").status_code == 404


def test_uploading_at_a_question_also_keeps_the_file_in_the_library(applicant, opened):
    data = {"file": pdf(7, "licence.pdf"), "qid": "A1", "optionCode": "NATIONAL_ID"}
    evidence = applicant.post(f"/api/assessments/{opened}/evidence", data, multipart=True).json()
    (entry,) = library(applicant, opened)
    assert evidence["documentId"] == entry["id"] and entry["usedBy"] == [{"qid": "A1", "role": "primary"}]


def test_only_the_owner_changes_the_library_and_only_before_submission(as_user, applicant, reviewer, opened):
    doc = add(applicant, opened, pdf()).json()
    other = as_user(make.user("someone.else@example.na"))
    assert add(other, opened, pdf(2)).status_code == 404
    assert add(reviewer, opened, pdf(2)).status_code == 403
    # Attached nowhere, it is not part of the application: only its owner reads it.
    assert reviewer.get(f"/api/assessments/{opened}/documents/{doc['id']}/file").status_code == 404
    assert applicant.get(f"/api/assessments/{opened}/documents/{doc['id']}/file").status_code == 200
    # Attached to a question, the reviewer may read it; nobody else may.
    attach(applicant, opened, doc["id"])
    assert reviewer.get(f"/api/assessments/{opened}/documents/{doc['id']}/file").status_code == 200
    assert other.get(f"/api/assessments/{opened}/documents/{doc['id']}/file").status_code == 404
    Assessment.objects.filter(public_id=opened).update(stage=Stage.REVIEW_PENDING)
    assert add(applicant, opened, pdf(3)).status_code == 409
    assert applicant.delete(f"/api/assessments/{opened}/documents/{doc['id']}").status_code == 409


def test_the_library_holds_a_limited_number_of_documents(applicant, opened, monkeypatch):
    from cases.views import evidence

    monkeypatch.setattr(evidence, "library_limit", lambda assessment: 2)
    assert add(applicant, opened, pdf(1)).status_code == 201
    assert add(applicant, opened, pdf(2)).status_code == 201
    refused = add(applicant, opened, pdf(3))
    assert refused.status_code == 400 and "at most 2" in refused.json()["file"]
    # The same limit for a file uploaded at a question: the library is never over it.
    refused = upload_at(applicant, opened, pdf(4))
    assert refused.status_code == 400 and "at most 2" in refused.json()["file"]
    # The same file again is not another one.
    assert add(applicant, opened, pdf(1)).status_code == 200


def test_starting_over_clears_the_library(applicant, opened, django_capture_on_commit_callbacks):
    doc = add(applicant, opened, pdf()).json()
    attach(applicant, opened, doc["id"])
    stored = CaseDocument.objects.get().file.name
    with django_capture_on_commit_callbacks(execute=True):
        assert applicant.post(f"/api/assessments/{opened}/form/reset").status_code == 200
    assert library(applicant, opened) == [] and not default_storage.exists(stored)


def test_removing_the_application_removes_its_library(reviewer, applicant, opened, django_capture_on_commit_callbacks):
    add(applicant, opened, pdf())
    stored = CaseDocument.objects.get().file.name
    with django_capture_on_commit_callbacks(execute=True):
        assert reviewer.delete(f"/api/assessments/{opened}").status_code == 204
    assert not CaseDocument.objects.exists() and not default_storage.exists(stored)


def test_a_document_already_sent_is_not_new_evidence_when_attached_again(applicant, opened):
    """Back with the applicant, a sent-back answer needs a document the engine has not read: the
    same file attached again from the library does not count."""
    doc = add(applicant, opened, pdf()).json()
    evidence = attach(applicant, opened, doc["id"]).json()
    case = Assessment.objects.get(public_id=opened)
    run = Submission.objects.create(assessment=case, attempt_no=1, version=case.version, payload={})
    run.evidence_files.set(EvidenceFile.objects.filter(public_id=evidence["id"]))
    from cases.models import Ruling

    Ruling.objects.create(submission=run, qid="A1", verdict="rejected", comment="Unclear", reviewer=make.reviewer())
    Assessment.objects.filter(pk=case.pk).update(stage=Stage.AWAITING_APPLICANT)
    # Detached and attached again: the same contents, so still waiting for new evidence.
    applicant.delete(f"/api/assessments/{opened}/evidence/{evidence['id']}")
    assert attach(applicant, opened, doc["id"]).status_code == 201
    assert applicant.get(f"/api/assessments/{opened}/case").json()["unreplaced"] == ["A1"]
    # The same file filed as another type is new: the engine reads it as that type.
    again = EvidenceFile.objects.get(qid="A1", superseded_at__isnull=True)
    applicant.delete(f"/api/assessments/{opened}/evidence/{again.public_id}")
    assert attach(applicant, opened, doc["id"], code="PASSPORT").status_code == 201
    assert applicant.get(f"/api/assessments/{opened}/case").json()["unreplaced"] == []
    # A different document is new.
    other = add(applicant, opened, pdf(2)).json()
    assert attach(applicant, opened, other["id"]).status_code == 201
    assert applicant.get(f"/api/assessments/{opened}/case").json()["unreplaced"] == []
    # Only answers sent back may change while the case is back with the applicant.
    refused = attach(applicant, opened, other["id"], qid="CV", code="CURRICULUM_VITAE")
    assert refused.status_code == 409


def test_documents_attached_before_the_library_are_put_in_it():
    from importlib import import_module

    from django.apps import apps

    migration = import_module("cases.migrations.0011_case_document_library")
    case = make.assessment()
    user = make.user()
    for qid in ("A1", "CV"):  # the same file attached twice: one document
        EvidenceFile.objects.create(
            assessment=case, qid=qid, option_code="X", doc_type="x", file="evidence/1/a", original_name="a.pdf",
            content_type="application/pdf", size_bytes=1, sha256="abc", uploaded_by=user,
        )
    migration.library_from_attachments(apps, None)
    document = CaseDocument.objects.get()
    assert document.file.name == "evidence/1/a" and EvidenceFile.objects.filter(document=document).count() == 2


def upload_at(api, aid, file, qid="A1", code="NATIONAL_ID"):
    data = {"file": file, "qid": qid, "optionCode": code}
    return api.post(f"/api/assessments/{aid}/evidence", data, multipart=True)


def test_a_file_refused_with_the_form_locked_leaves_nothing_behind(applicant, opened, monkeypatch):
    """The checks repeated under the lock (the stage, the question's settings) can still refuse an
    upload: the file then goes into neither the question nor "Your documents"."""
    from rest_framework.exceptions import ValidationError

    from cases.views import evidence

    def refuse(*args, **kwargs):
        raise ValidationError({"qid": "This question is no longer on the form."})

    monkeypatch.setattr(evidence, "_still_takes", refuse)
    saved = []
    real_discard = evidence.discard_received
    monkeypatch.setattr(evidence, "discard_received", lambda received: (saved.append(received.file.name), real_discard(received)))
    assert upload_at(applicant, opened, pdf()).status_code == 400
    assert not CaseDocument.objects.exists() and not EvidenceFile.objects.exists()
    assert saved and not default_storage.exists(saved[0])


def test_the_library_is_closed_again_under_the_lock(applicant, opened, monkeypatch):
    """A submit committed while a library upload was on its way: the upload is refused."""
    from cases.views import evidence

    real_lock = evidence.lock

    def submitted_meanwhile(assessment):
        Assessment.objects.filter(pk=assessment.pk).update(stage=Stage.REVIEW_PENDING)
        return real_lock(assessment)

    monkeypatch.setattr(evidence, "lock", submitted_meanwhile)
    assert add(applicant, opened, pdf()).status_code == 409
    assert not CaseDocument.objects.exists()


def test_a_document_removed_meanwhile_is_not_attached(applicant, opened, monkeypatch):
    from cases.views import evidence

    doc = add(applicant, opened, pdf()).json()
    real_lock = evidence.lock

    def removed_meanwhile(assessment):
        CaseDocument.objects.filter(public_id=doc["id"]).delete()
        return real_lock(assessment)

    monkeypatch.setattr(evidence, "lock", removed_meanwhile)
    refused = attach(applicant, opened, doc["id"])
    assert refused.status_code == 400 and "documentId" in refused.json()
    assert not EvidenceFile.objects.exists()


def test_the_same_contents_uploaded_at_a_question_keep_their_new_name(applicant, opened):
    first = add(applicant, opened, pdf(1, "old name.pdf")).json()
    response = upload_at(applicant, opened, pdf(1, "Passport-2026.pdf"))
    assert response.status_code == 201
    assert response.json()["fileName"] == "Passport-2026.pdf" and response.json()["documentId"] == first["id"]
    # Still one document, one stored file.
    assert CaseDocument.objects.count() == 1
    assert set(EvidenceFile.objects.values_list("file", flat=True)) == {CaseDocument.objects.get().file.name}


def test_the_library_has_a_place_for_every_document_the_form_takes_and_some_spare(applicant, opened, settings):
    """However the applicant used "Your documents", every question can still take its documents."""
    from cases import catalogue

    settings.EVIDENCE_LIBRARY_MAX_FILES = 5
    case = Assessment.objects.get(public_id=opened)
    places = sum(q.max_files for q in catalogue.questions(catalogue.version_for(case).pk).values()) + 1
    assert applicant.get(f"/api/assessments/{opened}/form").json()["documentsMax"] == places + 5


def test_the_reviewer_sees_only_the_documents_attached_to_a_question(applicant, reviewer, opened):
    used = add(applicant, opened, pdf(1, "id.pdf")).json()
    add(applicant, opened, pdf(2, "uploaded by mistake.pdf"))
    attach(applicant, opened, used["id"])
    assert [d["fileName"] for d in library(applicant, opened)] == ["id.pdf", "uploaded by mistake.pdf"]
    assert [d["fileName"] for d in library(reviewer, opened)] == ["id.pdf"]


def test_removing_a_primary_from_the_library_takes_its_supporting_document_off_too(applicant, opened):
    applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"FC5": "Yes"}})
    primary = add(applicant, opened, pdf(1, "letter.pdf")).json()
    backing = add(applicant, opened, pdf(2, "bureau.pdf")).json()
    assert attach(applicant, opened, primary["id"], qid="FC5", code="BANK_REFERENCE_LETTER").status_code == 201
    assert attach(applicant, opened, backing["id"], qid="FC5", code="CREDIT_BUREAU_REPORT", role="supporting").status_code == 201
    assert applicant.delete(f"/api/assessments/{opened}/documents/{primary['id']}").status_code == 204
    # No supporting document is left on FC5 without its primary; it is back in "Your documents".
    assert not EvidenceFile.objects.filter(qid="FC5", superseded_at__isnull=True).exists()
    (left,) = library(applicant, opened)
    assert left["id"] == backing["id"] and left["usedBy"] == []


def test_how_long_a_case_has_waited_counts_from_when_it_reached_its_stage(reviewer):
    """Every action brings a case to the top of the queue; its "Waiting N days" still counts from
    when it reached its stage, so a ruling does not make an old case look new."""
    import datetime

    from cases import workflow
    from cases.models import QuestionResult

    case = make.assessment(public_id="FNP-2026-0950", reference="BL-WAIT", stage=Stage.REVIEW_PENDING)
    run = Submission.objects.create(assessment=case, attempt_no=1, version=case.version, payload={})
    QuestionResult.objects.create(submission=run, qid="PC1", status="issue")
    QuestionResult.objects.create(submission=run, qid="A1", status="issue")
    long_ago = datetime.datetime(2026, 1, 1, tzinfo=datetime.UTC)
    Assessment.objects.filter(pk=case.pk).update(stage_changed_at=long_ago, updated_at=long_ago)

    workflow.rule(Assessment.objects.get(pk=case.pk), "PC1", "accepted", "Fine", make.reviewer())
    (listed,) = reviewer.get("/api/assessments").json()["results"]
    assert listed["stageSince"].startswith("2026-01-01") and not listed["updatedAt"].startswith("2026-01-01")

    # Moving on to another stage starts the count again.
    workflow.rule(Assessment.objects.get(pk=case.pk), "A1", "rejected", "Unclear", make.reviewer())
    workflow.complete_review(Assessment.objects.get(pk=case.pk), make.reviewer())
    moved = Assessment.objects.get(pk=case.pk)
    assert moved.stage == Stage.AWAITING_APPLICANT and moved.stage_changed_at > long_ago


def test_a_document_is_new_by_its_contents_and_type_only():
    """Re-filed as another type it is new evidence; reworded or moved to another role it is not."""
    base = dict(sha256="ab", option_code="OTHER", role="primary", description="Old passport")
    same = EvidenceFile(**base).identity
    assert EvidenceFile(**{**base, "description": "Reworded"}).identity == same
    assert EvidenceFile(**{**base, "role": "supporting"}).identity == same
    assert EvidenceFile(**{**base, "option_code": "PASSPORT"}).identity != same
    assert EvidenceFile(**{**base, "sha256": "cd"}).identity != same


def test_the_stage_time_moves_only_when_the_stage_does():
    import datetime

    from cases import workflow

    case = make.assessment(public_id="FNP-2026-0960", reference="BL-STAGE", stage=Stage.REVIEW_PENDING)
    long_ago = datetime.datetime(2026, 1, 1, tzinfo=datetime.UTC)
    Assessment.objects.filter(pk=case.pk).update(stage_changed_at=long_ago)
    stamp = lambda: Assessment.objects.get(pk=case.pk).stage_changed_at  # noqa: E731

    # Any other save leaves it.
    Assessment.objects.get(pk=case.pk).save()
    assert stamp() == long_ago
    # Set to the stage it already has: not a move.
    held = Assessment.objects.get(pk=case.pk)
    held.save(update_fields=workflow.set_stage(held, Stage.REVIEW_PENDING))
    assert stamp() == long_ago
    # A real move.
    held.save(update_fields=workflow.set_stage(held, Stage.AWAITING_APPLICANT))
    assert stamp() > long_ago


def test_one_document_is_not_both_the_main_and_the_supporting_document(applicant, opened):
    applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"FC5": "Yes"}})
    doc = add(applicant, opened, pdf(1, "letter.pdf")).json()
    assert attach(applicant, opened, doc["id"], qid="FC5", code="BANK_REFERENCE_LETTER").status_code == 201
    refused = attach(applicant, opened, doc["id"], qid="FC5", code="CREDIT_BUREAU_REPORT", role="supporting")
    assert refused.status_code == 400 and "main document" in refused.json()["file"]
    # Nor as a new upload of the same contents.
    data = {"file": pdf(1, "copy.pdf"), "qid": "FC5", "optionCode": "CREDIT_BUREAU_REPORT", "role": "supporting"}
    assert applicant.post(f"/api/assessments/{opened}/evidence", data, multipart=True).status_code == 400
    assert EvidenceFile.objects.filter(qid="FC5", superseded_at__isnull=True).count() == 1


def test_a_draft_with_only_uploaded_documents_counts_as_started(applicant, opened):
    """Uploading everything first is how the form begins: the applicant's list says it is started."""
    def listed():
        return next(a for a in applicant.get("/api/assessments").json()["results"] if a["id"] == opened)

    assert listed()["hasDraft"] is False
    add(applicant, opened, pdf())
    assert listed()["hasDraft"] is True


def test_the_form_says_which_formats_the_library_takes(applicant, opened):
    from cases.views.evidence import LIBRARY_FILE_TYPES

    form = applicant.get(f"/api/assessments/{opened}/form").json()
    assert form["documentsFileTypes"] == LIBRARY_FILE_TYPES
    # Saving an answer returns the same form, library and all.
    doc = add(applicant, opened, pdf()).json()
    saved = applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"A1": "Yes"}}).json()
    assert [d["id"] for d in saved["documents"]] == [doc["id"]]
