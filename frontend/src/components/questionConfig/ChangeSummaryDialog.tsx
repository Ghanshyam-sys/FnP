import Modal from "../Modal";
import { SlidersIcon } from "../icons";

/** What applying the configuration changes, listed before it is published. */
export default function ChangeSummaryDialog({
  lines,
  drafts,
  checking,
  pending,
  onApply,
  onBack,
}: {
  lines: string[];
  /** How many applications not yet submitted it reaches (unknown: null). */
  drafts: number | null;
  /** What it reaches on unsubmitted applications is still being read. */
  checking: boolean;
  pending: boolean;
  onApply: () => void;
  onBack: () => void;
}) {
  return (
    <Modal labelledBy="summary-title" wide onClose={onBack}>
      <span className="modal-icon">
        <SlidersIcon size={20} />
      </span>
      <h2 id="summary-title">Apply these changes?</h2>
      {checking ? (
        <p className="modal-sub" role="status">
          Checking what this changes on applications not yet submitted…
        </p>
      ) : lines.length === 0 ? (
        <p className="modal-sub">Nothing differs from the configuration in force.</p>
      ) : (
        <ul className="change-list">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      <p className="modal-sub">
        {drafts === 0
          ? "It takes effect for every application started from now (none is in progress at the moment)."
          : `It takes effect for ${
              drafts === null
                ? "every application not yet submitted"
                : drafts === 1
                  ? "the 1 application not yet submitted"
                  : `the ${drafts} applications not yet submitted`
            }, and for every one started after.`}{" "}
        Applications already submitted keep the questions they were submitted with.
      </p>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onBack}>
          Back to editing
        </button>
        <button className="btn btn-primary" disabled={pending || checking} onClick={onApply}>
          {pending ? "Applying…" : "Apply"}
        </button>
      </div>
    </Modal>
  );
}
