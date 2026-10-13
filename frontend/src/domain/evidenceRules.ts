import type { ApplicationForm, ResponseItem } from "./types";
import type { Form } from "../api/types";

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

/** Formats the reviewer names one way and files arrive the other: .jpeg is jpg, and so on. */
const SAME_FORMAT: Record<string, string> = { jpeg: "jpg", tiff: "tif", heif: "heic" };
const format = (ext: string) => SAME_FORMAT[ext] ?? ext;

/**
 * Documents attached under question settings since tightened (fewer files, or a format withdrawn),
 * as "PC1 (.pdf no longer accepted)". Each upload was checked when it was made; submitting checks
 * what is attached against the settings in force now. The backend applies the same rule.
 */
export function documentRuleBreaks(form: Form, cvFileTypes: string[]): string[] {
  const rules = new Map<string, { fileTypes: string[]; maxFiles: number }>(
    form.answers.map((a) => [a.qid, { fileTypes: a.fileTypes, maxFiles: a.maxFiles }])
  );
  rules.set("CV", { fileTypes: cvFileTypes, maxFiles: 1 });
  const byQid = new Map<string, string[]>();
  for (const e of form.evidence) byQid.set(e.qid, [...(byQid.get(e.qid) ?? []), e.fileName]);

  const breaks: string[] = [];
  for (const [qid, names] of byQid) {
    const rule = rules.get(qid);
    if (!rule) continue;
    if (names.length > rule.maxFiles) {
      breaks.push(`${qid} (only ${rule.maxFiles} document${rule.maxFiles > 1 ? "s" : ""} allowed)`);
    }
    const allowed = new Set(rule.fileTypes.map(format));
    const refused = [
      ...new Set(
        names
          .map((n) => (n.includes(".") ? n.slice(n.lastIndexOf(".") + 1).toLowerCase() : ""))
          .filter((ext) => !allowed.has(format(ext)))
      ),
    ].sort();
    if (refused.length > 0) breaks.push(`${qid} (${refused.map((ext) => `.${ext}`).join(", ")} no longer accepted)`);
  }
  return breaks;
}
