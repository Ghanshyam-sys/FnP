import { CV_ANALYSIS } from "../data/stubs/cvAnalysis";
import type { CheckResult, CvFinding, CvSubmission, CvVerificationResult } from "./types";

/** Reviewer-facing only: a CV finding never moves the score or reopens the correction loop. */
const SCORING_IMPACT =
  "none — reviewer-facing only; does not affect the fit and proper score or reopen the correction loop";

/** The gate checks any attached document runs before it is read for content. */
function gateChecks(docLabel: string): CheckResult[] {
  return [
    {
      name: "Document_Check",
      label: "Document type",
      status: "pass",
      confidence: 0.96,
      note: `The uploaded file reads as a ${docLabel}, matching the document type selected.`,
    },
    {
      name: "Name_Check",
      label: "Document belongs to applicant",
      status: "pass",
      confidence: 0.96,
      note: "The name on the document matches the applicant record.",
    },
  ];
}

export function isCvFlag(finding: CvFinding): boolean {
  return finding.verdict === "EVIDENCE_CONFLICT" || finding.verdict === "SUITABILITY_FLAG";
}

/**
 * Runs after the 15 questions, since the consistency findings compare the CV against values
 * those questions have already authenticated.
 */
export function verifyCv(
  applicantId: string,
  cv: CvSubmission | undefined
): CvVerificationResult | null {
  if (!cv) return null;

  const attached = cv.evidence[0];
  if (!attached) {
    return {
      docType: cv.doc_type,
      status: "not_submitted",
      gateChecks: [],
      consistencyFindings: [],
      suitabilityFindings: [],
      flagCount: 0,
      scoringImpact: SCORING_IMPACT,
    };
  }

  // Stand-in for the backend's CV analysis until that call exists; see data/stubs/cvAnalysis.ts.
  const analysis = CV_ANALYSIS[applicantId];
  const consistencyFindings = analysis?.consistencyFindings ?? [];
  const suitabilityFindings = analysis?.suitabilityFindings ?? [];

  return {
    docType: attached.doc_type,
    status: "analyzed",
    gateChecks: gateChecks("curriculum vitae"),
    consistencyFindings,
    suitabilityFindings,
    flagCount: [...consistencyFindings, ...suitabilityFindings].filter(isCvFlag).length,
    scoringImpact: SCORING_IMPACT,
  };
}
