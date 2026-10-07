/** What the reviewer enters to open an assessment against an applicant. */
export interface NewAssessmentInput {
  applicantName: string;
  email: string;
  entity: string;
  position: string;
  reference: string;
  /** ISO date, YYYY-MM-DD. */
  initiatedOn: string;
}

export type NewAssessmentField = keyof NewAssessmentInput;

export interface NewAssessmentFieldDef {
  key: NewAssessmentField;
  label: string;
  input: "text" | "email" | "date";
  placeholder?: string;
  hint?: string;
}

/** The form's fields, in display order. Every one is required. */
export const NEW_ASSESSMENT_FIELDS: NewAssessmentFieldDef[] = [
  { key: "applicantName", label: "Applicant full name", input: "text", placeholder: "e.g. Anna M. Nghipandulwa" },
  {
    key: "email",
    label: "Applicant email",
    input: "email",
    placeholder: "name@example.na",
    hint: "The applicant signs in with this address to see the assessment.",
  },
  { key: "entity", label: "Entity", input: "text", placeholder: "e.g. Namib Trust Bank Limited" },
  { key: "position", label: "Position applied for", input: "text", placeholder: "e.g. Non-Executive Director" },
  {
    key: "reference",
    label: "Parent application reference",
    input: "text",
    placeholder: "e.g. BL-2026-0510",
    hint: "The licence application this assessment belongs to. Must not already be in use.",
  },
  { key: "initiatedOn", label: "Initiated on", input: "date" },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Trims every value and lower-cases the email, the form in which an assessment is stored. */
export function normaliseNewAssessment(input: NewAssessmentInput): NewAssessmentInput {
  return {
    applicantName: input.applicantName.trim(),
    email: input.email.trim().toLowerCase(),
    entity: input.entity.trim(),
    position: input.position.trim(),
    reference: input.reference.trim(),
    initiatedOn: input.initiatedOn.trim(),
  };
}

/**
 * Field-by-field problems, empty when the assessment can be created. `takenReferences` is every
 * parent reference already in use; the same person may hold several assessments, but each
 * application can only be assessed once.
 */
export function validateNewAssessment(
  raw: NewAssessmentInput,
  takenReferences: Iterable<string>,
  today: string
): Partial<Record<NewAssessmentField, string>> {
  const input = normaliseNewAssessment(raw);
  const errors: Partial<Record<NewAssessmentField, string>> = {};

  for (const def of NEW_ASSESSMENT_FIELDS) {
    if (!input[def.key]) errors[def.key] = `${def.label} is required.`;
  }
  if (input.email && !EMAIL.test(input.email)) errors.email = "Enter a valid email address.";

  if (input.reference) {
    const taken = new Set([...takenReferences].map((r) => r.trim().toUpperCase()));
    if (taken.has(input.reference.toUpperCase())) {
      errors.reference = "An assessment already exists for this application reference.";
    }
  }

  if (input.initiatedOn) {
    const parsed = new Date(`${input.initiatedOn}T00:00:00Z`);
    // Invalid dates are ruled out before toISOString, which throws on them.
    const real =
      ISO_DATE.test(input.initiatedOn) &&
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().startsWith(input.initiatedOn);
    if (!real) errors.initiatedOn = "Enter a valid date.";
    else if (input.initiatedOn > today) errors.initiatedOn = "Initiated on cannot be in the future.";
  }
  return errors;
}

/**
 * The next assessment id, "FNP-<year>-<serial>". Serials never repeat across years, and
 * `lastSerial` lets the store keep counting past assessments that have since been removed, so a
 * removed id is never handed out again.
 */
export function nextAssessmentId(existingIds: Iterable<string>, lastSerial: number, year: string): {
  id: string;
  serial: number;
} {
  let max = lastSerial;
  for (const id of existingIds) {
    const serial = Number(/^FNP-\d{4}-(\d+)$/.exec(id)?.[1]);
    if (Number.isFinite(serial) && serial > max) max = serial;
  }
  const serial = max + 1;
  return { id: `FNP-${year}-${String(serial).padStart(4, "0")}`, serial };
}
