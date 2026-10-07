import { useState } from "react";
import Modal, { ModalBanner, RequiredTextArea } from "./Modal";
import { AlertTriangleIcon, CheckCircleIcon } from "./icons";
import type { RulingVerdict } from "../state/caseStore";
import type { Band } from "../domain/types";

/** The reviewer's final call on a scored assessment. Remarks are required either way. */
export default function DecisionDialog({
  verdict,
  applicantName,
  band,
  riskScore,
  onConfirm,
  onCancel,
}: {
  verdict: RulingVerdict;
  applicantName: string;
  band: Band;
  riskScore: number;
  onConfirm: (remarks: string) => void;
  onCancel: () => void;
}) {
  const [remarks, setRemarks] = useState("");
  const isAccept = verdict === "accepted";
  const canConfirm = remarks.trim().length > 0;

  return (
    <Modal labelledBy="decision-title" wide onClose={onCancel}>
      <ModalBanner
        tone={isAccept ? "good" : "critical"}
        icon={isAccept ? <CheckCircleIcon size={17} /> : <AlertTriangleIcon size={17} />}
        titleId="decision-title"
        title={isAccept ? "Accept this assessment" : "Reject this assessment"}
      >
        {isAccept
          ? "The assessment closes as accepted. Your remarks are recorded on the case and shown to the applicant."
          : "The assessment closes as rejected. Your remarks are recorded on the case and shown to the applicant."}
      </ModalBanner>

      <dl className="modal-detail">
        <div>
          <dt>Applicant</dt>
          <dd>{applicantName}</dd>
        </div>
        <div>
          <dt>Risk score</dt>
          <dd>
            {riskScore.toFixed(1)} · {band}
          </dd>
        </div>
      </dl>

      <RequiredTextArea
        id="decision-remarks"
        label="Remarks"
        value={remarks}
        onChange={setRemarks}
        placeholder={
          isAccept
            ? "Record any conditions or monitoring attached to the approval."
            : "Record the grounds for rejection."
        }
        hint="Remarks are required."
      />

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          className={`btn ${isAccept ? "btn-primary" : "btn-critical"}`}
          disabled={!canConfirm}
          onClick={() => onConfirm(remarks.trim())}
        >
          {isAccept ? "Accept assessment" : "Reject assessment"}
        </button>
      </div>
    </Modal>
  );
}
