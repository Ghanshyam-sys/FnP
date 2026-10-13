import { useNavigate, useParams } from "react-router-dom";
import { useRetry } from "../api/queries";
import { useCaseView } from "../api/useCaseView";
import { isScored } from "../state/caseLabels";
import { routes } from "../routes";
import { Loading, LoadError } from "../components/LoadState";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  MessageIcon,
  ShieldCheckIcon,
} from "../components/icons";
import type { Case, Stage } from "../api/types";

/** Typical engine durations, for the progress bar's estimate. It never shows a run as finished. */
const EXPECTED_SECONDS: Partial<Record<Stage, number>> = { AUTH_RUNNING: 90, SCORING: 25 };

function progressOf(data: Case): number {
  const run = data.run;
  const expected = EXPECTED_SECONDS[data.stage];
  if (!run || !expected) return 0;
  const started = data.stage === "SCORING" && run.authenticatedAt ? run.authenticatedAt : run.submittedAt;
  const elapsed = (Date.now() - new Date(started).getTime()) / 1000;
  return Math.min(95, Math.max(5, (elapsed / expected) * 100));
}

const COPY: Record<
  Exclude<Stage, "NOT_SUBMITTED">,
  { title: string; detail: string; tone: string }
> = {
  AUTH_FAILED: {
    title: "Authentication could not run",
    detail:
      "The authentication service could not process this submission. Your answers and documents are kept — send it again to retry.",
    tone: "critical",
  },
  AUTH_RUNNING: {
    title: "Authentication pending",
    detail:
      "Your documents are being read and checked against your answers. Nothing is scored until this finishes.",
    tone: "info",
  },
  REVIEW_PENDING: {
    title: "Authentication completed · with the reviewer",
    detail:
      "One or more answers could not be authenticated against the evidence, so the assessment has gone to a reviewer. You can act once they have accepted or rejected those answers.",
    tone: "info",
  },
  AWAITING_APPLICANT: {
    title: "Action needed · evidence rejected",
    detail:
      "The reviewer did not accept the evidence behind one or more answers. Attach the documents they asked for and resubmit; the assessment then goes back for authentication.",
    tone: "critical",
  },
  SCORING: {
    title: "Authentication completed · scoring in progress",
    detail: "Every answer is authenticated. The fit and proper score is being calculated now.",
    tone: "good",
  },
  DECISION_PENDING: {
    title: "With the reviewer for a decision",
    detail:
      "Authentication is finished. The reviewer is considering the outcome; the reports are available below.",
    tone: "good",
  },
  ACCEPTED: {
    title: "Accepted",
    detail: "The reviewer accepted this assessment. Their feedback and the reports are available below.",
    tone: "good",
  },
  REJECTED: {
    title: "Rejected",
    detail: "The reviewer rejected this assessment. Their feedback and the reports are available below.",
    tone: "critical",
  },
};

function reviewStageClass(status: Stage): string {
  if (status === "AUTH_RUNNING" || status === "AUTH_FAILED") return "is-todo";
  if (status === "REVIEW_PENDING") return "is-active";
  if (status === "AWAITING_APPLICANT") return "is-blocked";
  return "is-done";
}

function scoringStageClass(status: Stage): string {
  if (status === "SCORING") return "is-active";
  if (status === "AWAITING_APPLICANT") return "is-blocked";
  return isScored(status) ? "is-done" : "is-todo";
}
/** Authentication and scoring finish on their own; the case refreshes itself while they run. */
const isRunning = (stage: Stage) => stage === "AUTH_RUNNING" || stage === "SCORING";

export default function StatusPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const view = useCaseView(id);
  const retry = useRetry(id);

  if (view.status === "loading") return <Loading />;
  if (view.status === "error") return <LoadError error={view.error} onRetry={view.retry} />;
  const { assessment: assignment, data } = view;
  const status = data.stage;
  const settled = !isRunning(status);

  if (status === "NOT_SUBMITTED") {
    return (
      <div className="page">
        <EmptyState
          icon={<ShieldCheckIcon size={22} />}
          title="Nothing submitted yet"
          action={
            <button className="btn btn-primary" onClick={() => navigate(routes.apply(id))}>
              Go to the form
            </button>
          }
        >
          This assessment has not been submitted, so there is no status to report.
        </EmptyState>
      </div>
    );
  }

  const copy = COPY[status];
  const progress = progressOf(data);

  return (
    <div className="page page-narrow">
      <PageHeader
        title="Submission status"
        sub={
          <>
            {assignment.department.name} · {assignment.reference}
          </>
        }
        centered
      />
      <section className={`card status-card status-${copy.tone}`}>
        <span className="status-icon">
          {status === "AUTH_RUNNING" || status === "SCORING" ? (
            <span className="status-spinner" />
          ) : status === "AWAITING_APPLICANT" || status === "REJECTED" || status === "AUTH_FAILED" ? (
            <AlertTriangleIcon size={22} />
          ) : (
            <CheckCircleIcon size={22} />
          )}
        </span>

        <h2 className="status-title">{copy.title}</h2>
        <p className="status-detail">{copy.detail}</p>

        {data.decision && (
          <div className="reviewer-note status-remarks">
            <MessageIcon size={14} />
            <div>
              <span className="reviewer-note-label">Reviewer's remarks</span>
              <p>{data.decision.remarks}</p>
            </div>
          </div>
        )}

        {!settled && (
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}

        <ol className="status-stages">
          <li className={status === "AUTH_RUNNING" ? "is-active" : status === "AUTH_FAILED" ? "is-blocked" : "is-done"}>
            <span className="stage-dot" />
            Authentication
          </li>
          <li className={reviewStageClass(status)}>
            <span className="stage-dot" />
            Reviewer
          </li>
          <li className={scoringStageClass(status)}>
            <span className="stage-dot" />
            Scoring
          </li>
        </ol>

        {status === "AUTH_FAILED" && data.run?.unconfirmed && (
          <div className="notice notice-warning" role="note">
            <AlertTriangleIcon size={17} />
            <div>
              <strong>The engine may still be working on the last attempt.</strong> It did not confirm
              receiving it in time. Sending again starts a second run, so check with the engine team first.
            </div>
          </div>
        )}

        <div className="status-actions">
          {status === "AUTH_FAILED" && (
            <button className="btn btn-primary" disabled={retry.isPending} onClick={() => retry.mutate()}>
              {retry.isPending ? "Sending…" : "Send again"}
              <ArrowRightIcon size={15} />
            </button>
          )}
          {status !== "AUTH_RUNNING" && status !== "AUTH_FAILED" && (
            <button
              className={`btn ${isScored(status) ? "btn-ghost" : "btn-primary"}`}
              onClick={() => navigate(routes.applyAuthentication(id))}
            >
              {status === "AWAITING_APPLICANT"
                ? "Review and resubmit evidence"
                : "View authentication result"}
              <ArrowRightIcon size={15} />
            </button>
          )}
          {isScored(status) && (
            <button className="btn btn-primary" onClick={() => navigate(routes.applyResult(id))}>
              View score
              <ArrowRightIcon size={15} />
            </button>
          )}
        </div>
      </section>

      <footer className="actionbar">
        <button className="btn btn-ghost" onClick={() => navigate(routes.assessments())}>
          <ArrowLeftIcon size={15} />
          Back to your assessments
        </button>
      </footer>
    </div>
  );
}
