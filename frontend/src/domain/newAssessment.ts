/** What is entered to open an assessment: by the reviewer for an applicant, or by an applicant. */
export interface NewAssessmentInput {
  applicantName: string;
  email: string;
  /** The department's key. */
  department: string;
  entity: string;
  position: string;
  reference: string;
  /** ISO date, YYYY-MM-DD. */
  initiatedOn: string;
}

export type NewAssessmentField = keyof NewAssessmentInput;

/** Who is filling in the form: the reviewer opening one for an applicant, or the applicant. */
export type NewAssessmentMode = "reviewer" | "applicant";

export interface NewAssessmentFieldDef {
  key: NewAssessmentField;
  label: string;
  input: "text" | "email" | "date" | "select";
  placeholder?: string;
  hint?: string;
}

/**
 * The form's fields, in display order; every one is required. An applicant applies as themselves
 * (their sign-in email) and is dated today, so those two fields are the reviewer's only.
 */
export function newAssessmentFields(mode: NewAssessmentMode): NewAssessmentFieldDef[] {
  const applicant = mode === "applicant";
  const fields: NewAssessmentFieldDef[] = [
    {
      key: "applicantName",
      label: applicant ? "Your full name" : "Applicant full name",
      input: "text",
      placeholder: "e.g. Anna M. Nghipandulwa",
    },
    {
      key: "email",
      label: "Applicant email",
      input: "email",
      placeholder: "name@example.na",
      hint: "The applicant signs in with this address to see the assessment.",
    },
    { key: "department", label: "Department", input: "select" },
    { key: "entity", label: "Entity", input: "text", placeholder: "e.g. Namib Trust Bank Limited" },
    { key: "position", label: "Position applied for", input: "text", placeholder: "e.g. Non-Executive Director" },
    {
      key: "reference",
      label: "Parent application reference",
      input: "text",
      placeholder: "e.g. BL-2026-0510",
      hint: applicant
        ? "The reference of the licence or accreditation application this assessment is for."
        : "The licence application this assessment belongs to. Must not already be in use.",
    },
    { key: "initiatedOn", label: "Initiated on", input: "date" },
  ];
  return applicant ? fields.filter((f) => f.key !== "email" && f.key !== "initiatedOn") : fields;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Trims every value and lower-cases the email, the form in which an assessment is stored. */
export function normaliseNewAssessment(input: NewAssessmentInput): NewAssessmentInput {
  return {
    applicantName: input.applicantName.trim(),
    email: input.email.trim().toLowerCase(),
    department: input.department,
    entity: input.entity.trim(),
    position: input.position.trim(),
    reference: input.reference.trim(),
    initiatedOn: input.initiatedOn.trim(),
  };
}

/**
 * Field-by-field problems found before sending, empty when the form is complete. Whether the
 * reference is already assessed is the server's to say: it answers with a field error.
 */
export function validateNewAssessment(
  raw: NewAssessmentInput,
  today: string,
  fields: NewAssessmentFieldDef[] = newAssessmentFields("reviewer")
): Partial<Record<NewAssessmentField, string>> {
  const input = normaliseNewAssessment(raw);
  const errors: Partial<Record<NewAssessmentField, string>> = {};
  const asked = new Set(fields.map((f) => f.key));

  for (const def of fields) {
    if (!input[def.key]) {
      errors[def.key] = def.input === "select" ? `Choose a ${def.label.toLowerCase()}.` : `${def.label} is required.`;
    }
  }
  if (asked.has("email") && input.email && !EMAIL.test(input.email)) errors.email = "Enter a valid email address.";

  if (asked.has("initiatedOn") && input.initiatedOn) {
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
