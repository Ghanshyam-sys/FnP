import { useState } from "react";
import EmptyState from "./EmptyState";
import { AlertTriangleIcon, MailIcon } from "./icons";
import type { Assessment } from "../api/types";

/**
 * What the reviewer sees for an assessment the applicant has not submitted: there is nothing to
 * authenticate yet. An assessment the reviewer created can be removed from here, behind a confirm
 * step, since removing it also deletes any draft the applicant has started.
 */
export default function NotSubmittedPanel({
  assignment,
  canRemove,
  onRemove,
}: {
  assignment: Assessment;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const action = !canRemove ? undefined : confirming ? (
    <div className="remove-confirm" role="alert">
      <p>
        <strong>Remove this assessment?</strong> {assignment.applicantName} will no longer see it,
        and any draft they have started is deleted. This cannot be undone.
      </p>
      <div className="remove-confirm-actions">
        <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
          Cancel
        </button>
        <button className="btn btn-critical" onClick={onRemove}>
          Remove assessment
        </button>
      </div>
    </div>
  ) : (
    <button className="btn btn-ghost" onClick={() => setConfirming(true)}>
      <AlertTriangleIcon size={15} />
      Remove assessment
    </button>
  );

  return (
    <EmptyState icon={<MailIcon size={22} />} title="Not submitted yet" action={action}>
      {assignment.applicantName} has not submitted this assessment
      {assignment.startedByApplicant ? ", which they started themselves" : ""}. It is authenticated as
      soon as they do, and appears here for your review. They sign in as {assignment.applicantEmail}.
    </EmptyState>
  );
}
