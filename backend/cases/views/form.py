from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import audit, catalogue
from ..models import Answer, AnswerValue, ApplicantProfile, Assessment, EvidenceFile, Stage
from ..permissions import assessment_for
from .common import lock, require_editable, require_owner
from .evidence import evidence_payload, remove_files

def form_payload(assessment: Assessment) -> dict:
    """The form as the applicant fills it in. A question with no saved answer reads "No", which is
    what a blank form starts from."""
    questions = catalogue.questions(catalogue.version_for(assessment).pk)
    saved = dict(assessment.answers.values_list("qid", "value"))
    evidence = assessment.evidence.filter(superseded_at__isnull=True).order_by("uploaded_at")
    return {
        "locked": assessment.stage != Stage.NOT_SUBMITTED,
        # Personal details (date of birth, ID number and the like) are not collected or shown.
        "applicant": {
            "fullName": assessment.applicant_name,
            "email": assessment.applicant.email,
            "proposedRole": assessment.position,
        },
        "answers": [
            {
                "qid": qid,
                "value": saved.get(qid, Answer.NO),
                "evidenceRequired": catalogue.evidence_required(q, saved.get(qid, Answer.NO)),
                # The rule behind it ("always" or "if_yes"), so the form can follow a changed answer
                # at once without reading the rule from the active catalogue (maybe another version).
                "evidenceRule": q.evidence_required,
                # The rules this form is checked against, from the assessment's version.
                "allowedAnswers": q.allowed_answers,
                "fileTypes": q.file_types,
                "maxFiles": q.max_files,
            }
            for qid, q in questions.items()
        ],
        "evidence": [evidence_payload(assessment, e) for e in evidence],
    }


def _validated_answers(body: dict, questions: dict) -> dict:
    """Checks every submitted answer and returns those to save, or raises one ValidationError
    listing every problem, so a partly valid body changes nothing."""
    if "applicant" in body:
        # Personal details are no longer collected; nothing here stores them.
        raise ValidationError({"applicant": "Applicant details are not collected."})
    errors: dict[str, str] = {}
    answers: dict[str, str] = {}
    raw_answers = body.get("answers") or {}
    if not isinstance(raw_answers, dict):
        raise ValidationError({"detail": "answers must be an object."})
    for qid, value in raw_answers.items():
        question = questions.get(qid)
        if question is None:
            errors[f"answers.{qid}"] = "Unknown question."
        elif value not in question.allowed_answers:
            errors[f"answers.{qid}"] = f"Choose one of {', '.join(question.allowed_answers)}."
        else:
            answers[qid] = value
    if errors:
        raise ValidationError(errors)
    return answers


class FormView(APIView):
    """GET: the form (applicant or reviewer). PATCH (applicant, before submission): save answers
    answers: {"answers": {"A1": "Yes"}}."""

    def _assessment(self, request, public_id):
        return assessment_for(request.user, public_id, queryset=Assessment.objects.select_related("applicant"))

    def get(self, request, public_id):
        return Response(form_payload(self._assessment(request, public_id)))

    def patch(self, request, public_id):
        assessment = self._assessment(request, public_id)
        require_owner(request.user, assessment)
        require_editable(assessment)
        if not isinstance(request.data, dict):
            raise ValidationError("Expected an object.")
        questions = catalogue.questions(catalogue.version_for(assessment).pk)
        answers = _validated_answers(request.data, questions)

        with transaction.atomic():
            require_editable(lock(assessment))
            for qid, value in answers.items():
                AnswerValue.objects.update_or_create(assessment=assessment, qid=qid, defaults={"value": value})
            # A document only exists to support an answer that needs one; drop it the moment the
            # answer stops needing it.
            no_longer_needed = [
                qid for qid, value in answers.items() if not catalogue.evidence_required(questions[qid], value)
            ]
            if no_longer_needed:
                remove_files(EvidenceFile.objects.filter(assessment=assessment, qid__in=no_longer_needed))
            assessment.save(update_fields=["updated_at"])
        return Response(form_payload(assessment))


class FormResetView(APIView):
    """Starts the form over (applicant, before submission): answers, details and documents."""

    def post(self, request, public_id):
        assessment = assessment_for(request.user, public_id, queryset=Assessment.objects.select_related("applicant"))
        require_owner(request.user, assessment)
        require_editable(assessment)
        with transaction.atomic():
            require_editable(lock(assessment))
            assessment.answers.all().delete()
            ApplicantProfile.objects.filter(pk=assessment.pk).delete()
            remove_files(assessment.evidence.all())
            assessment.save(update_fields=["updated_at"])
            audit.record(request.user, "form.reset", assessment_ref=assessment.public_id)
        return Response(form_payload(assessment), status=status.HTTP_200_OK)
