import hashlib
import logging
import os

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from engine.client import EngineUnavailable

from .. import audit, catalogue, validation, workflow
from ..models import Answer, AnswerValue, Assessment, EvidenceFile, EvidenceRole, Stage
from ..permissions import assessment_for
from ..storage import delete_files
from .common import Conflict, ServiceUnavailable, lock, require_owner

logger = logging.getLogger(__name__)

# The CV is one document, outside the question set's configuration.
CV_FILE_TYPES = catalogue.CV_FILE_TYPES


def evidence_payload(assessment: Assessment, e: EvidenceFile) -> dict:
    return {
        "id": str(e.public_id),
        "qid": e.qid,
        "optionCode": e.option_code,
        "docType": e.doc_type,
        "role": e.role,
        "description": e.description,
        "fileName": e.original_name,
        "sizeBytes": e.size_bytes,
        "uploadedAt": e.uploaded_at,
        "url": f"/api/assessments/{assessment.public_id}/evidence/{e.public_id}/file",
    }


def remove_files(evidence) -> None:
    """Deletes evidence rows, and their files once the transaction commits. A file a submission
    already sent to the engine is kept and only marked superseded, so the record stays whole."""
    evidence = list(evidence)
    sent = set(
        EvidenceFile.submissions.through.objects.filter(evidencefile_id__in=[e.pk for e in evidence])
        .values_list("evidencefile_id", flat=True)
    )
    kept = [e.pk for e in evidence if e.pk in sent]
    gone = [e for e in evidence if e.pk not in sent]
    EvidenceFile.objects.filter(pk__in=kept).update(superseded_at=timezone.now())
    EvidenceFile.objects.filter(pk__in=[e.pk for e in gone]).delete()
    names = [e.file.name for e in gone]
    transaction.on_commit(lambda: delete_files(names))


def require_can_change(assessment: Assessment, qid: str) -> None:
    """Documents change freely before submission. Afterwards, only while the case is back with the
    applicant, and only for the answers the reviewer rejected."""
    if assessment.stage == Stage.NOT_SUBMITTED:
        return
    if qid not in workflow.rejected_qids(assessment):
        raise Conflict("Documents can only be changed for the answers the reviewer sent back.")


def _safe_name(name: str) -> str:
    """The uploaded name, reduced to a plain file name for display and the download header."""
    name = os.path.basename(name.replace("\\", "/")).strip() or "document"
    return "".join(ch for ch in name if ch.isprintable() and ch not in '"<>|:*?')[:255]


