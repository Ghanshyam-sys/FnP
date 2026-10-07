import { APPLICATION_FORMS } from "../data/fixtures";
import { QUESTIONS } from "../domain/questions";
import { isEvidenceRequired } from "../domain/evidenceRules";
import type { Assignment } from "../data/assignments";
import type { ApplicationForm } from "../domain/types";

// Versioned: each test set revision changes question wording, evidence options or required
// flags, so drafts saved by an earlier build are discarded and rebuilt from the fixture.
const KEY_PREFIX = "fnp-draft-v5-";
const storageKey = (assignmentId: string) => `${KEY_PREFIX}${assignmentId}`;

/** The assessment a storage key holds the draft for, or null for any other key. */
export function draftIdForStorageKey(key: string | null): string | null {
  return key?.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length) : null;
}

/** Entity and position always come from the parent application, never from the draft. */
function withParentDetails(form: ApplicationForm, assignment: Assignment): ApplicationForm {
  return {
    ...form,
    application_id: assignment.id,
    licensee: assignment.entity,
    applicant: { ...form.applicant, proposed_role: assignment.position },
  };
}

function blankForm(assignment: Assignment): ApplicationForm {
  const source = APPLICATION_FORMS[assignment.applicantId];
  return {
    application_id: assignment.id,
    licensee: assignment.entity,
    applicant: {
      full_name: assignment.applicantName,
      proposed_role: assignment.position,
      date_of_birth: source?.applicant.date_of_birth ?? "",
      town: source?.applicant.town ?? "",
    },
    submitted_at: new Date().toISOString(),
    responses: QUESTIONS.map((q) => ({
      qid: q.qid,
      section: q.section,
      question: q.question,
      answer: "No" as const,
      evidence_required: isEvidenceRequired(q.qid, "No"),
      evidence: [],
      checks_to_perform: [],
    })),
    // Mandatory for every applicant, and empty until the filer attaches one.
    cv_verification: {
      doc_type: "curriculum_vitae",
      mandatory: true,
      evidence: [],
      checks_to_perform: ["Document_Check", "Name_Check"],
    },
  };
}

function seededForm(assignment: Assignment): ApplicationForm {
  const source = APPLICATION_FORMS[assignment.applicantId];
  if (!source) return blankForm(assignment);
  const clone = JSON.parse(JSON.stringify(source)) as ApplicationForm;
  return withParentDetails(clone, assignment);
}

/**
 * A draft exists only once the filer has started one. Assessments flagged `seededDraft`
 * simulate a department where the filer already began, so both states are demonstrable.
 */
export function hasDraft(assignment: Assignment): boolean {
  return readStoredDraft(assignment.id) !== null || assignment.seededDraft;
}

// A full or blocked store only costs the demo its continuity, so storage failures are swallowed
// and the draft is rebuilt from the fixture instead.
function readStoredDraft(assignmentId: string): string | null {
  try {
    return localStorage.getItem(storageKey(assignmentId));
  } catch {
    return null;
  }
}

export function getDraft(assignment: Assignment): ApplicationForm {
  const raw = readStoredDraft(assignment.id);
  if (raw) {
    try {
      return withParentDetails(JSON.parse(raw) as ApplicationForm, assignment);
    } catch {
      // fall through and rebuild below
    }
  }
  if (assignment.seededDraft) {
    const seeded = seededForm(assignment);
    saveDraft(assignment.id, seeded);
    return seeded;
  }
  return blankForm(assignment);
}

export function saveDraft(assignmentId: string, form: ApplicationForm): void {
  try {
    localStorage.setItem(storageKey(assignmentId), JSON.stringify(form));
  } catch {
    // ignored
  }
}

/** Overwrites whatever draft exists with a blank one. */
export function resetDraft(assignment: Assignment): ApplicationForm {
  const fresh = blankForm(assignment);
  saveDraft(assignment.id, fresh);
  return fresh;
}
