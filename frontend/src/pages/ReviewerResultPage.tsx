import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { isScored, readCase, recordDecision, stageFor } from "../state/caseStore";
import { scoreFor } from "../state/reviewState";
import { useCaseView } from "../state/useCaseView";
import { finalAssessmentFor } from "../domain/finalAssessment";
import { routes } from "../routes";
import AssessmentNotFound from "../components/AssessmentNotFound";
import ReportView from "../components/ReportView";
import AssessmentSummaryPane from "../components/AssessmentSummaryPane";
import DecisionDialog from "../components/DecisionDialog";
import ReviewerTabs from "../components/ReviewerTabs";
import { ReviewerCaseHeader } from "../components/PageHeader";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  FileTextIcon,
  MessageIcon,
} from "../components/icons";
import type { RulingVerdict } from "../state/caseStore";

export default function ReviewerResultPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [pending, setPending] = useState<RulingVerdict | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Bumped after the decision; keying the page on it re-renders the report from scratch.
  const [revision, setRevision] = useState(0);
  const view = useCaseView(id);

  if (!view) return <AssessmentNotFound />;
  const { assignment, form, outcome, flagged } = view;

  const scoreResult = scoreFor(id, form, outcome);
  const stage = stageFor(id, flagged);
  if (!isScored(stage) || !scoreResult) {
    return <Navigate to={routes.reviewerAuthentication(id)} replace />;
  }

  const record = readCase(id);

  const confirm = (remarks: string) => {
    if (!pending) return;
    recordDecision(id, pending, remarks);
    setPending(null);
    setRevision((v) => v + 1);
  };

  return (
    <div className="page" key={revision}>
      <ReviewerCaseHeader assignment={assignment} stage={stage} />

      <ReviewerTabs assessmentId={id} active="scoring" scoringReady />

      {record.decision ? (
        <div
          className={`notice notice-${record.decision.verdict === "accepted" ? "good" : "critical"}`}
        >
          {record.decision.verdict === "accepted" ? (
            <CheckCircleIcon size={17} />
          ) : (
            <AlertTriangleIcon size={17} />
          )}
          <div>
            <strong>
              {record.decision.verdict === "accepted"
                ? "You accepted this assessment."
                : "You rejected this assessment."}
            </strong>{" "}
            {record.decision.remarks}
          </div>
        </div>
      ) : (
        <div className="notice notice-info">
          <MessageIcon size={17} />
          <div>
            <strong>This assessment is scored and waiting on your decision.</strong> Accept or
            reject it below; your remarks are recorded on the case and shown to the applicant.
          </div>
        </div>
      )}

      <ReportView authentication={outcome} scoreResult={scoreResult} />

      <footer className="actionbar">
        <button className="btn btn-ghost" onClick={() => navigate(routes.reviewer())}>
          <ArrowLeftIcon size={15} />
          Back to the queue
        </button>
        <button className="btn btn-ghost" onClick={() => setSummaryOpen(true)}>
          <FileTextIcon size={15} />
          Assessment summary
        </button>
        {!record.decision && (
          <>
            <button className="btn btn-ghost" onClick={() => setPending("rejected")}>
              <AlertTriangleIcon size={15} />
              Reject
            </button>
            <button className="btn btn-primary" onClick={() => setPending("accepted")}>
              <CheckCircleIcon size={15} />
              Accept
            </button>
          </>
        )}
      </footer>

      {summaryOpen && (
        <AssessmentSummaryPane
          assessment={finalAssessmentFor(assignment.applicantId)}
          applicantName={assignment.applicantName}
          onClose={() => setSummaryOpen(false)}
        />
      )}

      {pending && (
        <DecisionDialog
          verdict={pending}
          applicantName={assignment.applicantName}
          band={scoreResult.band}
          riskScore={scoreResult.riskScore100}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
