import datetime
import io
import uuid
import zipfile

import pytest
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile

from django.db import connection
from django.test.utils import CaptureQueriesContext

from cases.models import (
    ApplicantProfile, Assessment, AuditEvent, EvidenceFile, QuestionnaireVersion, QuestionResult, Ruling, Stage,
    Submission, User,
)
from cases.tests import factories as make
from engine.client import EngineUnavailable

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("engine_options")]

PDF = b"%PDF-1.7\n%test document\n"
NEW = {
    "applicantName": "Anna M. Nghipandulwa",
    "email": "A.Nghipandulwa@Example.NA",
    "entity": "Namib Trust Bank Limited",
    "position": "Non-Executive Director",
    "reference": "BL-2026-0510",
    "initiatedOn": "2026-10-01",
    "department": "banking",
}


def pdf(name="document.pdf", content=PDF):
    return SimpleUploadedFile(name, content, content_type="application/pdf")


@pytest.fixture
def reviewer(as_user):
    return as_user(make.reviewer())


@pytest.fixture
def applicant(as_user):
    return as_user(make.user("a.nghipandulwa@example.na"))


@pytest.fixture
def opened(reviewer, applicant):
    """An assessment the reviewer opened for the applicant."""
    return reviewer.post("/api/assessments", NEW).json()["id"]


# ---- Catalogue -------------------------------------------------------------------------------

def test_catalogue_serves_the_question_set_and_engine_options(applicant):
    body = applicant.get("/api/catalogue").json()
    assert body["version"] == "v1"
    assert [q["qid"] for q in body["questions"]][:3] == ["A1", "A4", "Q1"]
    assert sum(q["weight"] for q in body["questions"]) == 100
    assert {"CV", "A1", "FC5"} <= set(body["evidenceOptions"])
    assert "cv_verification" not in body["evidenceOptions"]


def test_catalogue_reports_an_unavailable_engine_as_503(applicant, monkeypatch):
    from engine import client

    def down():
        raise EngineUnavailable("down")

    monkeypatch.setattr(client, "evidence_options", down)
    response = applicant.get("/api/catalogue")
    assert response.status_code == 503
    assert "engine.invalid" not in response.content.decode()


def test_catalogue_needs_a_session():
    from rest_framework.test import APIClient

    # 401, not 403: the frontend sends the user back to sign in when a session has ended.
    assert APIClient().get("/api/catalogue").status_code == 401


# ---- Opening, listing and removing assessments ------------------------------------------------

def test_reviewer_opens_an_assessment(reviewer):
    response = reviewer.post("/api/assessments", NEW)
    assert response.status_code == 201
    body = response.json()
    assert body["id"].startswith("FNP-2026-1")
    assert body["applicantEmail"] == "a.nghipandulwa@example.na"
    assert body["stage"] == "NOT_SUBMITTED" and body["removable"] is True and body["hasDraft"] is False
    assert AuditEvent.objects.filter(action="assessment.create", assessment_ref=body["id"]).exists()


@pytest.mark.parametrize("change, field", [
    ({"email": "not-an-email"}, "email"),
    ({"initiatedOn": "2999-01-01"}, "initiatedOn"),
    ({"initiatedOn": "2026-02-30"}, "initiatedOn"),
    ({"applicantName": ""}, "applicantName"),
    ({"email": "admin"}, "email"),
])
def test_opening_validates_every_field(reviewer, change, field):
    response = reviewer.post("/api/assessments", {**NEW, **change})
    assert response.status_code == 400 and field in response.json()


def test_a_reference_can_only_be_assessed_once_whatever_its_case(reviewer, opened):
    response = reviewer.post("/api/assessments", {**NEW, "reference": " bl-2026-0510 ".strip()})
    assert response.status_code == 400 and "reference" in response.json()


def test_one_email_may_hold_several_assessments(reviewer, opened):
    assert reviewer.post("/api/assessments", {**NEW, "reference": "BL-2026-0511"}).status_code == 201


OWN = {
    "applicantName": "Anna M. Nghipandulwa",
    "entity": "Kalahari Life Assurance",
    "position": "Chief Risk Officer",
    "reference": "IS-2026-0042",
    "department": "insurance",
}


