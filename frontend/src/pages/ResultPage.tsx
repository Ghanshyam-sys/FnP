import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { departmentFor } from "../data/assignments";
import { isScored, stageFor } from "../state/caseStore";
import { scoreFor } from "../state/reviewState";
import { useCaseView } from "../state/useCaseView";
import { finalAssessmentFor } from "../domain/finalAssessment";
import { routes } from "../routes";
import ReportView from "../components/ReportView";
import OutcomeTabs from "../components/OutcomeTabs";
import AssessmentNotFound from "../components/AssessmentNotFound";
import AssessmentSummaryPane from "../components/AssessmentSummaryPane";
import PageHeader, { AssignmentMeta } from "../components/PageHeader";
import { ArrowLeftIcon, FileTextIcon } from "../components/icons";

export default function ResultPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const view = useCaseView(id);

  if (!view) return <AssessmentNotFound />;
  const { assignment, form, outcome, flagged } = view;

  // Scoring only exists once authentication has cleared and the engine has finished.
  const scoreResult = scoreFor(id, form, outcome);
  if (!isScored(stageFor(id, flagged)) || !scoreResult) {
    return <Navigate to={routes.applyStatus(id)} replace />;
  }

  return (
    <div className="page">
      <PageHeader
        title="Scoring result"
        sub={
          <>
            Weighted against authenticated answers only. {departmentFor(assignment).name} ·{" "}
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
          assessment={finalAssessmentFor(assignment.applicantId)}
          applicantName={assignment.applicantName}
          onClose={() => setSummaryOpen(false)}
        />
      )}
    </div>
  );
}
