import { QUESTION_BY_QID } from "./questions";
import type { Answer, ApplicationForm, ResponseItem } from "./types";

/** Whether this answer needs a document attached. The rule per question is in the catalogue. */
export function isEvidenceRequired(qid: string, answer: Answer): boolean {
  if (answer === "N/A") return false;
  const rule = QUESTION_BY_QID[qid]?.evidenceRequired;
  if (rule === "always") return true;
  if (rule === "if_yes") return answer === "Yes";
  return false;
}

export function hasMissingMandatoryEvidence(response: ResponseItem): boolean {
  return response.evidence_required && response.evidence.length === 0;
}

export interface EvidenceGaps {
  /** Questions whose mandatory document is not attached, in form order. */
  missing: ResponseItem[];
  /** The CV is mandatory but sits outside the 15 questions, so it is counted separately. */
  cvMissing: boolean;
  /** Documents the form requires in total, CV included. */
  requiredTotal: number;
  /** Of those, how many are not attached. */
  missingTotal: number;
  /** qids still missing a document, with "CV" last when it is missing. */
  missingIds: string[];
}

/** What the form still lacks, as the data collection and review pages both report it. */
export function evidenceGaps(form: ApplicationForm): EvidenceGaps {
  const required = form.responses.filter((r) => r.evidence_required);
  const missing = required.filter(hasMissingMandatoryEvidence);
  const cv = form.cv_verification;
  const cvMissing = Boolean(cv?.mandatory) && (cv?.evidence.length ?? 0) === 0;
  return {
    missing,
    cvMissing,
    requiredTotal: required.length + (cv?.mandatory ? 1 : 0),
    missingTotal: missing.length + (cvMissing ? 1 : 0),
    missingIds: [...missing.map((r) => r.qid), ...(cvMissing ? ["CV"] : [])],
  };
}
