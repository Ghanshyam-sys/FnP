"""The checks the engine runs on a question's documents: chosen (or typed) in the question editor,
stored on the question, and sent to the engine with each submission."""

import pytest

from cases import adapt, catalogue
from cases.models import Assessment, AuditEvent, QuestionnaireVersion
from cases.tests import factories as make
from cases.tests.test_questionnaire_edit import new_question, structure

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("engine_options")]

NEW = {
    "applicantName": "Anna M. Nghipandulwa", "email": "anna@example.na", "entity": "Namib Trust Bank Limited",
    "position": "Non-Executive Director", "reference": "BL-2026-0510", "initiatedOn": "2026-10-01",
    "department": "banking",
}


@pytest.fixture
def reviewer(as_user):
    return as_user(make.reviewer())


def published(reviewer, qid):
    return next(q for q in reviewer.get("/api/questionnaire").json()["current"]["questions"] if q["qid"] == qid)


def test_the_editor_is_offered_every_check_with_its_name_in_words(reviewer):
    body = reviewer.get("/api/questionnaire").json()
    names = [c["name"] for c in body["checkChoices"]]
    assert names[:3] == ["Document_Check", "Name_Check", "Age_Check"] and len(names) == 25
    assert {"name": "Experience_Duration_Check", "label": "Experience duration check"} in body["checkChoices"]
    assert body["defaultChecks"] == ["Document_Check", "Name_Check"]


def test_typed_checks_take_the_engines_form():
    assert catalogue.check_name("licence validity") == "Licence_Validity_Check"
    assert catalogue.check_name("  Licence  validity CHECK ") == "Licence_Validity_Check"
    assert catalogue.check_name("Age_Check") == "Age_Check"
    assert catalogue.check_name("ID number") == "ID_Number_Check"
    assert catalogue.check_name(" -- ") is None
    assert catalogue.check_label("ID_Number_Check") == "ID number check"


def test_a_new_questions_checks_are_stored_and_reach_the_engine(reviewer, as_user):
    body = structure(reviewer)
    body["sections"][-1]["questions"].append(new_question(checks=["Document_Check", "licence validity", "Licence_Validity_Check", "   "]))
    response = reviewer.put("/api/questionnaire", body)
    assert response.status_code == 200, response.json()
    # Typed checks in the engine's form, each once, blanks left out.
    assert published(reviewer, "N1")["checks"] == ["Document_Check", "Licence_Validity_Check"]
    assert {"name": "Licence_Validity_Check", "label": "Licence validity check"} in reviewer.get("/api/questionnaire").json()["checkChoices"]

    aid = reviewer.post("/api/assessments", NEW).json()["id"]
    assessment = Assessment.objects.get(public_id=aid)
    questions = catalogue.questions(catalogue.version_for(assessment).pk)
    payload = adapt.submission_payload(assessment, questions, {"N1": "Yes"}, None, [])
    sent = next(q for s in payload["sections"] for q in s["questions"] if q["qid"] == "N1")
    assert sent["checks_to_perform"] == ["Document_Check", "Licence_Validity_Check"]


def test_an_existing_questions_checks_can_be_changed(reviewer):
    assert published(reviewer, "A1")["checks"] == ["Document_Check", "Name_Check", "Age_Check"]
    body = structure(reviewer)
    a1 = body["sections"][0]["questions"][0]
    a1["checks"] = ["Document_Check", "Name_Check", "Date of birth match"]
    assert reviewer.put("/api/questionnaire", body).status_code == 200
    assert published(reviewer, "A1")["checks"] == ["Document_Check", "Name_Check", "Date_Of_Birth_Match_Check"]
    assert AuditEvent.objects.filter(action="questionnaire.publish").exists()


def test_checks_left_out_are_kept_and_unchanged_checks_publish_nothing(reviewer):
    before = QuestionnaireVersion.objects.count()
    # The editor as it was (no checks sent): nothing changes, nothing is published.
    assert reviewer.put("/api/questionnaire", structure(reviewer)).status_code == 200
    body = structure(reviewer)
    for section in body["sections"]:
        for q in section["questions"]:
            q["checks"] = published(reviewer, q["qid"])["checks"]
    assert reviewer.put("/api/questionnaire", body).status_code == 200
    assert QuestionnaireVersion.objects.count() == before
    assert published(reviewer, "A1")["checks"] == ["Document_Check", "Name_Check", "Age_Check"]


def test_a_question_that_takes_no_documents_has_no_checks(reviewer):
    body = structure(reviewer)
    body["sections"][-1]["questions"].append(new_question(
        evidenceRequired="never", evidenceOptions=[], fileTypes=[], checks=["Document_Check"],
    ))
    assert reviewer.put("/api/questionnaire", body).status_code == 200
    assert published(reviewer, "N1")["checks"] == []


def test_a_check_name_is_checked(reviewer):
    body = structure(reviewer)
    body["sections"][-1]["questions"].append(new_question(checks=["bad\x01name"]))
    refused = reviewer.put("/api/questionnaire", body)
    assert refused.status_code == 400 and any("control characters" in str(v) for v in refused.json().values())
    body["sections"][-1]["questions"][-1]["checks"] = ["word " * 20]
    refused = reviewer.put("/api/questionnaire", body)
    assert refused.status_code == 400 and any("at most 60" in str(v) for v in refused.json().values())


def test_every_questions_checks_go_to_the_engine_existing_and_new(reviewer):
    body = structure(reviewer)
    body["sections"][0]["questions"][0]["checks"] = ["Document_Check", "Name_Check", "Date of birth match"]  # A1 edited
    body["sections"][-1]["questions"].append(new_question(checks=["Document_Check", "licence validity"]))  # N1 added
    assert reviewer.put("/api/questionnaire", body).status_code == 200

    aid = reviewer.post("/api/assessments", NEW).json()["id"]
    assessment = Assessment.objects.get(public_id=aid)
    questions = catalogue.questions(catalogue.version_for(assessment).pk)
    payload = adapt.submission_payload(assessment, questions, {}, None, [])
    sent = {q["qid"]: q["checks_to_perform"] for s in payload["sections"] for q in s["questions"]}
    # Each question goes with exactly the checks it has: an existing one unchanged, one edited, one added.
    assert sent == {qid: list(q.checks) for qid, q in questions.items()}
    assert sent["A4"] == ["Document_Check", "Name_Check", "Naturalization_Check"]
    assert sent["A1"] == ["Document_Check", "Name_Check", "Date_Of_Birth_Match_Check"]
    assert sent["N1"] == ["Document_Check", "Licence_Validity_Check"]
