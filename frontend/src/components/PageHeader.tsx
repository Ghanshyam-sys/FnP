import type { ReactNode } from "react";
import { departmentFor } from "../data/assignments";
import { STAGE_LABELS } from "../state/caseLabels";
import type { Assignment } from "../data/assignments";
import type { CaseStage } from "../state/caseStore";

/**
 * The title block every page opens with. Anything passed as children sits to the right of the
 * title — a meta grid, a chip, an action button.
 */
export default function PageHeader({
  title,
  sub,
  centered = false,
  children,
}: {
  title: ReactNode;
  sub: ReactNode;
  centered?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className={`page-head${centered ? " page-head-center" : ""}`}>
      <div className="page-head-text">
        <h1>{title}</h1>
        <p className="page-sub">{sub}</p>
      </div>
      {children}
    </header>
  );
}

/** Entity and position, optionally preceded by the requesting department. */
export function AssignmentMeta({
  assignment,
  showDepartment = false,
}: {
  assignment: Assignment;
  showDepartment?: boolean;
}) {
  return (
    <dl className="meta-grid">
      {showDepartment && (
        <div>
          <dt>Requested by</dt>
          <dd>{departmentFor(assignment).name}</dd>
        </div>
      )}
      <div>
        <dt>Entity</dt>
        <dd>{assignment.entity}</dd>
      </div>
      <div>
        <dt>Position applied for</dt>
        <dd>{assignment.position}</dd>
      </div>
    </dl>
  );
}

/** The reviewer's view of a case: who it is, and the stage it is in. */
export function ReviewerCaseHeader({
  assignment,
  stage,
}: {
  assignment: Assignment;
  stage: CaseStage;
}) {
  const label = STAGE_LABELS[stage];
  return (
    <PageHeader
      title={assignment.applicantName}
      sub={
        <>
          {assignment.position} · {departmentFor(assignment).name} · {assignment.reference}
        </>
      }
    >
      <div className="page-head-aside">
        <span className={`chip chip-${label.tone}`}>{label.reviewer}</span>
      </div>
    </PageHeader>
  );
}