class EvidenceUploadView(APIView):
    """Attach one document to a question (or the CV). Multipart fields: file, qid, optionCode,
    role (primary|supporting), description (required for "Other")."""

    parser_classes = [MultiPartParser]
    throttle_scope = "upload"

    def post(self, request, public_id):
        assessment = assessment_for(request.user, public_id, queryset=Assessment.objects.select_related("applicant"))
        require_owner(request.user, assessment)

        upload = request.FILES.get("file")
        qid = (request.data.get("qid") or "").strip()
        code = (request.data.get("optionCode") or "").strip()
        role = (request.data.get("role") or EvidenceRole.PRIMARY).strip()
        description = (request.data.get("description") or "").strip()[:200]
        if upload is None:
            raise ValidationError({"file": "Choose a file to upload."})
        if role not in EvidenceRole.values:
            raise ValidationError({"role": "Unknown role."})
        require_can_change(assessment, qid)

        if qid == catalogue.CV_QID:
            allowed, max_files = CV_FILE_TYPES, 1
        else:
            question = catalogue.questions(catalogue.version_for(assessment).pk).get(qid)
            if question is None:
                raise ValidationError({"qid": "Unknown question."})
            answer = AnswerValue.objects.filter(assessment=assessment, qid=qid).values_list("value", flat=True).first()
            if not catalogue.evidence_required(question, answer or Answer.NO):
                raise ValidationError({"qid": "The current answer to this question does not need a document."})
            allowed, max_files = question.file_types, question.max_files

        try:
            option = catalogue.option(qid, code)
        except EngineUnavailable:
            raise ServiceUnavailable() from None
        if option is None:
            raise ValidationError({"optionCode": "Choose a document type from the list."})
        if option["code"] == "OTHER" and not description:
            raise ValidationError({"description": "Describe the document you are attaching."})

        current = EvidenceFile.objects.filter(assessment=assessment, qid=qid, superseded_at__isnull=True)
        if role == EvidenceRole.SUPPORTING:
            if max_files < 2:
                raise ValidationError({"role": "This question takes a single document."})
            if not current.filter(role=EvidenceRole.PRIMARY).exists():
                raise ValidationError({"role": "Attach the main document first."})

        try:
            _, content_type = validation.evidence_file(upload, allowed, settings.EVIDENCE_MAX_BYTES)
        except DjangoValidationError as exc:
            raise ValidationError({"file": exc.messages[0]}) from None

        digest = hashlib.sha256()
        for chunk in upload.chunks():
            digest.update(chunk)
        upload.seek(0)

        evidence = EvidenceFile(
            assessment=assessment,
            qid=qid,
            option_code=option["code"],
            doc_type=option["doc_type"],
            role=role,
            description=description,
            original_name=_safe_name(upload.name),
            content_type=content_type,
            size_bytes=upload.size,
            sha256=digest.hexdigest(),
            uploaded_by=request.user,
        )
        evidence.file.save("upload", upload, save=False)
        try:
            with transaction.atomic():
                require_can_change(lock(assessment), qid)
                # A new document for the same slot replaces the old one. A supporting document only
                # backs up the primary it was attached with, so a new primary replaces both.
                remove_files(current if role == EvidenceRole.PRIMARY else current.filter(role=role))
                evidence.save()
                assessment.save(update_fields=["updated_at"])
                audit.record(
                    request.user, "evidence.upload", assessment_ref=assessment.public_id,
                    target_type="evidence", target_id=evidence.public_id, metadata={"qid": qid, "role": role},
                )
        except Exception:
            # The row was never committed, so the stored file would be orphaned.
            delete_files([evidence.file.name])
            raise
        return Response(evidence_payload(assessment, evidence), status=status.HTTP_201_CREATED)


class EvidenceDetailView(APIView):
    def delete(self, request, public_id, evidence_id):
        assessment = assessment_for(request.user, public_id)
        require_owner(request.user, assessment)
        evidence = assessment.evidence.filter(public_id=evidence_id, superseded_at__isnull=True).first()
        if evidence is None:
            raise Http404
        require_can_change(assessment, evidence.qid)
        with transaction.atomic():
            require_can_change(lock(assessment), evidence.qid)
            removed = assessment.evidence.filter(qid=evidence.qid, superseded_at__isnull=True)
            # A supporting document only exists to be checked against the primary, so removing the
            # primary takes it too.
            if evidence.role == EvidenceRole.SUPPORTING:
                removed = removed.filter(pk=evidence.pk)
            remove_files(removed)
            assessment.save(update_fields=["updated_at"])
            audit.record(
                request.user, "evidence.remove", assessment_ref=assessment.public_id,
                target_type="evidence", target_id=evidence.public_id, metadata={"qid": evidence.qid},
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class EvidenceFileView(APIView):
    """Streams one document back to the applicant who owns it or the reviewer."""

    def get(self, request, public_id, evidence_id):
        assessment = assessment_for(request.user, public_id)
        evidence = assessment.evidence.filter(public_id=evidence_id).first()
        if evidence is None:
            raise Http404
        try:
            handle = evidence.file.open("rb")
        except FileNotFoundError:
            # The record outlived its file (storage cleaned up by hand, or a move that missed it):
            # for the person asking, the document is not there.
            logger.error("Evidence %s of %s is missing from storage", evidence.public_id, assessment.public_id)
            raise Http404 from None
        response = FileResponse(handle, content_type=evidence.content_type, filename=evidence.original_name)
        response["Cache-Control"] = "private, no-store"
        return response