def test_departments_are_listed_for_the_application_form(applicant):
    departments = applicant.get("/api/departments").json()
    assert [d["key"] for d in departments] == ["banking", "education", "insurance", "microfinance", "payments", "markets"]
    assert departments[2] == {"key": "insurance", "name": "Insurance Supervision", "blurb": "Long and short term insurers"}


def test_an_applicant_starts_their_own_application(applicant):
    # Any email in the body is ignored: an applicant can only apply as themselves.
    body = applicant.post("/api/assessments", {**OWN, "email": "someone.else@example.na", "initiatedOn": "2020-01-01"}).json()
    assert body["applicantEmail"] == applicant.user.email
    assert body["department"]["key"] == "insurance" and body["initiatedOn"] == datetime.date.today().isoformat()
    assert body["startedByApplicant"] is True and body["removable"] is True and body["stage"] == "NOT_SUBMITTED"
    assessment = Assessment.objects.get(public_id=body["id"])
    assert assessment.created_by == applicant.user and not User.objects.filter(email="someone.else@example.na").exists()
    assert [a["id"] for a in applicant.get("/api/assessments").json()["results"]] == [body["id"]]


def test_the_department_must_be_one_of_the_list(applicant, reviewer):
    for bad in ({**OWN, "department": "space"}, {k: v for k, v in OWN.items() if k != "department"}):
        assert "department" in applicant.post("/api/assessments", bad).json()
    assert "department" in reviewer.post("/api/assessments", {**NEW, "department": "space"}).json()


def test_an_applicant_has_at_most_three_applications_not_yet_submitted(applicant, opened):
    for n in range(3):
        assert applicant.post("/api/assessments", {**OWN, "reference": f"IS-2026-010{n}"}).status_code == 201
    refused = applicant.post("/api/assessments", {**OWN, "reference": "IS-2026-0109"})
    assert refused.status_code == 409 and "3 applications" in refused.json()["detail"]
    # The one the reviewer opened for them does not count against the limit.
    assert Assessment.objects.filter(applicant=applicant.user).count() == 4


def test_who_may_remove_an_application(as_user, applicant, reviewer, opened):
    own = applicant.post("/api/assessments", OWN).json()["id"]
    other = as_user(make.user("other@example.na"))
    assert other.delete(f"/api/assessments/{own}").status_code == 404
    # The applicant may not remove one the reviewer opened for them, and is told so.
    assert applicant.get(f"/api/assessments/{opened}").json()["removable"] is False
    assert applicant.delete(f"/api/assessments/{opened}").status_code == 403
    assert reviewer.get(f"/api/assessments/{own}").json()["removable"] is True
    assert applicant.delete(f"/api/assessments/{own}").status_code == 204
    assert not Assessment.objects.filter(public_id=own).exists()


def test_the_queue_can_be_filtered_to_one_department(applicant, reviewer, opened):
    own = applicant.post("/api/assessments", OWN).json()["id"]
    Assessment.objects.update(stage=Stage.AUTH_RUNNING)  # the queue lists submitted ones
    insurance = reviewer.get("/api/assessments", department="insurance").json()["results"]
    assert [a["id"] for a in insurance] == [own]
    assert [a["id"] for a in reviewer.get("/api/assessments", department="banking").json()["results"]] == [opened]
    assert reviewer.get("/api/assessments", department="space").status_code == 400


def test_applicant_lists_only_their_own(as_user, applicant, opened):
    other = as_user(make.user("other@example.na"))
    assert [a["id"] for a in applicant.get("/api/assessments").json()["results"]] == [opened]
    assert other.get("/api/assessments").json()["results"] == []
    assert other.get(f"/api/assessments/{opened}").status_code == 404


def _with_a_flagged_run(assessment):
    run = Submission.objects.create(assessment=assessment, attempt_no=1, version=assessment.version, payload={})
    QuestionResult.objects.create(submission=run, qid="PC1", status="issue")
    Ruling.objects.create(submission=run, qid="PC1", verdict="rejected", comment="x", reviewer=make.reviewer())


