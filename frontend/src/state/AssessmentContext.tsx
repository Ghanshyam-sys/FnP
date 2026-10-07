import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { draftIdForStorageKey, getDraft, saveDraft, resetDraft } from "./draftStore";
import { clearCase } from "./caseStore";
import { AssessmentContext, roleFor } from "./useAssessment";
import { isEvidenceRequired } from "../domain/evidenceRules";
import type { Assignment } from "../data/assignments";
import type { Answer, ApplicationForm, EvidenceRef } from "../domain/types";

const SESSION_KEY = "fnp-session-email";

function readStoredEmail(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** A blocked session store only costs the sign-in its persistence across reloads. */
function writeStoredEmail(value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(SESSION_KEY);
    else sessionStorage.setItem(SESSION_KEY, value);
  } catch {
    // ignored
  }
}

export function AssessmentProvider({ children }: { children: ReactNode }) {
  const [forms, setForms] = useState<Record<string, ApplicationForm>>({});
  const [email, setEmail] = useState<string | null>(readStoredEmail);

  const signIn = useCallback((value: string) => {
    const normalized = value.trim().toLowerCase();
    writeStoredEmail(normalized);
    setEmail(normalized);
  }, []);

  const signOut = useCallback(() => {
    writeStoredEmail(null);
    setEmail(null);
  }, []);

  // Drafts read from storage but not edited in this tab, parsed once and reused so a page's
  // memoised work on its form is not thrown away on every render. Another tab saving a draft
  // drops it here, so the next render reads the new copy — as it did before the cache existed.
  const loadedRef = useRef(new Map<string, ApplicationForm>());

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null) loadedRef.current.clear();
      const id = draftIdForStorageKey(event.key);
      if (id) loadedRef.current.delete(id);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const loaded = useCallback((assignment: Assignment) => {
    let form = loadedRef.current.get(assignment.id);
    if (!form) {
      form = getDraft(assignment);
      loadedRef.current.set(assignment.id, form);
    }
    return form;
  }, []);

  const getForm = useCallback(
    (assignment: Assignment) => forms[assignment.id] ?? loaded(assignment),
    [forms, loaded]
  );

  // Edits read through this ref rather than the rendered `forms` map: two changes dispatched
  // before React re-renders would both start from the same stale copy, and the second would
  // silently discard the first.
  const formsRef = useRef<Record<string, ApplicationForm>>({});

  const currentForm = useCallback(
    (assignment: Assignment) => formsRef.current[assignment.id] ?? loaded(assignment),
    [loaded]
  );

  const persist = useCallback((assignmentId: string, next: ApplicationForm) => {
    formsRef.current = { ...formsRef.current, [assignmentId]: next };
    setForms(formsRef.current);
    saveDraft(assignmentId, next);
  }, []);

  const updateAnswer = useCallback(
    (assignment: Assignment, qid: string, answer: Answer) => {
      const base = currentForm(assignment);
      const next: ApplicationForm = {
        ...base,
        responses: base.responses.map((r) => {
          if (r.qid !== qid) return r;
          const required = isEvidenceRequired(qid, answer);
          return {
            ...r,
            answer,
            evidence_required: required,
            // Evidence only exists to support a question that currently requires it — drop it
            // the moment an answer change makes it inapplicable, so stale attachments never
            // linger against a question that no longer needs proof.
            evidence: required ? r.evidence : [],
          };
        }),
      };
      persist(assignment.id, next);
    },
    [currentForm, persist]
  );

  const attachEvidence = useCallback(
    (assignment: Assignment, qid: string, evidence: EvidenceRef) => {
      const base = currentForm(assignment);
      const next: ApplicationForm = {
        ...base,
        responses: base.responses.map((r) =>
          r.qid === qid
            ? {
                ...r,
                evidence: [...r.evidence.filter((e) => e.doc_type !== evidence.doc_type), evidence],
              }
            : r
        ),
      };
      persist(assignment.id, next);
    },
    [currentForm, persist]
  );

  const removeEvidence = useCallback(
    (assignment: Assignment, qid: string, docType: string) => {
      const base = currentForm(assignment);
      const next: ApplicationForm = {
        ...base,
        responses: base.responses.map((r) => {
          if (r.qid !== qid) return r;
          const removed = r.evidence.find((e) => e.doc_type === docType);
          // Nothing to remove; leave the attachments alone rather than clearing them all.
          if (!removed) return r;
          // A supporting document only exists to be reconciled against the primary, so pulling
          // the primary takes the supporting with it rather than leaving it orphaned.
          const drop =
            removed?.role === "supporting"
              ? (e: EvidenceRef) => e.doc_type === docType
              : () => true;
          return { ...r, evidence: r.evidence.filter((e) => !drop(e)) };
        }),
      };
      persist(assignment.id, next);
    },
    [currentForm, persist]
  );

  // The CV sits outside `responses`, so it gets its own pair of actions rather than being
  // squeezed into the question list as a sixteenth entry.
  const attachCvEvidence = useCallback(
    (assignment: Assignment, evidence: EvidenceRef) => {
      const base = currentForm(assignment);
      if (!base.cv_verification) return;
      persist(assignment.id, {
        ...base,
        cv_verification: { ...base.cv_verification, evidence: [evidence] },
      });
    },
    [currentForm, persist]
  );

  const removeCvEvidence = useCallback(
    (assignment: Assignment) => {
      const base = currentForm(assignment);
      if (!base.cv_verification) return;
      persist(assignment.id, {
        ...base,
        cv_verification: { ...base.cv_verification, evidence: [] },
      });
    },
    [currentForm, persist]
  );

  const startNewApplication = useCallback(
    (assignment: Assignment) => {
      // Starting over also clears the case: the old submission, its rulings and any decision
      // belong to the form that has just been discarded.
      clearCase(assignment.id);
      const fresh = resetDraft(assignment);
      formsRef.current = { ...formsRef.current, [assignment.id]: fresh };
      setForms(formsRef.current);
    },
    []
  );

  const value = useMemo(
    () => ({
      email,
      role: roleFor(email),
      signIn,
      signOut,
      getForm,
      updateAnswer,
      attachEvidence,
      removeEvidence,
      attachCvEvidence,
      removeCvEvidence,
      startNewApplication,
    }),
    [
      email,
      signIn,
      signOut,
      getForm,
      updateAnswer,
      attachEvidence,
      removeEvidence,
      attachCvEvidence,
      removeCvEvidence,
      startNewApplication,
    ]
  );

  return <AssessmentContext.Provider value={value}>{children}</AssessmentContext.Provider>;
}
