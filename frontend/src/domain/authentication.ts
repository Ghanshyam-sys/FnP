import { acceptsSupportingEvidence, labelForDocType } from "./evidenceOptions";
import { verifyCv } from "./cvVerification";
import { QUESTION_BY_QID } from "./questions";
import { OVERRIDES } from "../data/stubs/authenticationOverrides";
import type {
  ApplicationForm,
  AuthenticationOutcome,
  CheckResult,
  QuestionAuthResult,
  ResponseItem,
  SectionAuthResult,
} from "./types";

const CHECK_LABELS: Record<string, string> = {
  Document_Check: "Document type",
  Name_Check: "Document belongs to applicant",
  Age_Check: "Age derived from document",
  Naturalization_Check: "Naturalised status",
  Qualification_Relevance_Check: "Qualification relevant to the role",
  Experience_Duration_Check: "Length of relevant service",
  Experience_Relevance_Check: "Experience relevant to the role",
  Record_Check: "Conviction or civil finding",
  Scope_Check: "Search period and jurisdictions covered",
  Compliance_History_Check: "History of non-compliance",
  Period_Coverage_Check: "Document covers a historical period",
  Facility_Status_Check: "Facility restructured, written off or forgiven",
  Indebtedness_Amount_Check: "Aggregate indebtedness against the threshold",
  Directorship_Check: "Directorship recorded",
  Entity_Activity_Check: "Entity engaged in financial services",
  Beneficial_Ownership_Check: "Beneficial interest held",
  Controlling_Interest_Threshold_Check: "Controlling interest threshold",
  Time_Commitment_Check: "Time commitment stated",
  Executive_Responsibility_Check: "Executive responsibility stated",
  Shareholding_Check: "Shares of the Licensee held",
  Relative_Name_Check: "Relative identified by name",
  Relationship_Check: "Relationship stated on the document",
  Signature_Check: "Declaration signed and witnessed",
  Declaration_Content_Check: "Declaration wording covers the attestation",
  Consistency_Check: "Supporting document agrees with the primary",
};

/**
 * Which checks run is the engine's decision, taken from the question catalogue rather than the
 * payload's `checks_to_perform`: a blank "New application" draft has no payload to read.
 */
function checksFor(response: ResponseItem): string[] {
  const checks = QUESTION_BY_QID[response.qid]?.checks ?? ["Document_Check", "Name_Check"];
  if (!acceptsSupportingEvidence(response.qid)) return checks;

  // Consistency_Check exists only to reconcile a supporting document against the primary, so
  // it is skipped entirely when the filer attached no supporting document. It is placed ahead
  // of the field-level check because a conflict between the two documents has to be settled
  // before either can be read for a value — the Checks sheet lists it last but describes it as
  // running first.
  const hasSupporting = response.evidence.some((e) => e.role === "supporting");
  if (!hasSupporting) return checks.filter((c) => c !== "Consistency_Check");
  const fieldLevel = checks.filter((c) => c !== "Consistency_Check");
  const shared = fieldLevel.slice(0, 2);
  return [...shared, "Consistency_Check", ...fieldLevel.slice(2)];
}

/** What a check says when it passes. `{doc}` is replaced with the attached document's label. */
const PASSING_NOTES: Record<string, string> = {
  Document_Check: "The uploaded file reads as a {doc}, matching the document type selected.",
  Name_Check: "The name on the document matches the applicant record.",
  Age_Check:
    "Date of birth read from the {doc}; the age at the reference date falls as the answer states.",
  Naturalization_Check:
    "The certificate establishes naturalised status, and the status is current rather than revoked or lapsed.",
  Qualification_Relevance_Check:
    "The qualification shown is relevant to the oversight and executive responsibilities of the proposed role.",
  Experience_Duration_Check:
    "Relevant service computed from the dates on the {doc} meets the ten year threshold.",
  Experience_Relevance_Check:
    "The experience shown is relevant to the proposed role on both seniority and sector.",
  Record_Check:
    "The {doc} discloses no conviction, pending charge, civil finding of liability or military tribunal finding.",
  Scope_Check:
    "The search stated on the document covers the period and the jurisdictions the question asks about.",
  Compliance_History_Check:
    "The {doc} discloses no period of non-compliance with tax or other statutory obligations.",
  Period_Coverage_Check:
    "The document covers a historical period rather than current status alone, so a past lapse would have been visible.",
  Facility_Status_Check:
    "No facility shown has been restructured, renegotiated, written off or forgiven for non-payment.",
  Indebtedness_Amount_Check:
    "Aggregate indebtedness shown on the {doc} was reconciled against the threshold in the question.",
  Directorship_Check: "The applicant is recorded on the {doc} as a director, with dates.",
  Entity_Activity_Check:
    "The entity's principal activity falls within the definition of financial services the question refers to.",
  Beneficial_Ownership_Check:
    "The {doc} shows the beneficial interest held by the applicant, directly or through another arrangement.",
  Controlling_Interest_Threshold_Check:
    "The holding shown was compared against the 20% voting-share test and the board-control test.",
  Time_Commitment_Check:
    "The appointment letter states a time commitment consistent with the answer given.",
  Executive_Responsibility_Check:
    "The {doc} states whether the appointment carries executive responsibility for managing the institution.",
  Shareholding_Check: "The {doc} shows the shares of the Licensee held by the person named.",
  Relative_Name_Check: "The document identifies a specific relative by name, distinct from the applicant.",
  Relationship_Check:
    "The document states a relationship that counts as an immediate relative.",
  Signature_Check: "The declaration is signed and witnessed as required.",
  Declaration_Content_Check:
    "The declaration's wording covers the specific attestation the question requires.",
  Consistency_Check:
    "The figures on the supporting document reconcile with the {doc}, so the field-level checks ran against a value both documents agree on.",
};