def test_reviewer_queue_is_keyset_paginated_with_a_fixed_number_of_queries(reviewer):
    _with_a_flagged_run(make.assessment(public_id="FNP-2026-9999", reference="BL-X-SMALL", stage=Stage.ACCEPTED))
    with CaptureQueriesContext(connection) as small:
        reviewer.get("/api/assessments")
    for i in range(55):
        assessment = make.assessment(public_id=f"FNP-2026-{i:04d}", reference=f"BL-X-{i}", stage=Stage.ACCEPTED)
        if i % 5 == 0:
            _with_a_flagged_run(assessment)
    with CaptureQueriesContext(connection) as large:
        first = reviewer.get("/api/assessments").json()
    # The same number of queries for 1 assessment as for a page of 50 (no query per row).
    assert len(large) == len(small)
    flagged = next(a for a in first["results"] if a["queue"]["flagged"])
    assert flagged["queue"] == {"flagged": ["PC1"], "openFlags": 0, "rejected": ["PC1"], "decisionRemarks": None}
    assert len(first["results"]) == 50 and first["next"]
    second = reviewer.get("/api/assessments", cursor=first["next"]).json()
    assert len(second["results"]) == 6 and second["next"] is None
    ids = [a["id"] for a in first["results"] + second["results"]]
    assert len(set(ids)) == 56
    assert reviewer.get("/api/assessments", stage="REJECTED").json()["results"] == []
    assert reviewer.get("/api/assessments", stage="NOPE").status_code == 400


def test_reviewer_removes_only_an_assessment_they_opened_before_submission(
    reviewer, applicant, opened, django_capture_on_commit_callbacks
):
    built_in = make.assessment(public_id="FNP-2026-0412", reference="BL-2026-0412")
    assert reviewer.delete(f"/api/assessments/{built_in.public_id}").status_code == 409
    assert applicant.delete(f"/api/assessments/{opened}").status_code == 403

    applicant.post(f"/api/assessments/{opened}/evidence", {"file": pdf(), "qid": "CV", "optionCode": "CURRICULUM_VITAE"}, multipart=True)
    stored = EvidenceFile.objects.get().file.name
    # Files are deleted only once the removal commits.
    with django_capture_on_commit_callbacks(execute=True):
        assert reviewer.delete(f"/api/assessments/{opened}").status_code == 204
    assert reviewer.get(f"/api/assessments/{opened}").status_code == 404
    assert not default_storage.exists(stored)
    assert AuditEvent.objects.filter(action="assessment.remove", assessment_ref=opened).exists()


def test_a_submitted_assessment_cannot_be_removed(reviewer, opened):
    type(make.assessment()).objects.filter(public_id=opened).update(stage=Stage.AUTH_RUNNING)
    assert reviewer.delete(f"/api/assessments/{opened}").status_code == 409


# ---- The applicant's form ---------------------------------------------------------------------

def test_a_new_form_starts_with_no_and_the_name_from_the_record(applicant, opened):
    form = applicant.get(f"/api/assessments/{opened}/form").json()
    assert form["locked"] is False
    assert applicant.get(f"/api/assessments/{opened}").json()["hasDraft"] is False
    assert form["applicant"]["fullName"] == "Anna M. Nghipandulwa"
    # Personal details are not collected, so none are part of the form.
    assert set(form["applicant"]) == {"fullName", "email", "proposedRole"}
    assert {a["value"] for a in form["answers"]} == {"No"}
    a1 = next(a for a in form["answers"] if a["qid"] == "A1")
    assert a1["evidenceRequired"] is True  # A1 always needs its document


def test_answers_save_and_personal_details_are_refused(applicant, opened):
    refused = applicant.patch(f"/api/assessments/{opened}/form", {
        "answers": {"A4": "Yes"}, "applicant": {"nationalIdNumber": "70050400111"},
    })
    assert refused.status_code == 400 and "applicant" in refused.json()
    assert not ApplicantProfile.objects.exists()
    response = applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"A4": "Yes"}})
    assert response.status_code == 200
    body = response.json()
    assert next(a for a in body["answers"] if a["qid"] == "A4") == {
        "qid": "A4", "value": "Yes", "evidenceRequired": True, "evidenceRule": "if_yes",
        "allowedAnswers": ["Yes", "No"], "fileTypes": ["pdf"], "maxFiles": 1,
    }
    assert applicant.get(f"/api/assessments/{opened}").json()["hasDraft"] is True


