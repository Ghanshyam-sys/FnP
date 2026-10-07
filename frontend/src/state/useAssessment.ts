import { createContext, useContext } from "react";
import type { Assignment } from "../data/assignments";
import type { Answer, ApplicationForm, EvidenceRef } from "../domain/types";
import type { ApplicantField } from "../domain/applicantDetails";

/** The name is fixed by the assessment record, so it is the one detail the filer cannot set. */
export type EditableApplicantField = Exclude<ApplicantField, "full_name">;

type Role = "applicant" | "reviewer";

/** The one reviewer account in the POC. Signing in as this name opens the reviewer portal. */
export const REVIEWER_USERNAME = "admin";

export function roleFor(email: string | null): Role {
  return email?.trim().toLowerCase() === REVIEWER_USERNAME ? "reviewer" : "applicant";
}

interface AssessmentContextValue {
  email: string | null;
  role: Role;
  signIn: (email: string) => void;
  signOut: () => void;
  getForm: (assignment: Assignment) => ApplicationForm;
  updateAnswer: (assignment: Assignment, qid: string, answer: Answer) => void;
  updateApplicant: (assignment: Assignment, field: EditableApplicantField, value: string) => void;
  attachEvidence: (assignment: Assignment, qid: string, evidence: EvidenceRef) => void;
  removeEvidence: (assignment: Assignment, qid: string, docType: string) => void;
  attachCvEvidence: (assignment: Assignment, evidence: EvidenceRef) => void;
  removeCvEvidence: (assignment: Assignment) => void;
  startNewApplication: (assignment: Assignment) => void;
}

/**
 * Kept apart from the provider component so that file exports components only, which is what
 * Vite's fast refresh needs to hot-swap it without a full reload.
 */
export const AssessmentContext = createContext<AssessmentContextValue | null>(null);

export function useAssessment() {
  const ctx = useContext(AssessmentContext);
  if (!ctx) throw new Error("useAssessment must be used within AssessmentProvider");
  return ctx;
}
