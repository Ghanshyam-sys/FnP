import re

from django.conf import settings
from django.db.models import prefetch_related_objects
from django.http import Http404, StreamingHttpResponse
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from engine import client as engine

from .. import adapt, workflow
from ..models import Assessment, RunStatus, Stage, Verdict
from ..permissions import IsReviewer, assessment_for
from .common import Conflict, ServiceUnavailable, require_not_own, require_owner

_HIGHLIGHT_NAME = re.compile(r"[A-Za-z0-9._-]{1,120}\.pdf")  # used with fullmatch


def _score_payload(score) -> dict:
    return {
        "source": score.source,
        "riskScore": float(score.risk_score),
        "normalised": float(score.normalised),
        "band": score.band,
        "knockOut": score.knock_out,
        "recommendation": score.recommendation,
        "lines": [
            {
                "qid": line["qid"],
                "section": line["section"],
                "question": line["question"],
                "answer": line["answer"],
                "polarity": line["polarity"],
                "questionWeight": line["question_weight"],
                "riskFlag": line["risk_flag"],
                "applicableWeight": line["applicable_weight"],
                "weightedRisk": line["weighted_risk"],
                "isKnockOut": bool(line["knockout"]),
                "knockOutTriggered": bool(line["knockout_triggered"]),
            }
            for line in score.lines
        ],
    }


def _latest_run(assessment: Assessment):
    """The latest run with what the case page reads from it, loaded together: its documents, its
    score and its rulings (never the payload sent to the engine, which the page does not show)."""
    return (
        assessment.submissions.select_related("documents", "score")
        .prefetch_related("rulings")
        .defer("payload")
        .order_by("-attempt_no")
        .first()
    )


def case_payload(assessment: Assessment) -> dict:
    """Everything a case page shows: the stage, the latest run and its report, the reviewer's
    rulings, the score, the written assessment and the decision."""
    submission = _latest_run(assessment)
    decision = getattr(assessment, "decision", None)
    payload = {
        "stage": assessment.stage,
        "submittedAt": assessment.submitted_at,
        "decidedAt": assessment.decided_at,
        "run": None,
        "authentication": None,
        "flags": [],
        "rulings": {},
        "rejected": sorted(workflow.rejected_qids(assessment, submission)),
        # Answers sent back that still have no new document: resubmitting waits until this is empty.
        "unreplaced": [],
        # Under review: whether every flagged answer has a ruling, and where they send the case
        # ("accept": on to scoring; "return": back to the applicant). Null until then.
        "reviewOutcome": None,
        "score": None,
        "assessment": None,
        "decision": None if decision is None else {
            "verdict": decision.verdict, "remarks": decision.remarks, "at": decision.decided_at,
        },
    }
    if submission is None:
        return payload
    payload["run"] = {
        "attempt": submission.attempt_no,
        "status": submission.status,
        "outcome": submission.outcome,
        "submittedAt": submission.submitted_at,
        "authenticatedAt": submission.authenticated_at,
        "completedAt": submission.completed_at,
        # A failed run the engine may still be working on: sending it again starts a second run.
        "unconfirmed": submission.status == RunStatus.FAILED and submission.error == workflow.UNCONFIRMED_SEND,
        # Scored at the reviewer's request although it did not authenticate CLEAR (force-score).
        "scoreForced": submission.score_forced_at is not None,
        "scoreForcedAt": submission.score_forced_at,
        # Why the engine did not score it when asked, if it did not.
        "forceScoreError": submission.force_error or None,
        # Whether the reviewer may ask the engine to score it (again).
        "canForceScore": workflow.can_force_score(assessment, submission),
    }
    docs = getattr(submission, "documents", None)
    authenticated = bool(docs and docs.authentication)
    # Read once where needed and shared below: the run's flags, and the documents it was sent with.
    flags = workflow.flagged_qids(submission) if authenticated or assessment.stage == Stage.REVIEW_PENDING else []
    if authenticated or assessment.stage == Stage.AWAITING_APPLICANT:
        prefetch_related_objects([submission], "evidence_files")
    if assessment.stage == Stage.REVIEW_PENDING:
        payload["reviewOutcome"] = workflow.review_outcome(submission, flags)
    if assessment.stage == Stage.AWAITING_APPLICANT:
        current = list(assessment.evidence.filter(superseded_at__isnull=True))
        payload["unreplaced"] = workflow.unreplaced_rejections(assessment, current, submission)
    if authenticated:
        evidence = list(submission.evidence_files.all())
        payload["authentication"] = adapt.authentication(assessment, docs.authentication, evidence)
        payload["flags"] = flags
        payload["rulings"] = {
            r.qid: {"verdict": r.verdict, "comment": r.comment, "at": r.created_at}
            for r in submission.rulings.all()
        }
    score = getattr(submission, "score", None)
    # The AI engine scores every case now. A score this app once calculated itself (an older case
    # whose flags the reviewer accepted) is still shown, so the record is complete; its source says
    # which, the pages label it, and on an undecided case the reviewer can ask the engine for its
    # own score, which replaces it.
    if score is not None:
        payload["score"] = _score_payload(score)
    if docs and docs.assessment:
        payload["assessment"] = adapt.final_assessment(assessment, docs.assessment)
    return payload


def _assessment(request, public_id) -> Assessment:
    return assessment_for(
        request.user, public_id, queryset=Assessment.objects.select_related("applicant", "decision")
    )