def test_an_invalid_field_saves_nothing_and_names_every_problem(applicant, opened):
    response = applicant.patch(f"/api/assessments/{opened}/form", {
        "answers": {"A1": "Maybe", "ZZ": "Yes", "A4": "Yes"},
    })
    assert response.status_code == 400
    assert set(response.json()) == {"answers.A1", "answers.ZZ"}
    form = applicant.get(f"/api/assessments/{opened}/form").json()
    assert next(a for a in form["answers"] if a["qid"] == "A4")["value"] == "No"


def test_n_a_is_only_accepted_where_the_question_allows_it(applicant, opened):
    assert applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"A1": "N/A"}}).status_code == 400
    assert applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"T2": "N/A"}}).status_code == 200


def test_reviewer_reads_but_cannot_change_the_form(reviewer, opened):
    assert reviewer.get(f"/api/assessments/{opened}/form").status_code == 200
    assert reviewer.patch(f"/api/assessments/{opened}/form", {"answers": {"A4": "Yes"}}).status_code == 403


def test_a_submitted_form_is_locked(applicant, opened):
    type(make.assessment()).objects.filter(public_id=opened).update(stage=Stage.AUTH_RUNNING)
    assert applicant.get(f"/api/assessments/{opened}/form").json()["locked"] is True
    assert applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"A4": "Yes"}}).status_code == 409
    assert applicant.post(f"/api/assessments/{opened}/form/reset").status_code == 409


def test_reset_starts_the_form_over(applicant, opened):
    applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"A4": "Yes"}})
    applicant.post(f"/api/assessments/{opened}/evidence", {"file": pdf(), "qid": "A1", "optionCode": "NATIONAL_ID"}, multipart=True)
    form = applicant.post(f"/api/assessments/{opened}/form/reset").json()
    assert {a["value"] for a in form["answers"]} == {"No"}
    assert form["evidence"] == []


# ---- Evidence ---------------------------------------------------------------------------------

def upload(api, assessment_id, **fields):
    data = {"file": pdf(), "qid": "A1", "optionCode": "NATIONAL_ID", **fields}
    return api.post(f"/api/assessments/{assessment_id}/evidence", data, multipart=True)


def test_an_upload_while_the_engine_is_unreachable_is_a_503(monkeypatch, applicant, opened):
    from engine import client

    def down():
        raise EngineUnavailable("down")

    monkeypatch.setattr(client, "evidence_options", down)
    response = upload(applicant, opened)
    assert response.status_code == 503 and not EvidenceFile.objects.exists()


def test_reviewer_queue_pages_cases_needing_the_reviewer_first_and_counts_the_whole_queue(reviewer):
    for i in range(55):
        make.assessment(public_id=f"FNP-2026-{i:04d}", reference=f"BL-Q-{i}", stage=Stage.ACCEPTED)
    # Needs the reviewer, but last changed long before everything else: newest-first paging alone
    # would leave it on the second page.
    waiting = make.assessment(public_id="FNP-2026-0900", reference="BL-Q-WAIT", stage=Stage.REVIEW_PENDING)
    Assessment.objects.filter(pk=waiting.pk).update(updated_at=datetime.datetime(2020, 1, 1, tzinfo=datetime.UTC))

    first = reviewer.get("/api/assessments").json()
    assert first["results"][0]["id"] == "FNP-2026-0900"
    assert (first["total"], first["actionable"]) == (56, 1)
    second = reviewer.get("/api/assessments", cursor=first["next"]).json()
    assert (second["total"], second["actionable"]) == (56, 1) and second["next"] is None
    ids = [a["id"] for a in first["results"] + second["results"]]
    assert len(ids) == len(set(ids)) == 56
    # Newest activity first within a stage.
    stamps = [a["updatedAt"] for a in first["results"][1:] + second["results"]]
    assert stamps == sorted(stamps, reverse=True)


