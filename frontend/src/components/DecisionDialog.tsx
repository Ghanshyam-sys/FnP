import { useState } from "react";
import Modal, { ModalBanner, RequiredTextArea } from "./Modal";
import { AlertTriangleIcon, CheckCircleIcon } from "./icons";
import type { Verdict } from "../api/types";
import type { Band } from "../domain/types";

/**
 * The reviewer's final call on an assessment. Feedback is required either way: it is recorded on
 * the case, shown to the applicant and printed in the assessment summary.
 */
export default function DecisionDialog({
  verdict,
  applicantName,
  band,
  riskScore,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  verdict: Verdict;
  applicantName: string;
  /** Absent when the AI engine did not score the assessment. */
  band?: Band;
  riskScore?: number;
  onConfirm: (remarks: string) => void;
  /** The call is being saved: the confirm button waits for it. */
  busy: boolean;
  /** Why the last attempt was not saved; the dialog stays open so nothing typed is lost. */
  error?: string;
  onCancel: () => void;
}) {
  const [remarks, setRemarks] = useState("");
  const isAccept = verdict === "accepted";
  const canConfirm = remarks.trim().length > 0;

  return (
    <Modal labelledBy="decision-title" wide dismissible={!remarks.trim()} onClose={onCancel}>
      <ModalBanner
        tone={isAccept ? "good" : "critical"}
        icon={isAccept ? <CheckCircleIcon size={17} /> : <AlertTriangleIcon size={17} />}
        titleId="decision-title"
        title={isAccept ? "Accept this assessment" : "Reject this assessment"}
      >
        {isAccept
          ? "The assessment closes as accepted. Your feedback is recorded on the case, shown to the applicant and included in the assessment summary."
          : "The assessment closes as rejected. Your feedback is recorded on the case, shown to the applicant and included in the assessment summary."}
      </ModalBanner>

      <dl className="modal-detail">
        <div>
          <dt>Applicant</dt>
          <dd>{applicantName}</dd>
        </div>
        <div>
          <dt>Risk score</dt>
          <dd>{riskScore !== undefined && band ? `${riskScore.toFixed(1)} · ${band}` : "Not scored by the AI engine"}</dd>
        </div>
      </dl>

      <RequiredTextArea
        id="decision-remarks"
        label="Feedback"
        value={remarks}
        onChange={setRemarks}
        placeholder={
          isAccept
            ? "Your feedback for the applicant, and any conditions or monitoring attached to the approval."
            : "Your feedback for the applicant, and the grounds for rejection."
        }
        maxLength={4000}
        hint="Feedback is required."
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
          className={`btn ${isAccept ? "btn-primary" : "btn-critical"}`}
          disabled={!canConfirm || busy}
          onClick={() => onConfirm(remarks.trim())}
        >
          {isAccept ? "Accept assessment" : "Reject assessment"}
        </button>
      </div>
    </Modal>
  );
}
