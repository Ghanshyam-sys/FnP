import { BUILT_IN_ASSIGNMENTS, DEMO_ASSIGNMENTS, REVIEWER_DEPARTMENT_KEY } from "../data/assignments";
import { nextAssessmentId, normaliseNewAssessment } from "../domain/newAssessment";
import { clearCase, isSubmitted } from "./caseStore";
import { removeDraft } from "./draftStore";
import type { Assignment } from "../data/assignments";
import type { NewAssessmentInput } from "../domain/newAssessment";

/**
 * Assessments the reviewer has created, kept in localStorage beside the built-in demo set. Every
 * lookup in the app goes through here so the two read as one list. Like the rest of the demo's
 * state, created assessments live only in this browser until a backend exists.
 */
const STORAGE_KEY = "fnp-created-assessments-v1";

interface StoredAssessments {
  /** Highest serial ever issued, so a removed assessment's id is never reused. */
  lastSerial: number;
  assessments: Assignment[];
}

const EMPTY: StoredAssessments = { lastSerial: 0, assessments: [] };

// Parsed once per distinct stored value: lookups run on every render, and returning the same
// objects keeps the pages' memoised work valid until something actually changes.
let cache: { raw: string | null; value: StoredAssessments } = { raw: null, value: EMPTY };

function readStore(): StoredAssessments {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cache.raw) return cache.value;
  let value = EMPTY;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredAssessments>;
      value = {
        lastSerial: Number(parsed.lastSerial) || 0,
        assessments: Array.isArray(parsed.assessments) ? parsed.assessments : [],
      };
    } catch {
      // A corrupt entry reads as nothing created rather than breaking every page.
    }
  }
  cache = { raw, value };
  return value;
}

function writeStore(value: StoredAssessments): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Assessments the reviewer created, oldest first. */
export function createdAssignments(): Assignment[] {
  return readStore().assessments;
}

/** Built-in assessments first, then created ones. */
export function allAssignments(): Assignment[] {
  const created = createdAssignments();
  return created.length === 0 ? BUILT_IN_ASSIGNMENTS : [...BUILT_IN_ASSIGNMENTS, ...created];
}

export function getAssignment(assignmentId: string): Assignment | undefined {
  return allAssignments().find((a) => a.id === assignmentId);
}

export function assignmentsForEmail(email: string): Assignment[] {
  const normalized = email.trim().toLowerCase();
  return allAssignments().filter((a) => a.email === normalized);
}

/** The assessments the reviewer works: the five demo ones plus any created. The queue orders them. */
export function reviewableAssignments(): Assignment[] {
  const created = createdAssignments();
  return created.length === 0 ? DEMO_ASSIGNMENTS : [...DEMO_ASSIGNMENTS, ...created];
}

/** True for an assessment the reviewer created, as opposed to one that ships with the demo. */
export function isCreatedAssignment(assignmentId: string): boolean {
  return createdAssignments().some((a) => a.id === assignmentId);
}

/** Parent references already assessed, which a new assessment may not reuse. */
export function takenReferences(): string[] {
  return allAssignments().map((a) => a.reference);
}

/**
 * Opens an assessment. The caller validates first (validateNewAssessment); this only stores it.
 * Returns null when browser storage refuses the write.
 */
export function createAssignment(input: NewAssessmentInput): Assignment | null {
  const clean = normaliseNewAssessment(input);
  const store = readStore();
  const { id, serial } = nextAssessmentId(
    allAssignments().map((a) => a.id),
    store.lastSerial,
    clean.initiatedOn.slice(0, 4)
  );
  const assignment: Assignment = {
    id,
    email: clean.email,
    departmentKey: REVIEWER_DEPARTMENT_KEY,
    entity: clean.entity,
    position: clean.position,
    reference: clean.reference,
    initiatedOn: clean.initiatedOn,
    // No test-set data stands behind a created assessment; the id keeps it distinct from APP00N.
    applicantId: id,
    applicantName: clean.applicantName,
    seededDraft: false,
  };
  const saved = writeStore({ lastSerial: serial, assessments: [...store.assessments, assignment] });
  return saved ? assignment : null;
}

/**
 * Removes a created assessment along with any draft and case state it had. Built-in assessments
 * and submitted ones are refused, so nothing the reviewer has worked on can disappear.
 */
export function removeAssignment(assignmentId: string): boolean {
  if (!isCreatedAssignment(assignmentId) || isSubmitted(assignmentId)) return false;
  const store = readStore();
  const saved = writeStore({
    ...store,
    assessments: store.assessments.filter((a) => a.id !== assignmentId),
  });
  if (!saved) return false;
  removeDraft(assignmentId);
  clearCase(assignmentId);
  return true;
}