def test_the_queue_lists_only_submitted_assessments(applicant, reviewer, opened):
    own = applicant.post("/api/assessments", OWN).json()["id"]
    # Neither the applicant's own draft nor the one the reviewer opened is in the queue yet.
    body = reviewer.get("/api/assessments").json()
    assert body["results"] == [] and (body["total"], body["actionable"]) == (0, 0)
    # Asked for, the ones not submitted yet are listed, with their own totals.
    drafts = reviewer.get("/api/assessments", stage="NOT_SUBMITTED").json()
    assert {a["id"] for a in drafts["results"]} == {own, opened} and drafts["total"] == 2
    # Once submitted, it is listed, and it stays listed through every later stage.
    Assessment.objects.filter(public_id=own).update(stage=Stage.AUTH_RUNNING)
    assert [a["id"] for a in reviewer.get("/api/assessments").json()["results"]] == [own]
    Assessment.objects.filter(public_id=own).update(stage=Stage.ACCEPTED)
    assert reviewer.get("/api/assessments").json()["total"] == 1
    # The reviewer can still open an unsubmitted one directly, and the applicant still lists theirs.
    assert reviewer.get(f"/api/assessments/{opened}").status_code == 200
    assert {a["id"] for a in applicant.get("/api/assessments").json()["results"]} == {own, opened}


def test_a_malformed_cursor_is_a_bad_request(reviewer):
    import base64

    for raw in (
        "9999-12-31T23:59:59-23:59|1",
        "0001-01-01T00:00:00+23:59|1",
        "2026-01-01T00:00:00|1",
        "x|y",
        "!!",
        "0|9999-12-31T23:59:59-23:59|1",
        "0|2026-01-01T00:00:00|1",
        "99|2026-01-01T00:00:00+00:00|1",
        "-1|2026-01-01T00:00:00+00:00|1",
        "x|2026-01-01T00:00:00+00:00|1",
    ):
        cursor = base64.urlsafe_b64encode(raw.encode()).decode()
        assert reviewer.get("/api/assessments", cursor=cursor).status_code == 400


def test_form_changes_of_the_wrong_shape_are_refused(applicant, opened):
    for body in ({"answers": ["A1"]}, {"answers": "x"}, {"applicant": ["x"]}, {"applicant": "x"}):
        assert applicant.patch(f"/api/assessments/{opened}/form", body).status_code == 400


def test_a_damaged_office_document_is_refused_not_a_server_error(applicant, opened):
    # A zip whose directory claims a compression method it does not support.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", "<x/>")
        z.writestr("word/document.xml", "<x/>")
    data = bytearray(buf.getvalue())
    central = data.rfind(b"PK")
    data[central + 6] = 99  # "version needed to extract": far beyond what zipfile supports
    data[central + 7] = 99
    applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"A4": "Yes"}})
    response = upload(applicant, opened, qid="CV", optionCode="CURRICULUM_VITAE", file=pdf("cv.docx", bytes(data)))
    assert response.status_code == 400


def test_an_upload_declared_too_large_is_refused_before_it_is_read(applicant, opened):
    response = applicant.client.post(
        f"/api/assessments/{opened}/evidence", {"file": pdf(), "qid": "A1", "optionCode": "NATIONAL_ID"},
        HTTP_X_CSRFTOKEN=applicant.csrf, CONTENT_LENGTH=str(100 * 1024 * 1024),
    )
    assert response.status_code == 413 and "MB or smaller" in response.json()["file"][0]


def test_a_valid_document_is_stored_and_served_back(applicant, reviewer, opened):
    response = upload(applicant, opened)
    assert response.status_code == 201
    item = response.json()
    assert item["docType"] == "national_id" and item["fileName"] == "document.pdf"
    stored = EvidenceFile.objects.get()
    assert stored.file.name.startswith(f"evidence/{stored.assessment_id}/") and "document" not in stored.file.name
    for api in (applicant, reviewer):
        download = api.get(item["url"])
        assert download.status_code == 200 and b"".join(download.streaming_content) == PDF
        assert download["Content-Type"] == "application/pdf"
        assert download["Cache-Control"] == "private, no-store"


