import base64
import datetime

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, connection, transaction
from django.db.models import (
    BooleanField,
    Case,
    Count,
    Exists,
    IntegerField,
    OuterRef,
    Prefetch,
    Q,
    QuerySet,
    Value,
    When,
)
from django.db.models.expressions import RawSQL
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import audit, catalogue, validation, workflow
from ..models import (
    AnswerValue,
    ApplicantProfile,
    Assessment,
    Department,
    EvidenceFile,
    QuestionResult,
    ResultStatus,
    Role,
    Stage,
    Submission,
    User,
    Verdict,
)
from ..permissions import assessment_for
from ..storage import delete_files
from .common import Conflict, lock

PAGE_SIZE = 50
# Applications an applicant may have started and not yet submitted at one time.
MAX_OPEN_DRAFTS = 3
# Running cases one list request follows, so a slow engine delays a list by one run at most. The
# rest are picked up by the next poll, a few seconds on.
SYNC_PER_REQUEST = 1

# The reviewer queue's order: cases needing the reviewer first, then work in flight, then settled
# ones. The queue is paged in this order, so every case needing the reviewer is on the first pages
# however long ago it last changed. The frontend's queueRank (state/caseLabels.ts) is the same list.
QUEUE_ORDER = [
    Stage.REVIEW_PENDING,
    Stage.DECISION_PENDING,
    Stage.AUTH_FAILED,
    Stage.AWAITING_APPLICANT,
    Stage.SCORING,
    Stage.AUTH_RUNNING,
    Stage.ACCEPTED,
    Stage.REJECTED,
    Stage.NOT_SUBMITTED,
]
# Stages the reviewer has to act on (frontend: needsReviewer).
NEEDS_REVIEWER = [Stage.REVIEW_PENDING, Stage.DECISION_PENDING, Stage.AUTH_FAILED]
QUEUE_RANK = Case(
    *(When(stage=stage, then=Value(rank)) for rank, stage in enumerate(QUEUE_ORDER)),
    default=Value(len(QUEUE_ORDER)),
    output_field=IntegerField(),
)


def with_queue_summary(qs):
    """Loads what the queue cards show about each assessment's latest run in a fixed number of
    queries, however many assessments are listed: the runs, their flags, their rulings, and the
    decision."""
    started = (
        Exists(AnswerValue.objects.filter(assessment=OuterRef("pk")))
        | Exists(EvidenceFile.objects.filter(assessment=OuterRef("pk")))
        | Exists(ApplicantProfile.objects.filter(assessment=OuterRef("pk")))
    )
    return qs.annotate(has_draft=started).select_related("department", "applicant", "decision").prefetch_related(
        Prefetch(
            "submissions",
            # Only what the queue card needs: never the payload sent to the engine.
            queryset=Submission.objects.only("id", "assessment_id", "attempt_no").order_by("-attempt_no").prefetch_related(
                Prefetch("question_results", queryset=QuestionResult.objects.filter(status=ResultStatus.ISSUE),
                         to_attr="issues"),
                "rulings",
            ),
            to_attr="runs",
        )
    )


def _queue_summary(a: Assessment) -> dict:
    runs = getattr(a, "runs", None)
    if runs is None:  # a single assessment loaded without the prefetch
        return _queue_summary(with_queue_summary(Assessment.objects.filter(pk=a.pk)).get())
    latest = runs[0] if runs else None
    flagged = [r.qid for r in latest.issues] if latest else []
    verdicts = {r.qid: r.verdict for r in latest.rulings.all()} if latest else {}
    decision = getattr(a, "decision", None)
    return {
        "flagged": flagged,
        "openFlags": len([q for q in flagged if q not in verdicts]),
        "rejected": sorted(q for q, v in verdicts.items() if v == Verdict.REJECTED),
        "decisionRemarks": decision.remarks if decision else None,
    }


def removable_by(user: User, a: Assessment) -> bool:
    """Only before submission, and never a built-in demo assessment: the reviewer may remove any
    that someone started, an applicant only one they started themselves."""
    if a.stage != Stage.NOT_SUBMITTED or a.created_by_id is None:
        return False
    return user.is_reviewer or a.created_by_id == user.id


