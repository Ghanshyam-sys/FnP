import { useState } from "react";
import { APPLICANT_FIELDS, fieldError, validateApplicant } from "../domain/applicantDetails";
import { formatDate, todayIso } from "../utils/format";
import { AlertTriangleIcon } from "./icons";
import type { ApplicantField, ApplicantFieldDef } from "../domain/applicantDetails";
import type { ApplicantDetails } from "../domain/types";
import type { EditableApplicantField } from "../state/useAssessment";

/** Email is the sign-in on the assessment record: shown with the details, never edited. */
const EMAIL_LABEL = "Email";

/**
 * The editable details card at the top of the data collection form. A required field only shows
 * its error once the filer has left it, so an untouched form is not covered in red; an invalid
 * value shows its error straight away. Nothing here blocks submission — the review page warns.
 */
export function ApplicantDetailsSection({
  applicant,
  email,
  onChange,
}: {
  applicant: ApplicantDetails;
  email: string;
  onChange: (field: EditableApplicantField, value: string) => void;
}) {
  const [touched, setTouched] = useState<ReadonlySet<ApplicantField>>(new Set());
  const today = todayIso();
  const errors = validateApplicant(applicant, today);
  const incomplete = APPLICANT_FIELDS.filter((def) => errors[def.key]).length;

  const markTouched = (key: ApplicantField) =>
    setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));

  const renderField = (def: ApplicantFieldDef) => {
    const id = `applicant-${def.key}`;
    const value = applicant[def.key] ?? "";
    const error = errors[def.key];
    const showError = Boolean(error) && (touched.has(def.key) || value.trim() !== "");
    return (
      <div className="field" key={def.key}>
        <label className="field-label" htmlFor={id}>
          {def.label}
          {def.required && !def.readOnly && (
            <span className="required-mark" aria-hidden="true">
              *
            </span>
          )}
        </label>
        <input
          id={id}
          className="input"
          type={def.input}
          value={value}
          readOnly={def.readOnly}
          required={def.required && !def.readOnly}
          autoComplete={def.autoComplete}
          placeholder={def.placeholder}
          max={def.input === "date" ? today : undefined}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? `${id}-error` : undefined}
          onChange={(e) => {
            if (!def.readOnly) onChange(def.key as EditableApplicantField, e.target.value);
          }}
          onBlur={() => markTouched(def.key)}
        />
        {showError && (
          <p className="field-error" id={`${id}-error`}>
            {error}
          </p>
        )}
      </div>
    );
  };

  const [nameField, ...otherFields] = APPLICANT_FIELDS;

  return (
    <section className="card section">
      <h2 className="section-head-wrap">
        <div className="section-head section-head-static">
          <span className="section-title">Applicant details</span>
          {incomplete > 0 && (
            <span className="section-flag">
              <AlertTriangleIcon size={12} />
              {incomplete} to complete
            </span>
          )}
          <span className="section-count">Identity and contact</span>
        </div>
      </h2>
      <div className="section-body field-section">
        <div className="field-grid">
          {renderField(nameField)}
          <div className="field">
            <label className="field-label" htmlFor="applicant-email">
              {EMAIL_LABEL}
            </label>
            <input
              id="applicant-email"
              className="input"
              type="email"
              value={email}
              readOnly
              autoComplete="email"
            />
          </div>
          {otherFields.map(renderField)}
        </div>
        <p className="applicant-note">
          Your name and email come from the application this assessment belongs to, so they
          cannot be changed here.
        </p>
      </div>
    </section>
  );
}

/** One declared value as the summary shows it. */
function displayValue(def: ApplicantFieldDef, value: string | undefined, today: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return <span className="applicant-missing">Not provided</span>;
  // Format a date only when it is a real one; anything else is shown exactly as typed.
  if (def.input === "date" && !fieldError(def, trimmed, today)) return formatDate(trimmed);
  return trimmed;
}

/** Read-only view of the declared details, for the review page and the reviewer. */
export function ApplicantDetailsSummary({
  applicant,
  email,
  sub,
}: {
  applicant: ApplicantDetails;
  email: string;
  sub: string;
}) {
  const today = todayIso();
  const [nameField, ...otherFields] = APPLICANT_FIELDS;
  const item = (def: ApplicantFieldDef) => (
    <div key={def.key}>
      <dt>{def.label}</dt>
      <dd>{displayValue(def, applicant[def.key], today)}</dd>
    </div>
  );

  return (
    <section className="card">
      <header className="card-head">
        <h2>Applicant details</h2>
        <p className="card-sub">{sub}</p>
      </header>
      <dl className="applicant-summary-grid">
        {item(nameField)}
        <div>
          <dt>{EMAIL_LABEL}</dt>
          <dd>{email}</dd>
        </div>
        {otherFields.map(item)}
      </dl>
    </section>
  );
}