@pytest.mark.parametrize("file, message", [
    (SimpleUploadedFile("id.docx", b"PK\x03\x04", content_type="application/pdf"), "accepts PDF"),
    (SimpleUploadedFile("id.pdf", b"MZ\x90\x00 not a pdf"), "not a valid PDF"),
    (SimpleUploadedFile("id.pdf", b""), "empty"),
    (SimpleUploadedFile("id", PDF), "accepts PDF"),
])
def test_files_are_checked_by_type_and_content(applicant, opened, file, message):
    response = upload(applicant, opened, file=file)
    assert response.status_code == 400 and message in response.json()["file"]


def test_files_over_the_limit_are_refused(applicant, opened, settings):
    settings.EVIDENCE_MAX_BYTES = 10
    assert "MB or smaller" in upload(applicant, opened).json()["file"]


def test_office_files_must_really_be_office_files(applicant, opened):
    applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"FC5": "Yes"}})
    upload(applicant, opened, qid="FC5", optionCode="BANK_REFERENCE_LETTER")
    plain_zip = io.BytesIO()
    with zipfile.ZipFile(plain_zip, "w") as z:
        z.writestr("readme.txt", "not a spreadsheet")
    fake = SimpleUploadedFile("report.xlsx", plain_zip.getvalue())
    response = upload(applicant, opened, qid="FC5", optionCode="CREDIT_BUREAU_REPORT", role="supporting", file=fake)
    assert response.status_code == 400 and "not a valid XLSX" in response.json()["file"]


def test_document_rules_follow_the_question(applicant, opened):
    # A4 answered No needs no document.
    assert "does not need a document" in upload(applicant, opened, qid="A4", optionCode="NATURALISATION_CERTIFICATE").json()["qid"]
    assert "document type" in upload(applicant, opened, optionCode="NOT_AN_OPTION").json()["optionCode"]
    assert "Describe" in upload(applicant, opened, optionCode="OTHER").json()["description"]
    # A1 takes a single document, and a supporting one needs a primary first.
    assert "single document" in upload(applicant, opened, role="supporting").json()["role"]
    applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"FC5": "Yes"}})
    response = upload(applicant, opened, qid="FC5", optionCode="CREDIT_BUREAU_REPORT", role="supporting")
    assert "main document first" in response.json()["role"]


def test_a_new_document_replaces_the_old_one_in_its_slot(applicant, opened, django_capture_on_commit_callbacks):
    upload(applicant, opened)
    first = EvidenceFile.objects.get().file.name
    with django_capture_on_commit_callbacks(execute=True):
        upload(applicant, opened, optionCode="PASSPORT")
    assert EvidenceFile.objects.get().doc_type == "passport"
    assert not default_storage.exists(first)


def test_removing_the_primary_takes_its_supporting_document(applicant, opened):
    applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"FC5": "Yes"}})
    primary = upload(applicant, opened, qid="FC5", optionCode="BANK_REFERENCE_LETTER").json()
    upload(applicant, opened, qid="FC5", optionCode="CREDIT_BUREAU_REPORT", role="supporting")
    assert applicant.delete(f"/api/assessments/{opened}/evidence/{primary['id']}").status_code == 204
    assert not EvidenceFile.objects.exists()


def test_a_new_primary_replaces_its_supporting_document_too(applicant, opened):
    applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"FC5": "Yes"}})
    upload(applicant, opened, qid="FC5", optionCode="BANK_REFERENCE_LETTER")
    upload(applicant, opened, qid="FC5", optionCode="CREDIT_BUREAU_REPORT", role="supporting")
    replacement = upload(applicant, opened, qid="FC5", optionCode="BANK_REFERENCE_LETTER").json()
    assert list(EvidenceFile.objects.values_list("public_id", flat=True)) == [uuid.UUID(replacement["id"])]


