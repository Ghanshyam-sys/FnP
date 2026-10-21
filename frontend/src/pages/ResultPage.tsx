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
  const { assessment: assignment, data, outcome, score: engineOrLegacy } = view;
  const decision = data.decision;
  // A score the app once calculated itself is the applicant's to see only once a decision was made
  // on it: until then the reviewer may still replace it with the AI engine's.
  const scoreResult = data.score?.source === "backend_override" && !decision ? null : engineOrLegacy;

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

      {scoreResult && data.run?.scoreForced && (
        <div className="notice notice-info">
          <InfoIcon size={17} />
          <div>
            <strong>Scored after review.</strong> The reviewer accepted the answers that could not
            be authenticated, and the AI engine scored the assessment with them.
          </div>
        </div>
      )}

      {scoreResult && data.score?.source === "backend_override" && (
        <div className="notice notice-info">
          <InfoIcon size={17} />
          <div>
            <strong>Scored by the app's own rules.</strong> This score was calculated by the app, not
            the AI engine, before only AI-engine scores were used.
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
          scoreResult={scoreResult}
          onClose={() => setSummaryOpen(false)}
        />
      )}
    </div>
  );
}
