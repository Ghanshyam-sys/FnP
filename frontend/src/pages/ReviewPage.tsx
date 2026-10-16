import { useNavigate, useParams } from "react-router-dom";
import { useFormBusy, useSubmit } from "../api/queries";
import { ApiError } from "../api/client";
import { useApplication } from "../api/useApplication";
import { Loading, LoadError } from "../components/LoadState";
import FormAnswers from "../components/FormAnswers";
import LeaveLockedPage from "../components/LeaveLockedPage";
import PageHeader, { AssignmentMeta } from "../components/PageHeader";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
} from "../components/icons";
import { documentRuleBreaks, evidenceGaps } from "../domain/evidenceRules";
import { routes } from "../routes";

export default function ReviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const data = useApplication(id);
  const submit = useSubmit(id);
  // A change from the form (a text answer saved on leaving it, say) may still be on its way:
  // submitting waits for it, so what is submitted is what the applicant last entered.
  const saving = useFormBusy(id);

  if (data.status === "loading") return <Loading />;
  if (data.status === "error") return <LoadError error={data.error} onRetry={data.retry} />;
  const { assessment: assignment, raw, form, catalogue } = data;

  // A submitted assessment never shows this page — see the matching lock on the form. The backend
  // refuses a second submission regardless.
  if (raw.locked) return <LeaveLockedPage to={routes.applyStatus(assignment.id)} />;

  const { missingTotal, missingIds } = evidenceGaps(form);
  const ruleBreaks = documentRuleBreaks(raw, catalogue.cvFileTypes);
  // Submitting needs every required detail and document, each within the question's settings; the
  // backend refuses it otherwise.
  // A text question must be answered (the others start from an answer).
  const unanswered = form.responses.filter((r) => r.answerType === "text" && !r.answer.trim()).map((r) => r.qid);
  const blockers = missingTotal + ruleBreaks.length + unanswered.length;

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

      <FormAnswers form={form} />

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

      {unanswered.length > 0 && (
        <div className="notice notice-warning">
          <AlertTriangleIcon size={17} />
          <div>
            <strong>
              {unanswered.length} question{unanswered.length > 1 ? "s" : ""} not answered
            </strong>{" "}
            ({unanswered.join(", ")}). Go back to edit and answer{" "}
            {unanswered.length > 1 ? "them" : "it"} before submitting.
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
          disabled={submit.isPending || blockers > 0 || saving}
          aria-describedby={blockers > 0 ? "submit-blocked" : undefined}
          // Replaces this page in the history: once submitted, Back should not return to it.
          onClick={() => submit.mutate(undefined, { onSuccess: () => navigate(routes.applyStatus(assignment.id), { replace: true }) })}
        >
          {submit.isPending ? "Submitting…" : "Submit application"}
          <ArrowRightIcon size={15} />
        </button>
      </footer>
    </div>
  );
}
