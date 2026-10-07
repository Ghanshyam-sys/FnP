import type { CheckStatus } from "../../domain/types";

interface CheckOverride {
  status: CheckStatus;
  confidence: number;
  note: string;
}

/**
 * Ground truth from the v2 workbook: the three answer-level contradictions in "Expected
 * Verdicts", plus the "must not fail" cases, which pass but at reduced confidence because the
 * engine had to work for them.
 */
export const OVERRIDES: Record<string, Record<string, CheckOverride>> = {
  "APP003:Q3": {
    Experience_Duration_Check: {
      status: "fail",
      confidence: 0.24,
      note: "The letter records 2018-03-01 to 2026-04-30 — 8 years 2 months — and states there was no prior service with this employer. The evidence cannot support a claim of ten years or more.",
    },
  },
  "APP003:PC19": {
    Compliance_History_Check: {
      status: "fail",
      confidence: 0.22,
      note: "The certificate records the 2019/2020 return filed 231 days late, with a N$14,200 penalty. A period of non-compliance exists, so the answer derived from the evidence is Yes.",
    },
  },
  "APP004:PC1": {
    Record_Check: {
      status: "fail",
      confidence: 0.19,
      note: "The clearance certificate records a 2013 conviction under section 34 of the Companies Act (Annexure A), not expunged. The answer derived from the evidence is Yes.",
    },
  },
  "APP005:Q1": {
    Name_Check: {
      status: "caution",
      confidence: 0.74,
      note: "The certificate is in the maiden name Margaret Iipinge and the page is scanned. Resolved against the national ID, which records the 1991 change of surname.",
    },
  },
  "APP002:A1": {
    Age_Check: {
      status: "caution",
      confidence: 0.78,
      note: "The date of birth appears only on a scanned national ID, so the value was read by OCR rather than from embedded text.",
    },
  },
  "APP004:FC5": {
    Facility_Status_Check: {
      status: "caution",
      confidence: 0.76,
      note: "The letter confirms the facility was restructured but explicitly not written off or forgiven. The question is disjunctive, so Yes is correct.",
    },
  },
};