def assessment_payload(a: Assessment, viewer: User) -> dict:
    return {
        "id": a.public_id,
        "applicantName": a.applicant_name,
        "applicantEmail": a.applicant.email,
        "department": {"key": a.department.key, "name": a.department.name, "blurb": a.department.blurb},
        "entity": a.entity,
        "position": a.position,
        "reference": a.parent_reference,
        "initiatedOn": a.initiated_on.isoformat(),
        "stage": a.stage,
        "submittedAt": a.submitted_at,
        "decidedAt": a.decided_at,
        "updatedAt": a.updated_at,
        "removable": removable_by(viewer, a),
        # The viewer's own application: a reviewer never rules on or decides it.
        "ownApplication": a.applicant_id == viewer.id,
        # Started by the applicant themselves, rather than opened for them by the reviewer.
        "startedByApplicant": a.created_by_id == a.applicant_id,
        # Whether the applicant has saved anything yet (the list shows "Draft saved").
        "hasDraft": a.has_draft,
        "queue": _queue_summary(a),
    }


def _encode_cursor(a: Assessment) -> str:
    return base64.urlsafe_b64encode(f"{a.queue_rank}|{a.updated_at.isoformat()}|{a.pk}".encode()).decode()


def _decode_cursor(cursor: str) -> tuple[int, datetime.datetime, int]:
    try:
        rank, stamp, pk = base64.urlsafe_b64decode(cursor.encode()).decode().split("|")
        rank = int(rank)
        if not 0 <= rank <= len(QUEUE_ORDER):
            raise ValueError("cursor rank out of range")
        moment = datetime.datetime.fromisoformat(stamp)
        if moment.tzinfo is None:
            raise ValueError("cursor time without a zone")
        # Normalised here so an out-of-range offset fails as a bad cursor, not in the database.
        return rank, moment.astimezone(datetime.UTC), int(pk)
    except (ValueError, UnicodeDecodeError, OverflowError):
        raise ValidationError({"cursor": "Invalid cursor."}) from None


def _follow_running(visible: QuerySet | None) -> None:
    """The list is polled while a case is running. When no background worker is following the
    engine, it moves a few of the listed runs on itself; with a worker, none is ever due, and this
    is a single indexed lookup."""
    if settings.ENGINE_FOLLOW_IN_REQUESTS:
        workflow.follow_due_runs(SYNC_PER_REQUEST, assessments=visible)


class NewAssessmentSerializer(serializers.Serializer):
    """What an applicant gives to start their own application. Their email is their sign-in, and
    it is initiated today."""

    applicantName = serializers.CharField(max_length=200)
    entity = serializers.CharField(max_length=200)
    position = serializers.CharField(max_length=200)
    reference = serializers.CharField(max_length=40)
    department = serializers.CharField(max_length=32)

    def validate_department(self, value):
        department = Department.objects.filter(key=value).first()
        if department is None:
            raise serializers.ValidationError("Choose a department from the list.")
        return department

    def validate_reference(self, value):
        if Assessment.objects.filter(parent_reference__iexact=value).exists():
            raise serializers.ValidationError("An assessment already exists for this application reference.")
        return value


