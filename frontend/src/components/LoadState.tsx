import EmptyState from "./EmptyState";
import AssessmentNotFound from "./AssessmentNotFound";
import { ApiError } from "../api/client";
import { AlertTriangleIcon } from "./icons";

/** Shown while a page's data is on its way. */
export function Loading() {
  return (
    <div className="page">
      <p className="page-loading" role="status">
        <span className="status-spinner" aria-hidden="true" />
        Loading…
      </p>
    </div>
  );
}

/**
 * Shown when a page's data could not be loaded. A 404 is the not-found page (an assessment the
 * user may not see reads exactly like one that does not exist); anything else offers a retry.
 */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && error.status === 404) return <AssessmentNotFound />;
  const unavailable = error instanceof ApiError && error.status === 503;
  return (
    <div className="page">
      <EmptyState
        icon={<AlertTriangleIcon size={22} />}
        title={unavailable ? "Temporarily unavailable" : "Something went wrong"}
        action={
          <button className="btn btn-primary" onClick={onRetry}>
            Try again
          </button>
        }
      >
        {unavailable
          ? "The authentication service is not responding. Try again in a moment."
          : "This page could not be loaded. Check your connection and try again."}
      </EmptyState>
    </div>
  );
}
