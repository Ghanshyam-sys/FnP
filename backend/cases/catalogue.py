"""The question catalogue: the active questionnaire version, its rules, and the evidence options
the engine accepts. Questions are read once per version and cached, since a version never changes
after it is published."""

from django.core.cache import cache

from engine import client as engine

from .models import Answer, AnswerType, Assessment, EvidenceRule, Question, QuestionnaireVersion, Stage

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
    """qid -> question for one version, in form order. Cached: a published version is immutable.
    The key names the shape of what is cached (v2: with answer types and added questions), so
    copies cached by an earlier release, without those fields, are never read back."""
    key = f"catalogue:questions:v2:{version_id}"
    found = cache.get(key)
    if found is None:
        found = {
            q.qid: q
            for q in Question.objects.filter(version_id=version_id).select_related("section").order_by("position")
        }
        cache.set(key, found, None)
    return found


def default_answer(question: Question) -> str:
    """What a question reads before it is answered: No for a choice (what a blank form starts
    from), nothing for a text question."""
    return "" if question.answer_type == AnswerType.TEXT else Answer.NO


def evidence_required(question: Question, answer: str) -> bool:
    if question.evidence_required == EvidenceRule.NEVER:
        return False
    if question.answer_type == AnswerType.TEXT:
        # Words are not Yes or No: a text question either always takes a document or never does.
        return question.evidence_required == EvidenceRule.ALWAYS
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


def all_engine_options() -> list[dict]:
    """Every document type the engine offers for any question (not the CV's), once each: what a
    reviewer chooses from for a question the engine has no list of its own for."""
    seen: dict[str, dict] = {}
    for qid, items in evidence_options().items():
        if qid == CV_QID:
            continue
        for item in items:
            seen.setdefault(item["code"], item)
    return list(seen.values())


def options_by_code() -> dict[str, dict]:
    """The engine's document types by code, for looking several up at once."""
    return {o["code"]: o for o in all_engine_options()}


def chosen_options(codes: list[str], by_code: dict[str, dict] | None = None) -> list[dict]:
    """The engine's document types with these codes, in this order (unknown codes left out).
    Pass options_by_code() as by_code when looking up several questions' at once."""
    by_code = options_by_code() if by_code is None else by_code
    return [by_code[c] for c in codes if c in by_code]


def options_for(qid: str, question: Question | None = None) -> list[dict]:
    """The document types a question takes: those the reviewer chose for it, if any (a question
    added here), otherwise the engine's own list for its code."""
    if question is not None and question.evidence_options:
        return chosen_options(question.evidence_options)
    return evidence_options().get(qid, [])


def option(qid: str, code: str, question: Question | None = None) -> dict | None:
    return next((o for o in options_for(qid, question) if o["code"] == code), None)


def added_question_options() -> dict[str, list[dict]]:
    """The document types chosen for questions added here, by code, from the latest version that
    has each one: an assessment held to an older version still finds them after a later change."""
    # Published versions never change, so what they hold is read again only once a newer one is.
    latest = QuestionnaireVersion.objects.order_by("-pk").values_list("pk", flat=True).first()
    key = f"catalogue:added-options:{latest}"
    chosen = cache.get(key)
    if chosen is None:
        chosen = {}
        for qid, codes in Question.objects.exclude(evidence_options=[]).order_by("version_id").values_list(
            "qid", "evidence_options"
        ):
            chosen[qid] = codes
        cache.set(key, chosen, None)
    by_code = options_by_code()
    return {qid: chosen_options(codes, by_code) for qid, codes in chosen.items()}
