import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { isScored } from "../state/caseLabels";
import { useCaseView } from "../api/useCaseView";
import { routes } from "../routes";
import ReportView from "../components/ReportView";
import OutcomeTabs from "../components/OutcomeTabs";
import { Loading, LoadError } from "../components/LoadState";
import AssessmentSummaryPane from "../components/AssessmentSummaryPane";
import PageHeader, { AssignmentMeta } from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircleIcon, FileTextIcon, InfoIcon } from "../components/icons";

export default function ResultPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const view = useCaseView(id);

  if (view.status === "loading") return <Loading />;
  if (view.status === "error") return <LoadError error={view.error} onRetry={view.retry} />;
  const { assessment: assignment, data, outcome, score: scoreResult } = view;
  const decision = data.decision;

  // Open once the case is with the reviewer for a decision, or decided. It may have no score: the
  // AI engine scores only a submission in which every answer was authenticated.
  if (!isScored(data.stage) || !outcome) {
    // A cached copy can predate the decision stage; only a fresh one decides it is not ready.
    if (view.refreshing) return <Loading />;
    return <Navigate to={routes.applyStatus(id)} replace />;
  }

  return (
    <div className="page">
      <PageHeader
        title={scoreResult ? "Scoring result" : "Result"}
        sub={
          <>
            {scoreResult ? "Weighted against authenticated answers only. " : ""}
            {assignment.department.name} · {assignment.reference}
          </>
        }
      >
        <AssignmentMeta assignment={assignment} />
      </PageHeader>

      <OutcomeTabs assessmentId={id} active="scoring" scoringReady />

      {decision && (
        <div className={`notice notice-${decision.verdict === "accepted" ? "good" : "critical"}`}>
          {decision.verdict === "accepted" ? <CheckCircleIcon size={17} /> : <AlertTriangleIcon size={17} />}
          <div>
            <strong>
              {decision.verdict === "accepted"
                ? "The reviewer accepted this assessment."
                : "The reviewer rejected this assessment."}
            </strong>{" "}
            Feedback: {decision.remarks}
          </div>
        </div>
      )}

      {data.score?.source === "backend_override" && (
        <div className="notice notice-info">
          <InfoIcon size={17} />
          <div>
            <strong>Scored by the app's own rules.</strong> This score was calculated by the app, not
            the AI engine, before only AI-engine scores were used. It is shown because the decision
            was made on it.
          </div>
        </div>
      )}

      {scoreResult ? (
        <ReportView authentication={outcome} scoreResult={scoreResult} concerns={data.assessment?.concerns} />
      ) : (
        <EmptyState icon={<InfoIcon size={22} />} title="No risk score">
          The AI engine scores only a submission in which every answer was authenticated, so this
          assessment has no risk score. {decision ? "The reviewer decided" : "The reviewer decides"} on
          the authentication report; you can read it on the Authentication tab.
        </EmptyState>
      )}

      <footer className="actionbar">
        <button className="btn btn-ghost" onClick={() => navigate(routes.assessments())}>
          <ArrowLeftIcon size={15} />
          Back to your assessments
        </button>
        <button className="btn btn-primary" onClick={() => setSummaryOpen(true)}>
          <FileTextIcon size={15} />
          Assessment summary
        </button>
      </footer>

      {summaryOpen && (
        <AssessmentSummaryPane
          assessment={data.assessment}
          assignment={assignment}
          decision={decision}
          onClose={() => setSummaryOpen(false)}
        />
      )}
    </div>
  );
}