def test_no_empty_folder_is_left_behind(settings, applicant, reviewer, opened, django_capture_on_commit_callbacks):
    from pathlib import Path

    applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"FC5": "Yes"}})
    primary = upload(applicant, opened, qid="FC5", optionCode="BANK_REFERENCE_LETTER").json()
    upload(applicant, opened)  # A1, so the folder still holds a document after FC5 goes
    folder = Path(settings.MEDIA_ROOT) / Path(EvidenceFile.objects.first().file.name).parent
    with django_capture_on_commit_callbacks(execute=True):
        applicant.delete(f"/api/assessments/{opened}/evidence/{primary['id']}")
    assert folder.is_dir()  # another document is still in it
    with django_capture_on_commit_callbacks(execute=True):
        reviewer.delete(f"/api/assessments/{opened}")
    assert not folder.exists()  # the assessment's last document went, and its folder with it


def test_changing_an_answer_drops_a_document_it_no_longer_needs(applicant, opened):
    applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"A4": "Yes"}})
    upload(applicant, opened, qid="A4", optionCode="NATURALISATION_CERTIFICATE")
    form = applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"A4": "No"}}).json()
    assert form["evidence"] == [] and not EvidenceFile.objects.exists()


def test_other_people_cannot_reach_documents(as_user, applicant, reviewer, opened):
    item = upload(applicant, opened).json()
    stranger = as_user(make.user("stranger@example.na"))
    assert stranger.get(item["url"]).status_code == 404
    assert stranger.delete(f"/api/assessments/{opened}/evidence/{item['id']}").status_code == 404
    assert reviewer.delete(f"/api/assessments/{opened}/evidence/{item['id']}").status_code == 403


# ---- Question settings ------------------------------------------------------------------------

def test_reviewer_publishes_new_settings_as_a_new_version(reviewer, applicant, opened):
    current = reviewer.get("/api/questionnaire").json()["current"]
    assert current["version"] == "v1"
    response = reviewer.put("/api/questionnaire", {"version": "v1", "questions": {
        "A1": {"allowedAnswers": ["Yes", "No", "N/A"], "fileTypes": ["png", "pdf"], "maxFiles": 1},
    }})
    assert response.status_code == 200
    body = response.json()
    assert body["version"] == "v2"
    a1 = next(q for q in body["questions"] if q["qid"] == "A1")
    assert a1["allowedAnswers"] == ["Yes", "No", "N/A"] and a1["fileTypes"] == ["pdf", "png"]
    # Unsubmitted forms follow the new version straight away.
    assert applicant.patch(f"/api/assessments/{opened}/form", {"answers": {"A1": "N/A"}}).status_code == 200
    assert reviewer.get("/api/questionnaire").json()["published"]["version"] == "v1"


def test_saving_identical_settings_publishes_nothing(reviewer):
    a1 = {"allowedAnswers": ["No", "Yes"], "fileTypes": ["pdf"], "maxFiles": 1}
    assert reviewer.put("/api/questionnaire", {"version": "v1", "questions": {"A1": a1}}).json()["version"] == "v1"


def test_settings_edited_from_a_replaced_version_are_refused(reviewer):
    a1 = {"allowedAnswers": ["Yes", "No"], "fileTypes": ["pdf", "png"], "maxFiles": 1}
    assert reviewer.put("/api/questionnaire", {"version": "v1", "questions": {"A1": a1}}).json()["version"] == "v2"
    # A second reviewer still editing v1 is told, and their save publishes nothing.
    stale = reviewer.put("/api/questionnaire", {"version": "v1", "questions": {"A1": {**a1, "maxFiles": 2}}})
    assert stale.status_code == 409
    assert QuestionnaireVersion.objects.count() == 2
    assert reviewer.put("/api/questionnaire", {"questions": {"A1": a1}}).status_code == 400


def test_question_settings_are_validated_and_reviewer_only(reviewer, applicant):
    bad = {"version": "v1", "questions": {"A1": {"allowedAnswers": [], "fileTypes": ["exe"], "maxFiles": 3}, "ZZ": {}}}
    response = reviewer.put("/api/questionnaire", bad)
    assert response.status_code == 400 and set(response.json()) == {"A1", "ZZ"}
    assert applicant.get("/api/questionnaire").status_code == 403


