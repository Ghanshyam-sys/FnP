from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import audit, catalogue, validation
from ..models import Answer, AnswerValue, ApplicantProfile, Assessment, EvidenceFile, Stage
from ..permissions import assessment_for
from .common import lock, require_editable, require_owner
from .evidence import evidence_payload, remove_files

# The editable applicant details: API name -> (model field, validator returning the stored value).
PROFILE_FIELDS = {
    "dateOfBirth": ("date_of_birth", validation.date_of_birth),
    "town": ("town", lambda v: v),
    "nationality": ("nationality", lambda v: v),
    "nationalIdNumber": ("national_id_number", validation.national_id_number),
    "phone": ("phone", validation.phone),
}
PROFILE_MAX_LENGTH = {"town": 120, "nationality": 80, "nationalIdNumber": 20, "phone": 30}


def form_payload(assessment: Assessment) -> dict:
    """The form as the applicant fills it in. A question with no saved answer reads "No", which is
    what a blank form starts from."""
    questions = catalogue.questions(catalogue.version_for(assessment).pk)
    saved = dict(assessment.answers.values_list("qid", "value"))
    profile = ApplicantProfile.objects.filter(pk=assessment.pk).first() or ApplicantProfile(assessment=assessment)
    evidence = assessment.evidence.filter(superseded_at__isnull=True).order_by("uploaded_at")
    return {
        "locked": assessment.stage != Stage.NOT_SUBMITTED,
        "applicant": {
            "fullName": assessment.applicant_name,
            "email": assessment.applicant.email,
            "proposedRole": assessment.position,
            "dateOfBirth": profile.date_of_birth.isoformat() if profile.date_of_birth else "",
            "town": profile.town,
            "nationality": profile.nationality,
            "nationalIdNumber": profile.national_id_number,
            "phone": profile.phone,
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


def _validated_changes(body: dict, questions: dict) -> tuple[dict, dict]:
    """Checks every submitted field and returns (answers, profile fields) to save, or raises one
    ValidationError listing every problem, so a partly valid body changes nothing."""
    errors: dict[str, str] = {}
    answers: dict[str, str] = {}
    raw_answers, raw_profile = body.get("answers") or {}, body.get("applicant") or {}
    if not isinstance(raw_answers, dict) or not isinstance(raw_profile, dict):
        raise ValidationError({"detail": "answers and applicant must each be an object."})
    for qid, value in raw_answers.items():
        question = questions.get(qid)
        if question is None:
            errors[f"answers.{qid}"] = "Unknown question."
        elif value not in question.allowed_answers:
            errors[f"answers.{qid}"] = f"Choose one of {', '.join(question.allowed_answers)}."
        else:
            answers[qid] = value

    profile: dict[str, object] = {}
    for name, value in raw_profile.items():
        if name not in PROFILE_FIELDS:
            errors[f"applicant.{name}"] = "This detail cannot be changed."
            continue
        if not isinstance(value, str) or len(value.strip()) > PROFILE_MAX_LENGTH.get(name, 10):
            errors[f"applicant.{name}"] = "Invalid value."
            continue
        field, check = PROFILE_FIELDS[name]
        try:
            profile[field] = check(value.strip())
        except DjangoValidationError as exc:
            errors[f"applicant.{name}"] = exc.messages[0]
    if errors:
        raise ValidationError(errors)
    return answers, profile


class FormView(APIView):
    """GET: the form (applicant or reviewer). PATCH (applicant, before submission): save answers
    and/or applicant details: {"answers": {"A1": "Yes"}, "applicant": {"town": "Windhoek"}}."""

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
        answers, profile = _validated_changes(request.data, questions)

        with transaction.atomic():
            require_editable(lock(assessment))
            for qid, value in answers.items():
                AnswerValue.objects.update_or_create(assessment=assessment, qid=qid, defaults={"value": value})
            if profile:
                ApplicantProfile.objects.update_or_create(assessment=assessment, defaults=profile)
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
