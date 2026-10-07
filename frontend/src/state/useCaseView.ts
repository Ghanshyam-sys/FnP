import { useMemo } from "react";
import { getAssignment } from "./assignmentStore";
import { authenticate } from "../domain/authentication";
import { flaggedQids } from "./reviewState";
import { useAssessment } from "./useAssessment";
import type { Assignment } from "../data/assignments";
import type { ApplicationForm, AuthenticationOutcome } from "../domain/types";

export interface CaseView {
  assignment: Assignment;
  form: ApplicationForm;
  outcome: AuthenticationOutcome;
  /** qids the engine could not authenticate, which is what drives the case stage. */
  flagged: string[];
}

/**
 * Everything a case page starts from: the assessment, its form, the engine's outcome and the
 * flags. Null when the id is unknown, so the page can show its not-found state.
 *
 * The stage is deliberately left to the caller: some pages read it once per render, others
 * against a ticking clock, and that choice decides whether the page animates.
 */
export function useCaseView(id: string): CaseView | null {
  const { getForm } = useAssessment();
  const assignment = getAssignment(id);
  const form = assignment ? getForm(assignment) : null;

  const outcome = useMemo(
    () => (assignment && form ? authenticate(assignment.id, assignment.applicantId, form) : null),
    [assignment, form]
  );
  const flagged = useMemo(() => (outcome ? flaggedQids(outcome) : []), [outcome]);

  if (!assignment || !form || !outcome) return null;
  return { assignment, form, outcome, flagged };
}