class ReviewerNewAssessmentSerializer(NewAssessmentSerializer):
    """The reviewer opens one for an applicant, naming them by email, with the date it was initiated."""

    email = serializers.CharField(max_length=254)
    initiatedOn = serializers.DateField()

    def validate_email(self, value):
        try:
            return validation.applicant_email(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from None

    def validate_initiatedOn(self, value):
        try:
            return validation.initiated_on(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from None


class AssessmentListView(APIView):
    """GET: an applicant's own assessments, newest activity first; or for the reviewer the queue of
    submitted assessments (optionally one stage and/or one department), in QUEUE_ORDER and newest
    activity first within a stage, keyset-paginated, with the queue's totals across every page. POST: the reviewer opens
    an assessment for an applicant, or an applicant starts their own."""

    def get_throttles(self):
        # Opening assessments is rate limited; listing them (polled while engines run) is not.
        if self.request.method == "POST":
            self.throttle_scope = "create"
        return super().get_throttles()

    def get(self, request):
        visible = Assessment.objects.all()
        if not request.user.is_reviewer:
            visible = visible.filter(applicant=request.user)
        if not request.query_params.get("cursor"):
            # The reviewer sees every assessment, so their runs need no narrowing.
            _follow_running(None if request.user.is_reviewer else visible)
        if not request.user.is_reviewer:
            items = list(with_queue_summary(visible).order_by("-updated_at", "-id"))
            return Response({"results": [assessment_payload(a, request.user) for a in items], "next": None})

        # The reviewer's queue holds only what applicants have submitted: a form still being filled
        # in (started by the applicant, or opened by the reviewer and not sent yet) is not theirs to
        # work on. It joins the queue on its first submission and stays there.
        visible = visible.exclude(stage=Stage.NOT_SUBMITTED)
        stage = request.query_params.get("stage")
        if stage:
            if stage not in Stage.values:
                raise ValidationError({"stage": "Unknown stage."})
            visible = visible.filter(stage=stage)
        department = request.query_params.get("department")
        if department:
            if not Department.objects.filter(key=department).exists():
                raise ValidationError({"department": "Unknown department."})
            visible = visible.filter(department__key=department)
        qs = with_queue_summary(visible).annotate(queue_rank=QUEUE_RANK).order_by("queue_rank", "-updated_at", "-id")
        cursor = request.query_params.get("cursor")
        if cursor:
            rank, stamp, pk = _decode_cursor(cursor)
            # Within the cursor's stage group, a row comparison, so the database starts reading at
            # the cursor rather than reading every earlier row and discarding it.
            after_in_group = RawSQL(
                '("assessment"."updated_at", "assessment"."id") < (%s, %s)', (stamp, pk), output_field=BooleanField()
            )
            qs = qs.filter(Q(queue_rank__gt=rank) | (Q(queue_rank=rank) & Q(after_in_group)))
        page = list(qs[: PAGE_SIZE + 1])
        more = len(page) > PAGE_SIZE
        page = page[:PAGE_SIZE]
        # The header's counts cover the whole queue, not just the pages the reviewer has loaded.
        totals = visible.aggregate(
            total=Count("pk"), actionable=Count("pk", filter=Q(stage__in=NEEDS_REVIEWER))
        )
        return Response({
            "results": [assessment_payload(a, request.user) for a in page],
            "next": _encode_cursor(page[-1]) if more else None,
            "total": totals["total"],
            "actionable": totals["actionable"],
        })

    def post(self, request):
        by_reviewer = request.user.is_reviewer
        data = (ReviewerNewAssessmentSerializer if by_reviewer else NewAssessmentSerializer)(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if by_reviewer:
            applicant = User.objects.filter(email=v["email"]).first()
            if applicant is not None and applicant.role != Role.APPLICANT:
                raise ValidationError({"email": "This email belongs to a reviewer account."})
            initiated_on = v["initiatedOn"]
        else:
            applicant, initiated_on = request.user, timezone.localdate()
        with transaction.atomic():
            if by_reviewer:
                applicant = applicant or User.objects.get_or_create_for_email(v["email"], Role.APPLICANT)
            else:
                # The applicant's row is locked so two requests at once cannot both pass the count.
                User.objects.select_for_update().get(pk=applicant.pk)
                started = Assessment.objects.filter(applicant=applicant, created_by=applicant, stage=Stage.NOT_SUBMITTED)
                if started.count() >= MAX_OPEN_DRAFTS:
                    raise Conflict(
                        f"You already have {MAX_OPEN_DRAFTS} applications not yet submitted. "
                        "Submit or remove one to start another."
                    )
            with connection.cursor() as cur:
                cur.execute("SELECT nextval('assessment_serial')")
                serial = cur.fetchone()[0]
            try:
                assessment = Assessment.objects.create(
                    public_id=f"FNP-{initiated_on.year}-{serial:04d}",
                    applicant=applicant,
                    applicant_name=v["applicantName"],
                    department=v["department"],
                    entity=v["entity"],
                    position=v["position"],
                    parent_reference=v["reference"],
                    initiated_on=initiated_on,
                    version=catalogue.active_version(),
                    created_by=request.user,
                )
            except IntegrityError:
                # Two people submitting the same reference at once: the unique index decides.
                raise ValidationError(
                    {"reference": ["An assessment already exists for this application reference."]}
                ) from None
            audit.record(request.user, "assessment.create", assessment_ref=assessment.public_id)
        assessment.has_draft = False  # just opened: nothing saved yet
        return Response(assessment_payload(assessment, request.user), status=status.HTTP_201_CREATED)


class AssessmentDetailView(APIView):
    def get(self, request, public_id):
        qs = with_queue_summary(Assessment.objects.all())
        return Response(assessment_payload(assessment_for(request.user, public_id, queryset=qs), request.user))

    def delete(self, request, public_id):
        assessment = assessment_for(request.user, public_id)
        if not request.user.is_reviewer and assessment.created_by_id != request.user.id:
            raise PermissionDenied("Only an application you started yourself can be removed.")
        refused = "Only an assessment that was started here, and not yet submitted, can be removed."
        if not removable_by(request.user, assessment):
            raise Conflict(refused)
        with transaction.atomic():
            # Re-checked on the locked row: a submit at the same moment must not be deleted.
            if lock(assessment).stage != Stage.NOT_SUBMITTED:
                raise Conflict(refused)
            files = [e.file.name for e in assessment.evidence.all()]
            assessment.delete()
            audit.record(request.user, "assessment.remove", assessment_ref=public_id)
            transaction.on_commit(lambda: delete_files(files))
        return Response(status=status.HTTP_204_NO_CONTENT)
