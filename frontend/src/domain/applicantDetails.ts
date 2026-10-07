import { todayIso } from "../utils/format";
import type { ApplicantDetails } from "./types";

/** The applicant details the form shows. Proposed role is shown in the page header instead. */
export type ApplicantField = Exclude<keyof ApplicantDetails, "proposed_role">;

export interface ApplicantFieldDef {
  key: ApplicantField;
  label: string;
  input: "text" | "date" | "tel";
  required: boolean;
  /** Read-only fields come from the assessment record and cannot be changed by the filer. */
  readOnly: boolean;
  autoComplete: string;
  placeholder?: string;
  /** Returns an error message for a non-empty value that is not acceptable. */
  check?: (value: string, today: string) => string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkDateOfBirth(value: string, today: string): string | null {
  const parsed = new Date(`${value}T00:00:00Z`);
  // A real calendar date: rejects "2026-02-30", which Date would otherwise roll over.
  if (!ISO_DATE.test(value) || Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(value)) {
    return "Enter a valid date.";
  }
  if (value >= today) return "Date of birth must be in the past.";
  if (value < "1900-01-01") return "Enter a date after 1900.";
  return null;
}

/**
 * Every field the applicant details section shows, in display order. Adding a field means adding
 * it to ApplicantDetails and here; the form, the review summary and the reviewer card all read
 * from this list.
 */
export const APPLICANT_FIELDS: ApplicantFieldDef[] = [
  {
    key: "full_name",
    label: "Full name",
    input: "text",
    required: true,
    readOnly: true,
    autoComplete: "name",
  },
  {
    key: "date_of_birth",
    label: "Date of birth",
    input: "date",
    required: true,
    readOnly: false,
    autoComplete: "bday",
    check: checkDateOfBirth,
  },
  {
    key: "nationality",
    label: "Nationality",
    input: "text",
    required: true,
    readOnly: false,
    autoComplete: "country-name",
    placeholder: "e.g. Namibian",
  },
  {
    key: "national_id_number",
    label: "National ID number",
    input: "text",
    required: true,
    readOnly: false,
    autoComplete: "off",
    placeholder: "As printed on your ID",
    check: (value) =>
      /^[A-Za-z0-9]{4,20}$/.test(value) ? null : "Use 4–20 letters or digits, without spaces.",
  },
  {
    key: "town",
    label: "Town of residence",
    input: "text",
    required: true,
    readOnly: false,
    autoComplete: "address-level2",
  },
  {
    key: "phone",
    label: "Phone",
    input: "tel",
    required: false,
    readOnly: false,
    autoComplete: "tel",
    placeholder: "+264 81 000 0000",
    check: (value) =>
      /^\+?[0-9][0-9 -]{5,19}$/.test(value) ? null : "Use digits, spaces, + and - only.",
  },
];

/** The problem with one field's value, or null when it is fine. */
export function fieldError(def: ApplicantFieldDef, value: string, today: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return def.required ? `${def.label} is required.` : null;
  return def.check ? def.check(trimmed, today) : null;
}

/** Field-by-field problems with the declared details. Empty when everything is acceptable. */
export function validateApplicant(
  applicant: ApplicantDetails,
  today: string = todayIso()
): Partial<Record<ApplicantField, string>> {
  const errors: Partial<Record<ApplicantField, string>> = {};
  for (const def of APPLICANT_FIELDS) {
    const error = fieldError(def, applicant[def.key] ?? "", today);
    if (error) errors[def.key] = error;
  }
  return errors;
}

/** Labels of the fields that still need attention, in display order. */
export function incompleteApplicantFields(
  applicant: ApplicantDetails,
  today: string = todayIso()
): string[] {
  const errors = validateApplicant(applicant, today);
  return APPLICANT_FIELDS.filter((def) => errors[def.key]).map((def) => def.label);
}
