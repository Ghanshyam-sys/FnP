"""The question catalogue: the active questionnaire version, its rules, and the evidence options
the engine accepts. Questions are read once per version and cached, since a version never changes
after it is published."""

from django.core.cache import cache

from engine import client as engine

from .models import Answer, Assessment, EvidenceRule, Question, QuestionnaireVersion, Stage

CV_QID = "CV"
# The formats a CV may be uploaded in.
CV_FILE_TYPES = ["pdf", "docx"]
# The engine files the CV's options under this key; the API serves them as "CV".
_ENGINE_CV_KEY = "cv_verification"
_OPTIONS_CACHE_KEY = "catalogue:evidence-options"
_OPTIONS_TTL_SECONDS = 6 * 60 * 60


def active_version() -> QuestionnaireVersion:
    return QuestionnaireVersion.objects.get(is_active=True)


def version_for(assessment: Assessment) -> QuestionnaireVersion:
    """The settings an assessment is held to: the active ones until it is submitted, then the
    ones it was submitted under, so a later change never moves the goalposts mid-case."""
    return active_version() if assessment.stage == Stage.NOT_SUBMITTED else assessment.version


def questions(version_id: int) -> dict[str, Question]:
    """qid -> question for one version, in form order. Cached: a published version is immutable."""
    key = f"catalogue:questions:{version_id}"
    found = cache.get(key)
    if found is None:
        found = {
            q.qid: q
            for q in Question.objects.filter(version_id=version_id).select_related("section").order_by("position")
        }
        cache.set(key, found, None)
    return found


def evidence_required(question: Question, answer: str) -> bool:
    if answer == Answer.NA:
        return False
    if question.evidence_required == EvidenceRule.ALWAYS:
        return True
    return answer == Answer.YES


def evidence_options() -> dict[str, list[dict]]:
    """qid (and "CV") -> the options the engine reads, cached for a few hours."""
    options = cache.get(_OPTIONS_CACHE_KEY)
    if options is None:
        raw = engine.evidence_options()["questions"]
        options = {(CV_QID if qid == _ENGINE_CV_KEY else qid): items for qid, items in raw.items()}
        cache.set(_OPTIONS_CACHE_KEY, options, _OPTIONS_TTL_SECONDS)
    return options


def option(qid: str, code: str) -> dict | None:
    return next((o for o in evidence_options().get(qid, []) if o["code"] == code), None)
