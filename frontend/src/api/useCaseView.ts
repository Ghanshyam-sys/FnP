import { useAssessment, useCase } from "./queries";
import { toOutcome, toScoreResult } from "./adapt";
import type { Assessment, Case } from "./types";
import type { AuthenticationOutcome, ScoreResult } from "../domain/types";

export type CaseView =
  | { status: "loading" }
  | { status: "error"; error: unknown; retry: () => void }
  | {
      status: "ready";
      assessment: Assessment;
      data: Case;
      /** The engine's report, once authentication has run. */
      outcome: AuthenticationOutcome | null;
      score: ScoreResult | null;
      /** A newer copy of the case is on its way; the one shown may be out of date. */
      refreshing: boolean;
    };

/**
 * What every case page starts from: the assessment and its case, with the report and score in the
 * shapes the report components render. The case refreshes itself while the engine is working.
 */
export function useCaseView(id: string): CaseView {
  const assessment = useAssessment(id);
  const caseQuery = useCase(id);
  // A failed background refresh keeps what is on screen; only a page with nothing to show yet
  // turns into the error page.
  const failed = [assessment, caseQuery].find((q) => q.isError && q.data === undefined);
  if (failed) {
    return {
      status: "error",
      error: failed.error,
      retry: () => [assessment, caseQuery].forEach((q) => q.isError && q.refetch()),
    };
  }
  if (!assessment.data || !caseQuery.data) return { status: "loading" };
  return {
    status: "ready",
    assessment: assessment.data,
    data: caseQuery.data,
    outcome: toOutcome(id, caseQuery.data),
    score: toScoreResult(id, caseQuery.data),
    refreshing: caseQuery.isFetching,
  };
}
