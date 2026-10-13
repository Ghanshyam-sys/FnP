import type { ReactNode } from "react";
import { STAGE_LABELS } from "../state/caseLabels";
import type { Assessment, Stage } from "../api/types";

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
  assignment: Assessment;
  showDepartment?: boolean;
}) {
  return (
    <dl className="meta-grid">
      {showDepartment && (
        <div>
          <dt>Requested by</dt>
          <dd>{assignment.department.name}</dd>
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
  assignment: Assessment;
  stage: Stage;
}) {
  const label = STAGE_LABELS[stage];
  return (
    <PageHeader
      title={assignment.applicantName}
      sub={
        <>
          {assignment.position} · {assignment.department.name} · {assignment.reference}
        </>
      }
    >
      <div className="page-head-aside">
        <span className={`chip chip-${label.tone}`}>{label.reviewer}</span>
      </div>
    </PageHeader>
  );
}
