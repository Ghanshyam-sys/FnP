import { authenticate, issuesIn } from "../domain/authentication";
import { score } from "../domain/engine";
import { readCase, stageFor } from "./caseStore";
import type { CaseStage, QuestionRuling } from "./caseStore";
import type {
  ApplicationForm,
  AuthenticationOutcome,
  QuestionAuthResult,
  ScoreResult,
} from "../domain/types";

/**
 * The authentication engine is deterministic: the same evidence always produces the same flags.
 * A reviewer's ruling does not change the engine's finding — it sits on top of it, recording
 * that a human looked at the flag and either overrode it or sent it back. This module is where
 * the two are combined, so the applicant and reviewer portals never disagree about a case.
 */

interface FlaggedQuestion {
  result: QuestionAuthResult;
  ruling: QuestionRuling | null;
}

/** qids the AI could not authenticate, in report order. */
export function flaggedQids(outcome: AuthenticationOutcome): string[] {
  return issuesIn(outcome).map((q) => q.qid);
}

function flaggedQuestions(
  assessmentId: string,
  outcome: AuthenticationOutcome
): FlaggedQuestion[] {
  const record = readCase(assessmentId);
  return issuesIn(outcome).map((result) => ({
    result,
    ruling: record.rulings[result.qid] ?? null,
  }));
}

/**
 * A resubmission is taken to carry correct evidence, so the flags from the previous pass no
 * longer apply. Until then, a flag counts only while the reviewer has not overridden it.
 */
export function unresolvedFlags(
  assessmentId: string,
  outcome: AuthenticationOutcome
): FlaggedQuestion[] {
  const record = readCase(assessmentId);
  if (record.resubmittedAt !== null) return [];
  return flaggedQuestions(assessmentId, outcome).filter(
    (f) => f.ruling?.verdict !== "accepted"
  );
}

export function rejectedFlags(
  assessmentId: string,
  outcome: AuthenticationOutcome
): FlaggedQuestion[] {
  const record = readCase(assessmentId);
  if (record.resubmittedAt !== null) return [];
  return flaggedQuestions(assessmentId, outcome).filter(
    (f) => f.ruling?.verdict === "rejected"
  );
}

/** What the applicant and reviewer see against a single question on the report. */
export type QuestionReviewState = "clean" | "flagged" | "overridden" | "rejected";

export function reviewStateFor(
  assessmentId: string,
  result: QuestionAuthResult
): QuestionReviewState {
  if (result.status !== "issue") return "clean";
  const record = readCase(assessmentId);
  if (record.resubmittedAt !== null) return "clean";
  const ruling = record.rulings[result.qid];
  if (!ruling) return "flagged";
  return ruling.verdict === "accepted" ? "overridden" : "rejected";
}

/**
 * The score, once nothing stands in its way. A flag the reviewer has overridden no longer blocks
 * scoring, so the gate is "nothing unresolved" rather than "the engine found nothing". Scored
 * against the weights in force when it was submitted, not whatever the reviewer has configured
 * since.
 *
 * Reads the stored case on every call, so callers should not memoise it on the form alone.
 */
export function scoreFor(
  assessmentId: string,
  form: ApplicationForm,
  outcome: AuthenticationOutcome
): ScoreResult | null {
  if (unresolvedFlags(assessmentId, outcome).length > 0) return null;
  return score(form, readCase(assessmentId).weightSnapshot);
}

/** The engine's flags for a form and the stage they put the case in, as the two lists show it. */
export function caseStatusOf(
  assessmentId: string,
  applicantId: string,
  form: ApplicationForm,
  now: number = Date.now()
): { outcome: AuthenticationOutcome; flagged: string[]; stage: CaseStage } {
  const outcome = authenticate(assessmentId, applicantId, form);
  const flagged = flaggedQids(outcome);
  return { outcome, flagged, stage: stageFor(assessmentId, flagged, now) };
}
