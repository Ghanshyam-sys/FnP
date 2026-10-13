import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useSubmit } from "../api/queries";
import { ApiError } from "../api/client";
import { useApplication } from "../api/useApplication";
import { Loading, LoadError } from "../components/LoadState";
import FormAnswers from "../components/FormAnswers";
import PageHeader, { AssignmentMeta } from "../components/PageHeader";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
} from "../components/icons";
import { documentRuleBreaks, evidenceGaps } from "../domain/evidenceRules";
import { incompleteApplicantFields } from "../domain/applicantDetails";
import { ApplicantDetailsSummary } from "../components/ApplicantDetails";
import { routes } from "../routes";

export default function ReviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const data = useApplication(id);
  const submit = useSubmit(id);

  if (data.status === "loading") return <Loading />;
  if (data.status === "error") return <LoadError error={data.error} onRetry={data.retry} />;
  const { assessment: assignment, raw, form, catalogue } = data;

  // A submitted assessment never shows this page — see the matching lock on the form. The backend
  // refuses a second submission regardless.
  if (raw.locked) return <Navigate to={routes.applyStatus(assignment.id)} replace />;

  const { missingTotal, missingIds } = evidenceGaps(form);
  const incompleteDetails = incompleteApplicantFields(form.applicant);
  const ruleBreaks = documentRuleBreaks(raw, catalogue.cvFileTypes);
  // Submitting needs every required detail and document, each within the question's settings; the
  // backend refuses it otherwise.
  const blockers = incompleteDetails.length + missingTotal + ruleBreaks.length;

  return (
    <div className="page">
      <PageHeader
        title="Review and submit"
        sub={
          <>
            Check your answers before submitting. Nothing is scored until every value has been
            authenticated against your documents.
          </>
        }
      >
        <AssignmentMeta assignment={assignment} showDepartment />
      </PageHeader>

      <ApplicantDetailsSummary
        applicant={form.applicant}
        email={assignment.applicantEmail}
        sub="Check these before submitting. Go back to edit to change them."
      />

      <FormAnswers form={form} />

      {incompleteDetails.length > 0 && (
        <div className="notice notice-warning">
          <AlertTriangleIcon size={17} />
          <div>
            <strong>
              {incompleteDetails.length} applicant detail{incompleteDetails.length > 1 ? "s" : ""}{" "}
              {incompleteDetails.length > 1 ? "need" : "needs"} attention
            </strong>{" "}
            ({incompleteDetails.join(", ")}). Go back to edit and complete{" "}
            {incompleteDetails.length > 1 ? "them" : "it"} before submitting.
          </div>
        </div>
      )}

      {missingTotal > 0 ? (
        <div className="notice notice-warning">
          <AlertTriangleIcon size={17} />
          <div>
            <strong>
              {missingTotal} mandatory document{missingTotal > 1 ? "s" : ""} not attached
            </strong>{" "}
            ({missingIds.join(", ")}). Go back to edit and attach{" "}
            {missingTotal > 1 ? "them" : "it"} before submitting.
          </div>
        </div>
      ) : (
        <div className="notice notice-good">
          <CheckCircleIcon size={17} />
          <div>
            <strong>All mandatory evidence is attached.</strong> Your submission is ready for
            authentication.
          </div>
        </div>
      )}

      {ruleBreaks.length > 0 && (
        <div className="notice notice-warning">
          <AlertTriangleIcon size={17} />
          <div>
            <strong>
              {ruleBreaks.length} document{ruleBreaks.length > 1 ? "s" : ""} no longer{" "}
              {ruleBreaks.length > 1 ? "meet" : "meets"} the question settings
            </strong>{" "}
            ({ruleBreaks.join("; ")}). The settings changed after you attached{" "}
            {ruleBreaks.length > 1 ? "them" : "it"}: go back to edit and replace{" "}
            {ruleBreaks.length > 1 ? "them" : "it"} before submitting.
          </div>
        </div>
      )}

      {submit.isError && (
        <div className="notice notice-critical" role="alert">
          <AlertTriangleIcon size={17} />
          <div>
            <strong>The application was not submitted.</strong>{" "}
            {submit.error instanceof ApiError && submit.error.status === 409
              ? submit.error.message
              : "Check your connection and try again."}
          </div>
        </div>
      )}

      <footer className="actionbar">
        {blockers > 0 && (
          <span className="actionbar-note" id="submit-blocked">
            Complete {blockers} item{blockers > 1 ? "s" : ""} above to submit
          </span>
        )}
        <button className="btn btn-ghost" onClick={() => navigate(routes.apply(assignment.id))}>
          <ArrowLeftIcon size={15} />
          Back to edit
        </button>
        <button
          className="btn btn-primary"
          disabled={submit.isPending || blockers > 0}
          aria-describedby={blockers > 0 ? "submit-blocked" : undefined}
          onClick={() => submit.mutate(undefined, { onSuccess: () => navigate(routes.applyStatus(assignment.id)) })}
        >
          {submit.isPending ? "Submitting…" : "Submit application"}
          <ArrowRightIcon size={15} />
        </button>
      </footer>
    </div>
  );
}
