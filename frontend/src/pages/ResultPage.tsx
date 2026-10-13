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
import { ArrowLeftIcon, FileTextIcon } from "../components/icons";

export default function ResultPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const view = useCaseView(id);

  if (view.status === "loading") return <Loading />;
  if (view.status === "error") return <LoadError error={view.error} onRetry={view.retry} />;
  const { assessment: assignment, data, outcome, score: scoreResult } = view;

  // Scoring only exists once authentication has cleared and the engine has finished.
  if (!isScored(data.stage) || !scoreResult || !outcome) {
    // A cached copy can predate the score; only a fresh one decides that scoring is not ready.
    if (view.refreshing) return <Loading />;
    return <Navigate to={routes.applyStatus(id)} replace />;
  }

  return (
    <div className="page">
      <PageHeader
        title="Scoring result"
        sub={
          <>
            Weighted against authenticated answers only. {assignment.department.name} ·{" "}
            {assignment.reference}
          </>
        }
      >
        <AssignmentMeta assignment={assignment} />
      </PageHeader>

      <OutcomeTabs assessmentId={id} active="scoring" scoringReady />

      <ReportView authentication={outcome} scoreResult={scoreResult} />

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
          decision={data.decision}
          onClose={() => setSummaryOpen(false)}
        />
      )}
    </div>
  );
}
