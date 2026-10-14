"""manage.py reset_data: every user's data goes, the accounts and settings that run the app stay."""

from decimal import Decimal
from io import StringIO
from pathlib import Path

import pytest
from django.conf import settings
from django.contrib.sessions.models import Session
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.db import connection
from django.test import Client

from cases import audit
from cases.models import (
    AnswerValue,
    ApplicantProfile,
    Assessment,
    AuditEvent,
    Decision,
    Department,
    EvidenceFile,
    Question,
    QuestionnaireVersion,
    QuestionResult,
    Role,
    Ruling,
    Score,
    Stage,
    Submission,
    SubmissionDocument,
    User,
)
from cases.tests import factories as make

pytestmark = pytest.mark.django_db


@pytest.fixture
def everything():
    """A staff account, the built-in reviewer, two applicants and a full case: answers, a profile,
    a stored document, a run with its results, a ruling, a score, a decision and audit events."""
    staff = User.objects.create_superuser("ops@example.na", "a long test password")
    reviewer = make.reviewer()
    anna = make.user("anna@example.na")
    promoted = make.user("ben@example.na", Role.REVIEWER)  # an applicant given reviewer access
    case = make.assessment(applicant=anna, stage=Stage.ACCEPTED)
    AnswerValue.objects.create(assessment=case, qid="A1", value="Yes")
    ApplicantProfile.objects.create(assessment=case, town="Windhoek")
    doc = EvidenceFile(
        assessment=case, qid="A1", doc_type="national_id", option_code="NATIONAL_ID", original_name="id.pdf",
        content_type="application/pdf", size_bytes=4, sha256="0" * 64, uploaded_by=anna,
    )
    doc.file.save("id.pdf", ContentFile(b"%PDF"), save=True)
    run = Submission.objects.create(assessment=case, attempt_no=1, version=case.version, payload={})
    run.evidence_files.add(doc)
    SubmissionDocument.objects.create(submission=run, authentication={"x": 1})
    QuestionResult.objects.create(submission=run, qid="PC1", status="issue")
    Ruling.objects.create(submission=run, qid="PC1", verdict="accepted", comment="ok", reviewer=reviewer)
    Score.objects.create(
        submission=run, source="engine", risk_score=Decimal("10"), normalised=Decimal("0.1"), band="Moderate",
        knock_out=False, recommendation="Approve", lines=[],
    )
    Decision.objects.create(assessment=case, verdict="accepted", remarks="Fine.", reviewer=reviewer)
    audit.record(anna, "case.submit", assessment_ref=case.public_id)
    Client().force_login(anna)  # a live session
    # A document left on disk by an earlier removal, with no record.
    stray = Path(settings.MEDIA_ROOT) / "evidence" / "999" / "stray"
    stray.parent.mkdir(parents=True, exist_ok=True)
    stray.write_bytes(b"old")
    return {"staff": staff, "reviewer": reviewer, "anna": anna, "promoted": promoted, "doc": doc, "stray": stray}


def run(*args) -> str:
    out = StringIO()
    call_command("reset_data", *args, stdout=out)
    return out.getvalue()


def test_without_confirm_it_only_reports(everything):
    report = run()
    assert "Would remove:" in report and "Nothing was changed" in report
    assert "      2  users" in report and "      2  uploaded documents (files on disk)" in report
    assert "Keeping accounts: admin, ops@example.na" in report
    assert Assessment.objects.count() == 1 and User.objects.count() == 4
    assert Path(everything["doc"].file.path).exists() and everything["stray"].exists()


def test_confirm_removes_all_user_data_and_files(everything):
    path = Path(everything["doc"].file.path)
    report = run("--confirm")
    assert "Done." in report
    for model in (Assessment, AnswerValue, ApplicantProfile, EvidenceFile, Submission, SubmissionDocument,
                  QuestionResult, Ruling, Score, Decision, AuditEvent, Session):
        assert not model.objects.exists(), model.__name__
    assert not path.exists() and not everything["stray"].exists()
    evidence = Path(settings.MEDIA_ROOT) / "evidence"
    assert not any(evidence.rglob("*"))  # no file, and no empty folder, left


def test_the_accounts_and_settings_that_run_the_app_are_kept(everything):
    departments, versions, questions = Department.objects.count(), QuestionnaireVersion.objects.count(), Question.objects.count()
    run("--confirm")
    assert set(User.objects.values_list("email", flat=True)) == {"ops@example.na", "admin"}
    staff = User.objects.get(email="ops@example.na")
    assert staff.is_staff and staff.check_password("a long test password")
    assert (Department.objects.count(), QuestionnaireVersion.objects.count(), Question.objects.count()) == (
        departments, versions, questions)
    # The admin site still signs in.
    assert Client().login(username="ops@example.na", password="a long test password")


def test_case_numbering_carries_on(everything):
    with connection.cursor() as cur:
        cur.execute("SELECT nextval('assessment_serial')")  # the number the last case was given
        last = cur.fetchone()[0]
    run("--confirm")
    with connection.cursor() as cur:
        cur.execute("SELECT nextval('assessment_serial')")
        assert cur.fetchone()[0] == last + 1  # not back to the start: no id is used twice


def test_an_empty_database_is_fine():
    assert "Done." in run("--confirm")
