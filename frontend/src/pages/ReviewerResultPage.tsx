import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useDecide } from "../api/queries";
import { refusalMessage } from "../api/client";
import { useCaseView } from "../api/useCaseView";
import { isScored } from "../state/caseLabels";
import { routes } from "../routes";
import { Loading, LoadError } from "../components/LoadState";
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
import type { Verdict } from "../api/types";

export default function ReviewerResultPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Verdict | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Bumped after the decision; keying the page on it re-renders the report from scratch.
  const [revision, setRevision] = useState(0);
  const view = useCaseView(id);
  const decide = useDecide(id);

  if (view.status === "loading") return <Loading />;
  if (view.status === "error") return <LoadError error={view.error} onRetry={view.retry} />;
  const { assessment: assignment, data, outcome, score: scoreResult } = view;
  const stage = data.stage;
  if (!isScored(stage) || !scoreResult || !outcome) {
    // A cached copy can predate the score; only a fresh one decides that scoring is not ready.
    if (view.refreshing) return <Loading />;
    return <Navigate to={routes.reviewerAuthentication(id)} replace />;
  }

  const decision = data.decision;

  const confirm = (remarks: string) => {
    if (!pending) return;
    decide.mutate(
      { verdict: pending, remarks },
      {
        // Kept open on a refusal, which the dialog explains, so the remarks are not lost.
        onSuccess: () => {
          setPending(null);
          setRevision((v) => v + 1);
        },
      }
    );
  };

  return (
    <div className="page" key={revision}>
      <ReviewerCaseHeader assignment={assignment} stage={stage} />

      <ReviewerTabs assessmentId={id} active="scoring" scoringReady />

      {decision ? (
        <div
          className={`notice notice-${decision.verdict === "accepted" ? "good" : "critical"}`}
        >
          {decision.verdict === "accepted" ? (
            <CheckCircleIcon size={17} />
          ) : (
            <AlertTriangleIcon size={17} />
          )}
          <div>
            <strong>
              {decision.verdict === "accepted"
                ? "You accepted this assessment."
                : "You rejected this assessment."}
            </strong>{" "}
            {decision.remarks}
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
        {!decision && (
          <>
            <button className="btn btn-ghost" onClick={() => {
                decide.reset();
                setPending("rejected");
              }}>
              <AlertTriangleIcon size={15} />
              Reject
            </button>
            <button className="btn btn-primary" onClick={() => {
                decide.reset();
                setPending("accepted");
              }}>
              <CheckCircleIcon size={15} />
              Accept
            </button>
          </>
        )}
      </footer>

      {summaryOpen && (
        <AssessmentSummaryPane
          assessment={data.assessment}
          assignment={assignment}
          decision={decision}
          onClose={() => setSummaryOpen(false)}
        />
      )}

      {pending && (
        <DecisionDialog
          verdict={pending}
          applicantName={assignment.applicantName}
          band={scoreResult.band}
          riskScore={scoreResult.riskScore100}
          busy={decide.isPending}
          error={decide.isError ? refusalMessage(decide.error, "remarks") : undefined}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
