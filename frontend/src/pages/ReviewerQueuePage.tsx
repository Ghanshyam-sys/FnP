import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAssessment } from "../state/useAssessment";
import { departmentFor } from "../data/assignments";
import { reviewableAssignments } from "../state/assignmentStore";
import { formatDate } from "../utils/format";
import { caseStatusOf, unresolvedFlags } from "../state/reviewState";
import { anyCaseInFlight, readCase } from "../state/caseStore";
import { useStageTicker } from "../state/useStageTicker";
import { STAGE_LABELS, needsReviewer, queueRank } from "../state/caseLabels";
import { routes } from "../routes";
import type { QueueNotice } from "../routes";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BankIcon,
  CheckCircleIcon,
  PlusIcon,
  SlidersIcon,
} from "../components/icons";
import type { Assignment } from "../data/assignments";
import type { CaseStage } from "../state/caseStore";

interface QueueRow {
  assignment: Assignment;
  stage: CaseStage;
  openFlags: number;
  flaggedQids: string[];
}

export default function ReviewerQueuePage() {
  const navigate = useNavigate();
  const { getForm } = useAssessment();
  const notice = (useLocation().state as QueueNotice | null)?.notice;
  // Read on every render: the reviewer may have just created or removed one.
  const assignments = reviewableAssignments();
  // Derived straight from the stored timestamps, so the clock stops on the render where the
  // last case settles without routing the flag through state.
  const now = useStageTicker(anyCaseInFlight(assignments.map((a) => a.id)));

  const rows = useMemo<QueueRow[]>(() => {
    const built = assignments.map((assignment) => {
      const { outcome, flagged, stage } = caseStatusOf(
        assignment.id,
        assignment.applicantId,
        getForm(assignment),
        now
      );
      return {
        assignment,
        stage,
        openFlags: unresolvedFlags(assignment.id, outcome).length,
        flaggedQids: flagged,
      };
    });
    return built.sort(
      (a, b) =>
        queueRank(a.stage) - queueRank(b.stage) ||
        a.assignment.applicantName.localeCompare(b.assignment.applicantName)
    );
  }, [assignments, getForm, now]);

  const actionable = rows.filter((r) => needsReviewer(r.stage)).length;

  const openCase = (row: QueueRow) => {
    const target = row.stage === "DECISION_PENDING" ? "result" : "authentication";
    navigate(
      target === "result"
        ? routes.reviewerResult(row.assignment.id)
        : routes.reviewerAuthentication(row.assignment.id)
    );
  };

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head-text">
          <h1>Assessment queue</h1>
          <p className="page-sub">
            {rows.length} fit and proper assessment{rows.length === 1 ? "" : "s"} for Banking
            Licence.{" "}
            {actionable > 0
              ? `${actionable} need${actionable === 1 ? "s" : ""} your attention.`
              : "Nothing is waiting on you."}
          </p>
        </div>
        <div className="page-head-aside">
          <button className="btn btn-ghost" onClick={() => navigate(routes.reviewerQuestions())}>
            <SlidersIcon size={15} />
            Configure questions
          </button>
          <button className="btn btn-primary" onClick={() => navigate(routes.reviewerNewAssessment())}>
            <PlusIcon size={15} />
            New assessment
          </button>
        </div>
      </header>

      {notice && (
        <div className="notice notice-good" role="status">
          <CheckCircleIcon size={17} />
          <div>{notice}</div>
        </div>
      )}

      <div className="case-grid">
        {rows.map((row) => {
          const { assignment, stage } = row;
          const label = STAGE_LABELS[stage];
          return (
            <button className="case-card" key={assignment.id} onClick={() => openCase(row)}>
              <div className="case-card-head">
                <span className="case-avatar">
                  <BankIcon size={16} />
                </span>
                <span className={`chip chip-${label.tone}`}>
                  {needsReviewer(stage) && <AlertTriangleIcon size={12} />}
                  {stage === "ACCEPTED" && <CheckCircleIcon size={12} />}
                  {label.reviewer}
                </span>
              </div>

              <h2 className="case-name">{assignment.applicantName}</h2>
              <p className="case-role">
                {assignment.position} · {assignment.entity}
              </p>

              <dl className="case-meta">
                <div>
                  <dt>Reference</dt>
                  <dd>{assignment.reference}</dd>
                </div>
                <div>
                  <dt>Initiated</dt>
                  <dd>{formatDate(assignment.initiatedOn)}</dd>
                </div>
                <div>
                  <dt>Department</dt>
                  <dd>{departmentFor(assignment).name}</dd>
                </div>
              </dl>

              <footer className="case-foot">
                <CaseFootNote row={row} />
                <span className="case-open">
                  {stage === "DECISION_PENDING" ? "Decide" : "Open"}
                  <ArrowRightIcon size={14} />
                </span>
              </footer>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CaseFootNote({ row }: { row: QueueRow }) {
  const record = readCase(row.assignment.id);

  if (row.stage === "REVIEW_PENDING") {
    return (
      <span className="case-note is-critical">
        {row.openFlags} question{row.openFlags === 1 ? "" : "s"} to rule on
        {row.flaggedQids.length > 0 && ` (${row.flaggedQids.join(", ")})`}
      </span>
    );
  }
  if (row.stage === "AWAITING_APPLICANT") {
    const rejected = Object.entries(record.rulings)
      .filter(([, r]) => r.verdict === "rejected")
      .map(([qid]) => qid);
    return <span className="case-note">Rejected {rejected.join(", ")} — waiting on new evidence</span>;
  }
  if (row.stage === "DECISION_PENDING") {
    return <span className="case-note">Scored — accept or reject</span>;
  }
  if (record.decision) {
    return <span className="case-note">{record.decision.remarks.slice(0, 90)}</span>;
  }
  if (row.stage === "NOT_SUBMITTED") {
    return <span className="case-note">Waiting on the applicant</span>;
  }
  return <span className="case-note">No action needed</span>;
}
