import type { Stage } from "../api/types";

/**
 * How each stage reads in the two queues. `tone` maps onto the chip palette: green-grey for work
 * in flight, red for answers to rule on, a rejection or a failed run, blue once ready for the
 * decision, amber when it is waiting on the applicant, green once accepted.
 */
export const STAGE_LABELS: Record<Stage, { reviewer: string; applicant: string; tone: string }> = {
  NOT_SUBMITTED: { reviewer: "Not submitted", applicant: "Draft saved", tone: "neutral" },
  AUTH_RUNNING: {
    reviewer: "Authentication running",
    applicant: "Authentication pending",
    tone: "info",
  },
  AUTH_FAILED: { reviewer: "Authentication failed", applicant: "Authentication failed", tone: "critical" },
  REVIEW_PENDING: { reviewer: "Review pending", applicant: "With the reviewer", tone: "critical" },
  AWAITING_APPLICANT: {
    reviewer: "Awaiting applicant",
    applicant: "Authentication pending — resubmit",
    tone: "warning",
  },
  SCORING: { reviewer: "Scoring in progress", applicant: "Scoring in progress", tone: "info" },
  DECISION_PENDING: { reviewer: "Decision pending", applicant: "Awaiting decision", tone: "decision" },
  ACCEPTED: { reviewer: "Accepted", applicant: "Accepted", tone: "low" },
  REJECTED: { reviewer: "Rejected", applicant: "Rejected", tone: "critical" },
};

/**
 * The stages in the order they are listed (the status filter, the admin overview): those needing the
 * reviewer's hands first, then work in flight, then settled ones. Not the queue's order: the
 * queue lists the case acted on most recently first, whatever its stage.
 */
export const STAGE_ORDER: Stage[] = [
  "REVIEW_PENDING",
  "DECISION_PENDING",
  "AUTH_FAILED",
  "AWAITING_APPLICANT",
  "SCORING",
  "AUTH_RUNNING",
  "ACCEPTED",
  "REJECTED",
  "NOT_SUBMITTED",
];

export function stageRank(stage: Stage): number {
  const index = STAGE_ORDER.indexOf(stage);
  return index === -1 ? STAGE_ORDER.length : index;
}

/** True when the stage is one the reviewer has to act on (a failed run can be retried). */
export function needsReviewer(stage: Stage): boolean {
  return stage === "REVIEW_PENDING" || stage === "DECISION_PENDING" || stage === "AUTH_FAILED";
}

/** True once scoring has finished, which is what gates the scoring report. */
export function isScored(stage: Stage): boolean {
  return stage === "DECISION_PENDING" || stage === "ACCEPTED" || stage === "REJECTED";
}