def _reloaded(assessment: Assessment) -> Assessment:
    """The case as a step left it, read again with its decision (refresh_from_db would drop the
    decision loaded with it, and reading it then takes a query of its own)."""
    return Assessment.objects.select_related("applicant", "decision").get(pk=assessment.pk)


def _transition(fn, *args):
    try:
        return fn(*args)
    except workflow.TransitionError as exc:
        raise Conflict(str(exc)) from None


class CaseView(APIView):
    """The case as it stands, brought up to date with the engine first if a run is in flight."""

    def get(self, request, public_id):
        assessment = _assessment(request, public_id)
        # Only a run in flight can have moved on (sync does nothing otherwise); the case just read
        # is current then, and is not read again.
        if settings.ENGINE_FOLLOW_IN_REQUESTS and assessment.stage in workflow.FOLLOWED_STAGES:
            workflow.sync(assessment)
            assessment = _reloaded(assessment)
        return Response(case_payload(assessment))


class SubmitView(APIView):
    action = staticmethod(workflow.submit)

    def post(self, request, public_id):
        assessment = _assessment(request, public_id)
        require_owner(request.user, assessment)
        _transition(self.action, assessment, request.user)
        return Response(case_payload(_reloaded(assessment)))


class ResubmitView(SubmitView):
    action = staticmethod(workflow.resubmit)


class RetryView(APIView):
    """After an engine failure, the applicant or the reviewer can send the run again."""

    def post(self, request, public_id):
        assessment = _assessment(request, public_id)
        if not request.user.is_reviewer:
            require_owner(request.user, assessment)
        _transition(workflow.retry, assessment, request.user)
        return Response(case_payload(_reloaded(assessment)))


class RulingSerializer(serializers.Serializer):
    verdict = serializers.ChoiceField(choices=Verdict.values)
    comment = serializers.CharField(max_length=2000)


class RulingView(APIView):
    permission_classes = [IsReviewer]

    def put(self, request, public_id, qid):
        assessment = _assessment(request, public_id)
        require_not_own(request.user, assessment)
        data = RulingSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        _transition(workflow.rule, assessment, qid, data.validated_data["verdict"],
                    data.validated_data["comment"], request.user)
        return Response(case_payload(_reloaded(assessment)))

    def delete(self, request, public_id, qid):
        assessment = _assessment(request, public_id)
        require_not_own(request.user, assessment)
        _transition(workflow.undo_ruling, assessment, qid, request.user)
        return Response(case_payload(_reloaded(assessment)))


class CompleteReviewView(APIView):
    """Reviewer: once every flagged answer has a ruling, sends the case on: to scoring if all were
    accepted, back to the applicant if any was rejected."""

    permission_classes = [IsReviewer]

    def post(self, request, public_id):
        assessment = _assessment(request, public_id)
        require_not_own(request.user, assessment)
        _transition(workflow.complete_review, assessment, request.user)
        return Response(case_payload(_reloaded(assessment)))


class ForceScoreView(APIView):
    """Reviewer: asks the AI engine to score a case whose flagged answers were all accepted, when
    it was not scored (the engine refused or could not be reached, or the flags were accepted before
    scoring could be forced)."""

    permission_classes = [IsReviewer]

    def post(self, request, public_id):
        assessment = _assessment(request, public_id)
        require_not_own(request.user, assessment)
        _transition(workflow.force_score, assessment, request.user)
        return Response(case_payload(_reloaded(assessment)))


class DecisionSerializer(serializers.Serializer):
    verdict = serializers.ChoiceField(choices=Verdict.values)
    remarks = serializers.CharField(max_length=4000)


class DecisionView(APIView):
    permission_classes = [IsReviewer]

    def post(self, request, public_id):
        assessment = _assessment(request, public_id)
        require_not_own(request.user, assessment)
        data = DecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        _transition(workflow.decide, assessment, data.validated_data["verdict"],
                    data.validated_data["remarks"], request.user)
        return Response(case_payload(_reloaded(assessment)))


class _UpstreamBody:
    """The engine's response body, passed on chunk by chunk. Django closes it when the response
    ends, including when the browser goes away before the first chunk (a generator's finally would
    never run then), so the engine connection always goes back to the pool."""

    def __init__(self, stream, upstream):
        self._stream, self._upstream, self._closed = stream, upstream, False

    def __iter__(self):
        try:
            yield from self._upstream.iter_bytes()
        finally:
            self.close()

    def close(self):
        if not self._closed:
            self._closed = True
            self._stream.__exit__(None, None, None)


class HighlightView(APIView):
    """One of the engine's highlighted evidence PDFs, passed through after the access check so the
    engine is never reached from the browser."""

    def get(self, request, public_id, name):
        assessment = _assessment(request, public_id)
        if not _HIGHLIGHT_NAME.fullmatch(name) or assessment.stage == Stage.NOT_SUBMITTED:
            raise Http404
        submission = workflow.latest_submission(assessment)
        if submission is None or not submission.engine_request_id:
            raise Http404
        stream = engine.highlight(submission.engine_request_id, name)
        try:
            upstream = stream.__enter__()
        except engine.EngineUnavailable:
            raise ServiceUnavailable() from None
        if upstream is None:
            stream.__exit__(None, None, None)
            raise Http404

        response = StreamingHttpResponse(_UpstreamBody(stream, upstream), content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{name}"'
        response["Cache-Control"] = "private, no-store"
        return response
