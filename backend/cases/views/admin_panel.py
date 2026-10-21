"""The reviewer's admin panel: counts across the whole system, and who uses it.

Only identifiers, roles, dates and counts leave here: no applicant details (date of birth, ID
number, phone) and no documents. Each endpoint runs a fixed number of queries however many users
or assessments there are."""

import datetime

from django.db.models import Count, OuterRef, Q, Subquery, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Assessment, AuditEvent, Department, EvidenceFile, Role, RunStatus, Stage, Submission, User, Verdict
from ..permissions import IsReviewer
from .assessments import NEEDS_REVIEWER

PAGE_SIZE = 50
RECENT_DAYS = 7
RECENT_ACTIVITY = 20


def _since() -> datetime.datetime:
    return timezone.now() - datetime.timedelta(days=RECENT_DAYS)


def _user_row(user: User) -> dict:
    return {
        "id": user.pk,
        "email": user.email,
        "role": user.role,
        "isActive": user.is_active,
        "isStaff": user.is_staff,
        "joinedAt": user.created_at,
        "lastLoginAt": user.last_login,
    }


class AdminOverviewView(APIView):
    """GET: the system at a glance: users, assessments by stage and department, engine runs and
    stored documents."""

    permission_classes = [IsReviewer]

    def get(self, request):
        since = _since()
        users = User.objects.aggregate(
            total=Count("pk"),
            applicants=Count("pk", filter=Q(role=Role.APPLICANT)),
            reviewers=Count("pk", filter=Q(role=Role.REVIEWER)),
            active=Count("pk", filter=Q(is_active=True)),
            inactive=Count("pk", filter=Q(is_active=False)),
            new_recently=Count("pk", filter=Q(created_at__gte=since)),
            signed_in_recently=Count("pk", filter=Q(last_login__gte=since)),
        )
        assessments = Assessment.objects.aggregate(
            total=Count("pk"),
            awaiting_reviewer=Count("pk", filter=Q(stage__in=NEEDS_REVIEWER)),
            submitted_recently=Count("pk", filter=Q(submitted_at__gte=since)),
            accepted=Count("pk", filter=Q(decision__verdict=Verdict.ACCEPTED)),
            rejected=Count("pk", filter=Q(decision__verdict=Verdict.REJECTED)),
        )
        by_stage = dict.fromkeys(Stage.values, 0)
        for row in Assessment.objects.values("stage").annotate(n=Count("pk")).order_by():
            by_stage[row["stage"]] = row["n"]
        by_department = [
            {"key": d.key, "name": d.name, "count": d.n}
            for d in Department.objects.annotate(n=Count("assessments")).order_by("name")
        ]
        runs = Submission.objects.aggregate(
            in_progress=Count("pk", filter=Q(status__in=[RunStatus.QUEUED, RunStatus.RUNNING])),
            failed=Count("pk", filter=Q(status=RunStatus.FAILED)),
        )
        documents = EvidenceFile.objects.filter(superseded_at__isnull=True).aggregate(
            count=Count("pk"), bytes=Sum("size_bytes")
        )
        return Response({
            "generatedAt": timezone.now(),
            "recentDays": RECENT_DAYS,
            "users": {
                "total": users["total"],
                "applicants": users["applicants"],
                "reviewers": users["reviewers"],
                "active": users["active"],
                "inactive": users["inactive"],
                "newRecently": users["new_recently"],
                "signedInRecently": users["signed_in_recently"],
            },
            "assessments": {
                "total": assessments["total"],
                "awaitingReviewer": assessments["awaiting_reviewer"],
                "submittedRecently": assessments["submitted_recently"],
                "accepted": assessments["accepted"],
                "rejected": assessments["rejected"],
                "byStage": by_stage,
                "byDepartment": by_department,
            },
            "runs": {"inProgress": runs["in_progress"], "failed": runs["failed"]},
            "documents": {"count": documents["count"], "bytes": documents["bytes"] or 0},
        })


class AdminUserListView(APIView):
    """GET: every account, newest first, a page at a time. Narrowed by ?search= (part of an email),
    ?role= (applicant | reviewer) and ?status= (active | inactive); ?page= from 1."""

    permission_classes = [IsReviewer]

    def get(self, request):
        params = request.query_params
        qs = User.objects.all()
        search = params.get("search", "").strip()
        if search:
            qs = qs.filter(email__icontains=search)
        role = params.get("role", "")
        if role:
            if role not in Role.values:
                raise ValidationError({"role": "Unknown role."})
            qs = qs.filter(role=role)
        status = params.get("status", "")
        if status:
            if status not in ("active", "inactive"):
                raise ValidationError({"status": "Choose active or inactive."})
            qs = qs.filter(is_active=status == "active")
        try:
            page = int(params.get("page", "1"))
            if page < 1:
                raise ValueError
        except ValueError:
            raise ValidationError({"page": "Invalid page."}) from None

        total = qs.count()
        latest = Assessment.objects.filter(applicant=OuterRef("pk")).order_by("-updated_at").values("stage")[:1]
        rows = list(
            qs.annotate(assessment_count=Count("assessments"), latest_stage=Subquery(latest))
            .order_by("-created_at", "-id")[(page - 1) * PAGE_SIZE : page * PAGE_SIZE + 1]
        )
        more = len(rows) > PAGE_SIZE
        return Response({
            "results": [
                {**_user_row(u), "assessmentCount": u.assessment_count, "latestStage": u.latest_stage}
                for u in rows[:PAGE_SIZE]
            ],
            "next": str(page + 1) if more else None,
            "total": total,
        })


class AdminUserDetailView(APIView):
    """GET: one account, the assessments it applies under, and what it did most recently."""

    permission_classes = [IsReviewer]

    def get(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        # The latest engine run of each, in the same query: the request ID the engine gave it.
        latest_run = Submission.objects.filter(assessment=OuterRef("pk")).order_by("-attempt_no")
        assessments = (
            Assessment.objects.filter(applicant=user)
            .select_related("department")
            .annotate(
                run_count=Count("submissions"),
                request_id=Subquery(latest_run.values("engine_request_id")[:1]),
                run_status=Subquery(latest_run.values("status")[:1]),
            )
            .order_by("-updated_at")
        )
        activity = AuditEvent.objects.filter(actor=user).order_by("-occurred_at")[:RECENT_ACTIVITY]
        return Response({
            **_user_row(user),
            "assessments": [
                {
                    "id": a.public_id,
                    "applicantName": a.applicant_name,
                    "department": {"key": a.department.key, "name": a.department.name},
                    "position": a.position,
                    "stage": a.stage,
                    "updatedAt": a.updated_at,
                    "submittedAt": a.submitted_at,
                    "decidedAt": a.decided_at,
                    "requestId": a.request_id,
                    "runCount": a.run_count,
                    "runStatus": a.run_status,
                }
                for a in assessments
            ],
            "activity": [
                {"at": e.occurred_at, "action": e.action, "assessmentRef": e.assessment_ref} for e in activity
            ],
        })
