import io

import pytest
from django.core.management import CommandError, call_command

from cases.models import AnswerValue, ApplicantProfile, Assessment, Decision, EvidenceFile, Submission
from cases.tests import factories as make

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("engine_options")]


def seed(*args):
    call_command("seed_demo", *args, stdout=io.StringIO())


def test_seeds_the_five_demo_applicants_from_test_data():
    seed()
    assert sorted(Assessment.objects.values_list("public_id", flat=True)) == [
        "FNP-2026-0233", "FNP-2026-0289", "FNP-2026-0398", "FNP-2026-0412", "FNP-2026-0455",
    ]
    assert not Assessment.objects.exclude(stage="NOT_SUBMITTED").exists()
    assert not Assessment.objects.exclude(created_by=None).exists()  # built-in: not removable
    app004 = Assessment.objects.get(public_id="FNP-2026-0398")
    assert app004.applicant.email == "m.vanwyk@example.na"
    assert ApplicantProfile.objects.get(pk=app004.pk).national_id_number == "72012700462"
    assert AnswerValue.objects.filter(assessment=app004, value="Yes").count() == 11
    assert EvidenceFile.objects.count() == 55
    supporting = EvidenceFile.objects.get(assessment=app004, qid="FC5", role="supporting")
    assert supporting.doc_type == "credit_bureau_report" and supporting.option_code == "CREDIT_BUREAU_REPORT"
    assert EvidenceFile.objects.filter(qid="CV").count() == 5


def test_running_it_again_changes_nothing():
    seed()
    seed()
    assert Assessment.objects.count() == 5 and EvidenceFile.objects.count() == 55


def test_reset_removes_case_records_too_but_only_in_development(settings):
    seed()
    assessment = Assessment.objects.get(public_id="FNP-2026-0412")
    submission = Submission.objects.create(assessment=assessment, attempt_no=1, version=assessment.version, payload={})
    Decision.objects.create(assessment=assessment, verdict="accepted", remarks="ok", reviewer=make.reviewer())
    assert submission.pk

    settings.DEBUG = False
    with pytest.raises(CommandError, match="only runs with DJANGO_DEBUG"):
        seed("--reset")

    settings.DEBUG = True
    seed("--reset")
    assert Assessment.objects.count() == 5
    assert not Submission.objects.exists() and not Decision.objects.exists()


def test_a_missing_test_data_folder_is_reported(tmp_path):
    with pytest.raises(CommandError, match="no form_data"):
        seed("--data", str(tmp_path))


def test_a_reset_that_fails_partway_leaves_the_existing_cases_and_files_untouched(settings, tmp_path):
    import shutil

    from django.conf import settings as conf
    from django.core.files.storage import default_storage

    seed()
    before = sorted(EvidenceFile.objects.values_list("file", flat=True))
    # A copy of the test data with one applicant's documents missing, so the reload fails midway.
    data = tmp_path / "test-data"
    source = conf.BASE_DIR.parent / "test-data"
    shutil.copytree(source / "form_data", data / "form_data")
    shutil.copytree(source / "evidence", data / "evidence")
    shutil.rmtree(data / "evidence" / "APP004")

    settings.DEBUG = True
    with pytest.raises(CommandError):
        seed("--reset", "--data", str(data))
    assert sorted(EvidenceFile.objects.values_list("file", flat=True)) == before
    assert all(default_storage.exists(name) for name in before)
    stored = [p for p in (conf.MEDIA_ROOT / "evidence").rglob("*") if p.is_file()]
    # Nothing left behind by the failed reload (a file used by several questions is stored once).
    assert len(stored) == len(set(before))


def test_seeded_documents_are_in_your_documents():
    """Seeded like uploads at a question: each file is in the library once, and every attachment
    shares its library document's stored file."""
    from cases.models import CaseDocument

    seed()
    evidence = list(EvidenceFile.objects.select_related("document"))
    assert evidence and all(e.document_id and e.file.name == e.document.file.name for e in evidence)
    assert CaseDocument.objects.count() == len({(e.assessment_id, e.sha256) for e in evidence})
