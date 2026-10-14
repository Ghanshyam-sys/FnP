import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAssessments, useDepartments } from "../api/queries";
import { formatDate } from "../utils/format";
import { STAGE_LABELS, needsReviewer } from "../state/caseLabels";
import { Loading, LoadError } from "../components/LoadState";
import EmptyState from "../components/EmptyState";
import DepartmentIcon from "../components/DepartmentIcon";
import { routes } from "../routes";
import type { QueueNotice } from "../routes";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BankIcon,
  CheckCircleIcon,
  GridIcon,
  PlusIcon,
  SlidersIcon,
} from "../components/icons";
import type { Assessment, Stage } from "../api/types";

interface QueueRow {
  assignment: Assessment;
  stage: Stage;
}

export default function ReviewerQueuePage() {
  const navigate = useNavigate();
  const notice = (useLocation().state as QueueNotice | null)?.notice;
  // "" lists every department.
  const [department, setDepartment] = useState("");
  const departments = useDepartments();
  // Refreshes itself while any listed case is still with the engine.
  const list = useAssessments(department);

  if (list.isPending) return <Loading />;
  if (list.isError && !list.data) return <LoadError error={list.error} onRetry={() => list.refetch()} />;

  // In the server's order: cases needing the reviewer first, then work in flight, then settled
  // ones, newest activity first within each. "Show more" therefore adds rows at the end, never
  // among the ones already on screen.
  const rows: QueueRow[] = list.data.pages
    .flatMap((p) => p.results)
    .map((assignment) => ({ assignment, stage: assignment.stage }));

  // The whole queue's counts, not just the pages loaded so far.
  const latest = list.data.pages[list.data.pages.length - 1];
  const total = latest?.total ?? rows.length;
  const actionable = latest?.actionable ?? rows.filter((r) => needsReviewer(r.stage)).length;
  const departmentName = departments.data?.find((d) => d.key === department)?.name;

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
            {total} submitted fit and proper assessment{total === 1 ? "" : "s"}{" "}
            {departmentName ? `for ${departmentName}` : "across all departments"}.{" "}
            {actionable > 0
              ? `${actionable} need${actionable === 1 ? "s" : ""} your attention.`
              : "Nothing is waiting on you."}
          </p>
        </div>
        <div className="page-head-aside">
          <button className="btn btn-ghost" onClick={() => navigate(routes.reviewerAdmin())}>
            <GridIcon size={15} />
            Admin panel
          </button>
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

      <div className="queue-filter">
        <label className="field-label" htmlFor="queue-department">
          Department
        </label>
        <select
          id="queue-department"
          className="input"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">All departments</option>
          {departments.data?.map((d) => (
            <option key={d.key} value={d.key}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<BankIcon size={22} />}
          title={departmentName ? `No submitted assessments for ${departmentName}` : "No submitted assessments yet"}
        >
          Assessments appear here once the applicant submits them, whether they started the
          application themselves or you opened it for them. Choose New assessment to open one
          against an application; it joins the queue when the applicant submits it.
        </EmptyState>
      ) : (
        <div className="case-grid">
          {rows.map((row) => {
            const { assignment, stage } = row;
            const label = STAGE_LABELS[stage];
            return (
              <button className="case-card" key={assignment.id} onClick={() => openCase(row)}>
                <div className="case-card-head">
                  <span className="case-avatar">
                    <DepartmentIcon departmentKey={assignment.department.key} size={16} />
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
                    <dd>{assignment.department.name}</dd>
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
      )}

      {list.hasNextPage && (
        <div className="queue-more">
          <button className="btn btn-ghost" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
            {list.isFetchingNextPage ? "Loading…" : "Show more"}
          </button>
        </div>
      )}
    </div>
  );
}

function CaseFootNote({ row }: { row: QueueRow }) {
  const { flagged, openFlags, rejected, decisionRemarks } = row.assignment.queue;

  if (row.stage === "REVIEW_PENDING" && openFlags === 0 && flagged.length > 0) {
    return <span className="case-note is-critical">All answers ruled on — send it on</span>;
  }
  if (row.stage === "REVIEW_PENDING") {
    return (
      <span className="case-note is-critical">
        {openFlags} question{openFlags === 1 ? "" : "s"} to rule on
        {flagged.length > 0 && ` (${flagged.join(", ")})`}
      </span>
    );
  }
  if (row.stage === "AWAITING_APPLICANT") {
    return <span className="case-note">Rejected {rejected.join(", ")} — waiting on new evidence</span>;
  }
  if (row.stage === "DECISION_PENDING") {
    return <span className="case-note">Ready for your decision — accept or reject</span>;
  }
  if (row.stage === "AUTH_FAILED") {
    return <span className="case-note is-critical">Authentication failed — open to send it again</span>;
  }
  if (decisionRemarks) {
    return <span className="case-note">{decisionRemarks.slice(0, 90)}</span>;
  }
  if (row.stage === "NOT_SUBMITTED") {
    return <span className="case-note">Waiting on the applicant</span>;
  }
  return <span className="case-note">No action needed</span>;
}