def _settings(version: dict, qid: str, **change) -> dict:
    q = next(q for q in version["questions"] if q["qid"] == qid)
    return {"allowedAnswers": q["allowedAnswers"], "fileTypes": q["fileTypes"], "maxFiles": q["maxFiles"], **change}


def test_question_weights_can_be_shared_differently_within_a_fixed_section_weight(reviewer):
    current = reviewer.get("/api/questionnaire").json()["current"]
    response = reviewer.put("/api/questionnaire", {"version": "v1", "questions": {
        "CoI2": _settings(current, "CoI2", weight=7.5), "CoI6": _settings(current, "CoI6", weight=6.5),
    }})
    assert response.status_code == 200
    body = response.json()
    weights = {q["qid"]: q["weight"] for q in body["questions"]}
    assert body["version"] == "v2" and weights["CoI2"] == 7.5 and weights["CoI6"] == 6.5
    # The section weights, and so the total, are unchanged.
    assert body["sections"] == current["sections"]
    assert sum(weights.values()) == sum(s["weight"] for s in current["sections"])
    event = AuditEvent.objects.get(action="questionnaire.publish")
    assert event.metadata == {"changed": ["CoI2", "CoI6"]}


def test_question_weights_that_do_not_add_up_to_the_section_weight_are_refused(reviewer):
    current = reviewer.get("/api/questionnaire").json()["current"]
    over = reviewer.put("/api/questionnaire", {"version": "v1", "questions": {"CoI2": _settings(current, "CoI2", weight=6)}})
    assert over.status_code == 400
    message = over.json()["sections"]["Conflict of interest. (Entity/Enterprise based)"]
    assert "add up to 15" in message and "section weight, 14" in message
    negative = reviewer.put("/api/questionnaire", {"version": "v1", "questions": {"CoI2": _settings(current, "CoI2", weight=-1)}})
    assert negative.status_code == 400 and "CoI2" in negative.json()
    assert QuestionnaireVersion.objects.count() == 1


def test_initiated_on_today_is_allowed(reviewer):
    today = datetime.date.today().isoformat()
    assert reviewer.post("/api/assessments", {**NEW, "initiatedOn": today}).status_code == 201


def test_a_section_weight_total_of_zero_is_reported_not_a_server_error():
    from decimal import Decimal
    from types import SimpleNamespace

    from cases.models import QuestionSection
    from cases.views.catalogue import _section_weight_errors

    current = QuestionnaireVersion.objects.get(is_active=True)
    section = QuestionSection.objects.create(version=current, name="Empty", weight=Decimal("5"), position=99)
    # Its one question's weight changed to 0: the total is 0, reported, not an error in the check.
    question = SimpleNamespace(qid="X", section_id=section.pk, weight=Decimal("2"))
    errors = _section_weight_errors([section], {"X": question}, {"X": Decimal("0")})
    assert "add up to 0" in errors["Empty"]


def test_other_settings_save_although_stored_weights_do_not_add_up(reviewer):
    from cases.models import Question

    # A rounding difference in the stored weights (13.99 against a section weight of 14).
    current = QuestionnaireVersion.objects.get(is_active=True)
    Question.objects.filter(version=current, qid="CoI2").update(weight="4.99")
    q = reviewer.get("/api/questionnaire").json()["current"]
    a1 = next(x for x in q["questions"] if x["qid"] == "A1")
    coi2 = next(x for x in q["questions"] if x["qid"] == "CoI2")
    body = {"version": current.label, "questions": {
        # Only A1's file types change; every weight is sent back as it is.
        "A1": {"allowedAnswers": a1["allowedAnswers"], "fileTypes": ["pdf", "png"], "maxFiles": a1["maxFiles"], "weight": a1["weight"]},
        "CoI2": {"allowedAnswers": coi2["allowedAnswers"], "fileTypes": coi2["fileTypes"], "maxFiles": coi2["maxFiles"], "weight": coi2["weight"]},
    }}
    response = reviewer.put("/api/questionnaire", body)
    assert response.status_code == 200, response.json()
