from django.db import transaction
from django.db.models import Max
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from engine.client import EngineUnavailable

from .. import audit, catalogue
from ..models import Answer, Department, Question, QuestionnaireVersion, QuestionSection
from ..permissions import IsReviewer
from .common import Conflict, ServiceUnavailable

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
            options = catalogue.evidence_options()
        except EngineUnavailable:
            raise ServiceUnavailable() from None
        return Response({
            **_version_payload(catalogue.active_version()),
            "cvFileTypes": catalogue.CV_FILE_TYPES,
            "evidenceOptions": options,
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


_STALE = "These settings were changed by someone else. Reload them and make your changes again."


class QuestionnaireView(APIView):
    """Reviewer: the question settings in force, and the published defaults to restore. PUT
    publishes a new version with changed answer options, formats and file counts; weights are the
    engine's and stay read-only. PUT names the version it was edited from, so a reviewer who
    edited settings another reviewer has since replaced is told, rather than undoing that change."""

    permission_classes = [IsReviewer]

    def get(self, request):
        published = QuestionnaireVersion.objects.order_by("pk").first()
        return Response({
            "current": _version_payload(catalogue.active_version()),
            "published": _version_payload(published),
            "configurableFileTypes": CONFIGURABLE_FILE_TYPES,
        })

    def put(self, request):
        body = request.data if isinstance(request.data, dict) else {}
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
            else:
                errors[qid] = data.errors
        if errors:
            raise ValidationError(errors)

        unchanged = all(
            getattr(questions[qid], field) == value for qid, c in changes.items() for field, value in c.items()
        )
        if unchanged:
            return Response(_version_payload(current))

        with transaction.atomic():
            # Two reviewers saving at once publish one after the other: the second waits on this
            # lock, then finds the version it edited is no longer the active one.
            locked = QuestionnaireVersion.objects.select_for_update().filter(pk=current.pk, is_active=True)
            if locked.first() is None:
                raise Conflict(_STALE)
            next_number = QuestionnaireVersion.objects.aggregate(n=Max("pk"))["n"] + 1
            new = QuestionnaireVersion.objects.create(label=f"v{next_number}", is_active=False)
            sections = {
                s.pk: QuestionSection.objects.create(version=new, name=s.name, weight=s.weight, position=s.position)
                for s in QuestionSection.objects.filter(version=current)
            }
            Question.objects.bulk_create([
                Question(
                    version=new, section=sections[q.section_id], qid=q.qid, text=q.text, polarity=q.polarity,
                    weight=q.weight, is_knockout=q.is_knockout, evidence_required=q.evidence_required,
                    allows_na=q.allows_na, accepts_supporting=q.accepts_supporting, checks=q.checks,
                    allowed_answers=changes.get(q.qid, {}).get("allowed_answers", q.allowed_answers),
                    file_types=changes.get(q.qid, {}).get("file_types", q.file_types),
                    max_files=changes.get(q.qid, {}).get("max_files", q.max_files),
                    position=q.position,
                )
                for q in questions.values()
            ])
            QuestionnaireVersion.objects.filter(pk=current.pk).update(is_active=False)
            QuestionnaireVersion.objects.filter(pk=new.pk).update(is_active=True)
            audit.record(
                request.user, "questionnaire.publish", target_type="questionnaire", target_id=new.label,
                metadata={"changed": sorted(changes)},
            )
        new.refresh_from_db()
        return Response(_version_payload(new))
