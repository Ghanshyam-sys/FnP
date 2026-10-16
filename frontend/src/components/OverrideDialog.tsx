import { useState } from "react";
import Modal, { ModalBanner, RequiredTextArea } from "./Modal";
import { AlertTriangleIcon, InfoIcon } from "./icons";
import type { Verdict } from "../api/types";

/**
 * Accepting a flagged answer overrides a finding the engine made against the evidence, so the
 * reviewer is told plainly what they are doing and has to give a reason. Rejecting agrees with
 * the engine, so it needs a reason but no warning.
 */
export default function OverrideDialog({
  qid,
  question,
  verdict,
  failingChecks,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  qid: string;
  question: string;
  verdict: Verdict;
  failingChecks: string[];
  onConfirm: (comment: string) => void;
  /** The call is being saved: the confirm button waits for it. */
  busy: boolean;
  /** Why the last attempt was not saved; the dialog stays open so nothing typed is lost. */
  error?: string;
  onCancel: () => void;
}) {
  const [comment, setComment] = useState("");
  const isOverride = verdict === "accepted";
  const canConfirm = comment.trim().length > 0;

  return (
    <Modal labelledBy="override-title" wide dismissible={!comment.trim()} onClose={onCancel}>
      <ModalBanner
        tone={isOverride ? "critical" : "info"}
        icon={isOverride ? <AlertTriangleIcon size={17} /> : <InfoIcon size={17} />}
        titleId="override-title"
        title={isOverride ? "You are overriding the AI assessment" : "Reject this answer"}
      >
        {isOverride
          ? "The engine could not authenticate this answer against the evidence. Accepting it records your judgment in place of that finding, and the answer will be scored as submitted."
          : "Once every flagged answer has a ruling, the applicant is asked to attach new evidence for this question, and the assessment then goes back for authentication."}
      </ModalBanner>

      <dl className="modal-detail">
        <div>
          <dt>Question</dt>
          <dd>
            <span className="qid">{qid}</span> {question}
          </dd>
        </div>
        {failingChecks.length > 0 && (
          <div>
            <dt>Engine finding</dt>
            <dd>{failingChecks.join("; ")}</dd>
          </div>
        )}
      </dl>

      <RequiredTextArea
        id="override-comment"
        label={isOverride ? "Reason for accepting" : "What the applicant must provide"}
        value={comment}
        onChange={setComment}
        placeholder={
          isOverride
            ? "Record why the evidence is acceptable despite the finding."
            : "Name the document or correction you need."
        }
        maxLength={2000}
        hint="A comment is required and is kept on the case."
      />

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          className={`btn ${isOverride ? "btn-critical" : "btn-primary"}`}
          disabled={!canConfirm || busy}
          onClick={() => onConfirm(comment.trim())}
        >
          {isOverride ? "Override and accept" : "Reject and return"}
        </button>
      </div>
    </Modal>
  );
}
