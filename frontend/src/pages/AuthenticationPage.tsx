import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAssessment } from "../state/useAssessment";
import { departmentFor } from "../data/assignments";
import { issuesIn } from "../domain/authentication";
import { rejectedFlags } from "../state/reviewState";
import { isScored, recordResubmission, stageFor } from "../state/caseStore";
import { useCaseView } from "../state/useCaseView";
import { buildEvidenceRef, CV_QID } from "../domain/evidenceOptions";
import { routes } from "../routes";
import AssessmentNotFound from "../components/AssessmentNotFound";
import OutcomeTabs from "../components/OutcomeTabs";
import AuthenticationReport from "../components/AuthenticationReport";
import EvidenceBlock from "../components/EvidenceBlock";
import PageHeader from "../components/PageHeader";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  MessageIcon,
} from "../components/icons";
import type { EvidenceRole, QuestionAuthResult } from "../domain/types";

export default function AuthenticationPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { attachEvidence, removeEvidence } = useAssessment();
  const [resubmitted, setResubmitted] = useState(false);
  const view = useCaseView(id);

  if (!view) return <AssessmentNotFound />;
  const { assignment, form, outcome, flagged } = view;

  const stage = stageFor(id, flagged);
  const rejected = rejectedFlags(id, outcome);
  const issues = issuesIn(outcome);
  // Only a rejection puts the ball back in the applicant's court.
  const mustResubmit = stage === "AWAITING_APPLICANT";
  const rejectedQids = new Set(rejected.map((r) => r.result.qid));

  // Resubmitted evidence uses each document type's own format; the reviewer's configuration
  // applies only before the first submission.
  const handleAttach = (qid: string, optionCode: string, role: EvidenceRole, description?: string) => {
    const ref = buildEvidenceRef(assignment.applicantId, qid, optionCode, role, description);
    if (ref) attachEvidence(assignment, qid, ref);
  };

  const resubmit = () => {
    recordResubmission(id);
    setResubmitted(true);
    navigate(routes.applyStatus(id));
  };

  const questionFooter = (result: QuestionAuthResult) => {
    if (!mustResubmit || !rejectedQids.has(result.qid)) return null;
    const ruling = rejected.find((r) => r.result.qid === result.qid)?.ruling;
    const response = form.responses.find((r) => r.qid === result.qid);

    return (
      <div className="resubmit-block">
        {ruling && (
          <div className="reviewer-note">
            <MessageIcon size={14} />
            <div>
              <span className="reviewer-note-label">Reviewer</span>
              <p>{ruling.comment}</p>
            </div>
          </div>
        )}
        {response && result.qid !== CV_QID && (
          <EvidenceBlock
            qid={result.qid}
            evidence={response.evidence}
            onAttach={(code, role, description) => handleAttach(result.qid, code, role, description)}
            onRemove={(docType) => removeEvidence(assignment, result.qid, docType)}
          />
        )}
      </div>
    );
  };

  const notice = mustResubmit ? (
    <div className="notice notice-warning">
      <AlertTriangleIcon size={17} />
      <div>
        <strong>
          The reviewer rejected {rejected.length} answer{rejected.length > 1 ? "s" : ""}
        </strong>{" "}
        ({rejected.map((r) => r.result.qid).join(", ")}). Attach the evidence they asked for below,
        then resubmit. The assessment goes back for authentication.
      </div>
    </div>
  ) : issues.length > 0 ? (
    <div className="notice notice-critical">
      <AlertTriangleIcon size={17} />
      <div>
        <strong>
          {issues.length} question{issues.length > 1 ? "s" : ""} could not be authenticated
        </strong>{" "}
        ({issues.map((q) => q.qid).join(", ")}).{" "}
        {stage === "REVIEW_PENDING"
          ? "A reviewer is looking at these now. You will be told if any answer needs new evidence."
          : "Scoring does not run until these are resolved."}
      </div>
    </div>
  ) : (
    <div className="notice notice-good">
      <CheckCircleIcon size={17} />
      <div>
        <strong>Every answer was authenticated against its evidence.</strong> The submission passed
        to scoring.
      </div>
    </div>
  );

  return (
    <div className="page">
      <PageHeader
        title="Authentication result"
        sub={
          <>
            Each answer is checked against the document attached to it.{" "}
            {departmentFor(assignment).name} · {assignment.reference}
          </>
        }
      />

      <OutcomeTabs assessmentId={id} active="authentication" scoringReady={isScored(stage)} />

      <AuthenticationReport
        assessmentId={id}
        outcome={outcome}
        notice={notice}
        questionFooter={questionFooter}
      />

      <footer className="actionbar">
        <button className="btn btn-ghost" onClick={() => navigate(routes.applyStatus(id))}>
          <ArrowLeftIcon size={15} />
          Back to status
        </button>
        {mustResubmit && (
          <button className="btn btn-primary" disabled={resubmitted} onClick={resubmit}>
            Resubmit for authentication
            <ArrowRightIcon size={15} />
          </button>
        )}
      </footer>
    </div>
  );
}
