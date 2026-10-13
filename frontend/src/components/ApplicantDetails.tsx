import { useState } from "react";
import { APPLICANT_FIELDS, fieldError, validateApplicant } from "../domain/applicantDetails";
import { formatDate, todayIso } from "../utils/format";
import { AlertTriangleIcon, ArrowRightIcon, CheckCircleIcon, PencilIcon } from "./icons";
import type { ApplicantField, ApplicantFieldDef, EditableApplicantField } from "../domain/applicantDetails";
import type { ApplicantDetails } from "../domain/types";

/** Email is the sign-in on the assessment record: shown with the details, never edited. */
const EMAIL_LABEL = "Email";

/**
 * The editable details card at the top of the data collection form. A required field only shows
 * its error once the filer has left it, so an untouched form is not covered in red; an invalid
 * value shows its error straight away. Nothing here blocks submission — the review page warns.
 *
 * Typing stays local; a field is saved when the filer leaves it, if its value is valid and has
 * changed. An invalid value stays in the box with its error and is not sent.
 */
export function ApplicantDetailsSection({
  applicant: saved,
  email,
  refused = {},
  onSave,
  onContinue,
}: {
  applicant: ApplicantDetails;
  email: string;
  /**
   * Values the server would not save, with its reason. The reason shows while the box still
   * holds that value, so a refused value never looks saved; editing it clears the reason.
   */
  refused?: Partial<Record<EditableApplicantField, { value: string; message: string }>>;
  onSave: (field: EditableApplicantField, value: string) => void;
  /** When given, the card ends in a button to move on, usable once every detail is valid. */
  onContinue?: () => void;
}) {
  const [touched, setTouched] = useState<ReadonlySet<ApplicantField>>(new Set());
  const [typed, setTyped] = useState<Partial<Record<ApplicantField, string>>>({});
  const applicant: ApplicantDetails = { ...saved, ...typed };
  const today = todayIso();
  const errors: Partial<Record<ApplicantField, string>> = { ...validateApplicant(applicant, today) };
  for (const def of APPLICANT_FIELDS) {
    const refusal = def.readOnly ? undefined : refused[def.key as EditableApplicantField];
    if (refusal && !errors[def.key] && (applicant[def.key] ?? "").trim() === refusal.value) {
      errors[def.key] = refusal.message;
    }
  }
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
            if (!def.readOnly) setTyped((prev) => ({ ...prev, [def.key]: e.target.value }));
          }}
          onBlur={() => {
            markTouched(def.key);
            const next = (typed[def.key] ?? "").trim();
            const changed = def.key in typed && next !== (saved[def.key] ?? "");
            // A value the server already refused is not sent again unchanged.
            const knownRefused = refused[def.key as EditableApplicantField]?.value === next;
            if (!def.readOnly && changed && !knownRefused && !fieldError(def, next, today)) {
              onSave(def.key as EditableApplicantField, next);
            }
          }}
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
        {onContinue && (
          <div className="applicant-continue">
            {incomplete > 0 && (
              <span className="applicant-continue-note" id="applicant-continue-note">
                Complete {incomplete} detail{incomplete > 1 ? "s" : ""} to continue
              </span>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={incomplete > 0}
              aria-describedby={incomplete > 0 ? "applicant-continue-note" : undefined}
              onClick={onContinue}
            >
              Continue to questions
              <ArrowRightIcon size={15} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The details card once they are complete and the filer has moved on to the questions: one line
 * of what was declared, and a way back to change it.
 */
export function ApplicantDetailsDone({ applicant, onEdit }: { applicant: ApplicantDetails; onEdit: () => void }) {
  const today = todayIso();
  const dob = APPLICANT_FIELDS.find((def) => def.key === "date_of_birth");
  const parts = [
    applicant.full_name,
    dob ? displayValue(dob, applicant.date_of_birth, today) : null,
    applicant.nationality,
    applicant.town,
  ].filter(Boolean);
  return (
    <section className="card section applicant-done">
      <div className="applicant-done-row">
        <span className="applicant-done-icon">
          <CheckCircleIcon size={16} />
        </span>
        <div className="applicant-done-text">
          <span className="section-title">Applicant details</span>
          <span className="applicant-done-values">
            {parts.map((part, i) => (
              <span key={i}>{part}</span>
            ))}
          </span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
          <PencilIcon size={13} />
          Edit
        </button>
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
