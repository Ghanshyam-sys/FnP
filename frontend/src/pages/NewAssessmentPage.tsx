import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { REVIEWER_DEPARTMENT } from "../data/assignments";
import { NEW_ASSESSMENT_FIELDS, validateNewAssessment } from "../domain/newAssessment";
import { createAssignment, takenReferences } from "../state/assignmentStore";
import { todayIso } from "../utils/format";
import { routes } from "../routes";
import PageHeader from "../components/PageHeader";
import { AlertTriangleIcon, ArrowLeftIcon, PlusIcon } from "../components/icons";
import type { NewAssessmentField, NewAssessmentInput } from "../domain/newAssessment";
import type { QueueNotice } from "../routes";

const FORM_ID = "new-assessment-form";

/**
 * The reviewer opens an assessment against an application. Errors show once a field has been
 * left, or for every field after a submit attempt, so an untouched form is not covered in red.
 */
export default function NewAssessmentPage() {
  const navigate = useNavigate();
  const today = todayIso();
  const department = REVIEWER_DEPARTMENT;
  const [input, setInput] = useState<NewAssessmentInput>({
    applicantName: "",
    email: "",
    entity: "",
    position: "",
    reference: "",
    initiatedOn: today,
  });
  const [touched, setTouched] = useState<ReadonlySet<NewAssessmentField>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const errors = validateNewAssessment(input, takenReferences(), today);
  const visibleError = (key: NewAssessmentField) =>
    attempted || touched.has(key) ? errors[key] : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    const firstInvalid = NEW_ASSESSMENT_FIELDS.find((def) => errors[def.key]);
    if (firstInvalid) {
      document.getElementById(`new-${firstInvalid.key}`)?.focus();
      return;
    }
    const created = createAssignment(input);
    if (!created) {
      setSaveFailed(true);
      return;
    }
    const state: QueueNotice = {
      notice: `Assessment ${created.id} opened for ${created.applicantName}. They see it the next time they sign in as ${created.email}.`,
    };
    navigate(routes.reviewer(), { state });
  };

  return (
    <div className="page">
      <PageHeader
        title="New assessment"
        sub={
          <>
            Open a fit and proper assessment against a {department.name} application. The
            applicant fills it in from their own portal.
          </>
        }
      />

      <form className="card section" id={FORM_ID} onSubmit={submit} noValidate>
        <h2 className="section-head-wrap">
          <div className="section-head section-head-static">
            <span className="section-title">Assessment details</span>
            <span className="section-count">{department.name}</span>
          </div>
        </h2>
        <div className="section-body field-section">
          <div className="field-grid">
            {NEW_ASSESSMENT_FIELDS.map((def) => {
              const id = `new-${def.key}`;
              const error = visibleError(def.key);
              const describedBy = [error && `${id}-error`, def.hint && `${id}-hint`]
                .filter(Boolean)
                .join(" ");
              return (
                <div className="field" key={def.key}>
                  <label className="field-label" htmlFor={id}>
                    {def.label}
                    <span className="required-mark" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <input
                    id={id}
                    className="input"
                    type={def.input}
                    value={input[def.key]}
                    placeholder={def.placeholder}
                    max={def.input === "date" ? today : undefined}
                    required
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy || undefined}
                    onChange={(e) => setInput((prev) => ({ ...prev, [def.key]: e.target.value }))}
                    onBlur={() =>
                      setTouched((prev) => (prev.has(def.key) ? prev : new Set(prev).add(def.key)))
                    }
                  />
                  {error ? (
                    <p className="field-error" id={`${id}-error`}>
                      {error}
                    </p>
                  ) : (
                    def.hint && (
                      <p className="field-hint" id={`${id}-hint`}>
                        {def.hint}
                      </p>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </form>

      {saveFailed && (
        <div className="notice notice-critical" role="alert">
          <AlertTriangleIcon size={17} />
          <div>
            <strong>The assessment could not be saved.</strong> This browser is not allowing the
            demo to store data. Check that site data is enabled, then try again.
          </div>
        </div>
      )}

      <footer className="actionbar">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(routes.reviewer())}>
          <ArrowLeftIcon size={15} />
          Back to the queue
        </button>
        <button type="submit" form={FORM_ID} className="btn btn-primary">
          <PlusIcon size={15} />
          Create assessment
        </button>
      </footer>
    </div>
  );
}