function passingNote(checkName: string, response: ResponseItem): string {
  const primary = response.evidence.find((e) => e.role !== "supporting") ?? response.evidence[0];
  const docType = primary?.doc_type ?? "document";
  const docLabel = labelForDocType(docType, response.qid).toLowerCase();
  const template =
    PASSING_NOTES[checkName] ?? `The {doc} supports the answer of "${response.answer}".`;
  return template.replaceAll("{doc}", docLabel);
}

function runCheck(applicantId: string, response: ResponseItem, checkName: string): CheckResult {
  const override = OVERRIDES[`${applicantId}:${response.qid}`]?.[checkName];
  return {
    name: checkName,
    label: CHECK_LABELS[checkName] ?? checkName.replaceAll("_", " "),
    status: override?.status ?? "pass",
    confidence: override?.confidence ?? 0.96,
    note: override?.note ?? passingNote(checkName, response),
  };
}

function authenticateQuestion(applicantId: string, response: ResponseItem): QuestionAuthResult {
  const base = {
    qid: response.qid,
    question: response.question,
    answer: response.answer,
  };

  // No attachment means nothing was checked — either because none was asked for, or because a
  // mandatory one is missing, which is itself an issue.
  if (response.evidence.length === 0) {
    return {
      ...base,
      status: response.evidence_required ? "issue" : "not_checked",
      checks: [],
      confidence: null,
      summary: response.evidence_required
        ? "No document attached, so this answer could not be authenticated."
        : "No supporting document was required for this answer.",
    };
  }

  const checks = checksFor(response).map((name) => runCheck(applicantId, response, name));
  const confidence = Math.min(...checks.map((c) => c.confidence));
  const failed = checks.filter((c) => c.status === "fail");
  const cautions = checks.filter((c) => c.status === "caution");

  return {
    ...base,
    status: failed.length > 0 ? "issue" : "authenticated",
    checks,
    confidence,
    summary:
      failed.length > 0
        ? `${failed.length} check${failed.length > 1 ? "s" : ""} could not be satisfied by the evidence.`
        : cautions.length > 0
          ? `Authenticated, with ${cautions.length} check${cautions.length > 1 ? "s" : ""} the engine had to work for.`
          : "Every check passed against the attached document.",
  };
}

export function authenticate(
  assessmentId: string,
  applicantId: string,
  form: ApplicationForm
): AuthenticationOutcome {
  const sections: SectionAuthResult[] = [];

  for (const response of form.responses) {
    const result = authenticateQuestion(applicantId, response);
    let section = sections.find((s) => s.section === response.section);
    if (!section) {
      section = { section: response.section, issueCount: 0, questions: [] };
      sections.push(section);
    }
    section.questions.push(result);
    if (result.status === "issue") section.issueCount += 1;
  }

  const questions = sections.flatMap((s) => s.questions);
  const scored = questions.filter((q) => q.confidence !== null);

  return {
    assessmentId,
    sections,
    isClean: sections.every((s) => s.issueCount === 0),
    overallConfidence:
      scored.length > 0
        ? scored.reduce((sum, q) => sum + (q.confidence ?? 0), 0) / scored.length
        : null,
    // 15-question checks only. The CV runs its own checks and findings, but they are
    // reviewer-facing and must not move overall confidence, the issue count or this total.
    checksRun: questions.reduce((total, q) => total + q.checks.length, 0),
    cvVerification: verifyCv(applicantId, form.cv_verification),
  };
}

export function allQuestions(outcome: AuthenticationOutcome): QuestionAuthResult[] {
  return outcome.sections.flatMap((s) => s.questions);
}

export function issuesIn(outcome: AuthenticationOutcome): QuestionAuthResult[] {
  return allQuestions(outcome).filter((q) => q.status === "issue");
}
