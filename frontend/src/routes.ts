/**
 * Every path the app navigates to, in one place. `App.tsx` registers the patterns; everything
 * else builds links with the helpers so a route can be renamed without a search-and-replace.
 */
export const ROUTE_PATTERNS = {
  login: "/",
  assessments: "/assessments",
  apply: "/apply/:id",
  applyReview: "/apply/:id/review",
  applyStatus: "/apply/:id/status",
  applyAuthentication: "/apply/:id/authentication",
  applyResult: "/apply/:id/result",
  reviewer: "/reviewer",
  reviewerQuestions: "/reviewer/questions",
  reviewerNewAssessment: "/reviewer/assessments/new",
  reviewerAuthentication: "/reviewer/:id/authentication",
  reviewerResult: "/reviewer/:id/result",
} as const;

/** The applicant's steps after the form itself, in the order the stepper shows them. */
export type ApplyStep = "review" | "status" | "authentication" | "result";

export const routes = {
  login: () => ROUTE_PATTERNS.login,
  assessments: () => ROUTE_PATTERNS.assessments,
  apply: (id: string) => `/apply/${id}`,
  applyStep: (id: string, step: ApplyStep) => `/apply/${id}/${step}`,
  applyReview: (id: string) => routes.applyStep(id, "review"),
  applyStatus: (id: string) => routes.applyStep(id, "status"),
  applyAuthentication: (id: string) => routes.applyStep(id, "authentication"),
  applyResult: (id: string) => routes.applyStep(id, "result"),
  reviewer: () => ROUTE_PATTERNS.reviewer,
  reviewerQuestions: () => ROUTE_PATTERNS.reviewerQuestions,
  reviewerNewAssessment: () => ROUTE_PATTERNS.reviewerNewAssessment,
  reviewerAuthentication: (id: string) => `/reviewer/${id}/authentication`,
  reviewerResult: (id: string) => `/reviewer/${id}/result`,
};

/** Navigation state the reviewer queue reads, so it can confirm what the reviewer just did. */
export interface QueueNotice {
  notice: string;
}

/** Reads an applicant route back into its parts, for the shell's stepper. */
export function parseApplyPath(
  pathname: string
): { assignmentId: string; step: ApplyStep | null } | null {
  const match = /^\/apply\/([^/]+)(?:\/(review|status|authentication|result))?\/?$/.exec(pathname);
  if (!match) return null;
  return { assignmentId: match[1], step: (match[2] as ApplyStep | undefined) ?? null };
}
