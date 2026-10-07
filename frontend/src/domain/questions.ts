import type { Answer } from "./types";

/**
 * One entry per question, holding every rule the app applies to it. Adding or changing a
 * question means editing its entry here and nowhere else; the form, the evidence rules, the
 * authentication engine and the reviewer's default configuration all read from this table.
 */
interface QuestionDef {
  qid: string;
  section: string;
  sectionWeight: number;
  question: string;
  polarity: "Positive" | "Negative";
  questionWeight: number;
  isKnockOut: boolean;
  /**
   * "always": the evidence proves a standing fact (identity, qualification, appointment terms,
   * directorships) and is needed whatever the answer — only N/A drops it. "if_yes": the evidence
   * only supports a disclosure ("yes, I hold shares in X"), so a No has nothing to prove.
   */
  evidenceRequired: "always" | "if_yes";
  /** N/A is offered only where it is genuinely meaningful (T2: a non-executive appointment). */
  allowsNA: boolean;
  /**
   * Whether a second, supporting document may be attached for Consistency_Check to reconcile
   * against the primary (FC5 and FC7, where one lender's letter only partly evidences the answer).
   */
  acceptsSupporting: boolean;
  /**
   * The named checks the authentication engine runs, from the "Checks" sheet of the test set.
   * CS4 verifies the signature instead of Name_Check, and CoL3 is about a relative rather than
   * the applicant. Consistency_Check only runs when a supporting document is attached.
   */
  checks: string[];
}

// Weights, polarity and knock-outs ported verbatim from fnp_scoring_model_15q.xlsx ("Scoring
// Model" sheet); evidence rules and checks from the authentication test set.
export const QUESTIONS: QuestionDef[] = [
  {
    qid: "A1",
    section: "Basic Details",
    sectionWeight: 4,
    question: "Is the applicant between 45–60 years of age?",
    polarity: "Positive",
    questionWeight: 2.5,
    isKnockOut: false,
    evidenceRequired: "always",
    allowsNA: false,
    acceptsSupporting: false,
    checks: ["Document_Check", "Name_Check", "Age_Check"],
  },
  {
    qid: "A4",
    section: "Basic Details",
    sectionWeight: 4,
    question: "Is the applicant a naturalized citizen?",
    polarity: "Negative",
    questionWeight: 1.5,
    isKnockOut: false,
    evidenceRequired: "if_yes",
    allowsNA: false,
    acceptsSupporting: false,
    checks: ["Document_Check", "Name_Check", "Naturalization_Check"],
  },
  {
    qid: "Q1",
    section: "Qualifications & Experience",
    sectionWeight: 18,
    question: "Does the applicant hold a relevant academic qualification?",
    polarity: "Positive",
    questionWeight: 6,
    isKnockOut: false,
    evidenceRequired: "always",
    allowsNA: false,
    acceptsSupporting: false,
    checks: ["Document_Check", "Name_Check", "Qualification_Relevance_Check"],
  },
  {
    qid: "Q3",
    section: "Qualifications & Experience",
    sectionWeight: 18,
    question: "Does the applicant have ≥10 years relevant experience?",
    polarity: "Positive",
    questionWeight: 12,
    isKnockOut: false,
    evidenceRequired: "always",
    allowsNA: false,
    acceptsSupporting: false,
    checks: [
      "Document_Check",
      "Name_Check",
      "Experience_Duration_Check",
      "Experience_Relevance_Check",
    ],
  },
  {
    qid: "PC1",
    section: "Professional Conduct /Reputation/Integrity",
    sectionWeight: 26,
    question:
      "Have you at any time been charged with or convicted of any offence or otherwise found liable by a Civil, Criminal or Military Court (excluding minor road traffic offences), in any jurisdiction?",
    polarity: "Negative",
    questionWeight: 18,
    isKnockOut: true,
    evidenceRequired: "always",
    allowsNA: false,
    acceptsSupporting: false,
    checks: ["Document_Check", "Name_Check", "Record_Check", "Scope_Check"],
  },
  {
    qid: "PC19",
    section: "Professional Conduct /Reputation/Integrity",
    sectionWeight: 26,
    question:
      "Was there a time when you were not in compliance with any tax or other statutory requirements imposed on you? (Section 3(1)(iii) of the Act)",
    polarity: "Negative",
    questionWeight: 8,
    isKnockOut: false,
    evidenceRequired: "always",
    allowsNA: false,
    acceptsSupporting: false,
    checks: ["Document_Check", "Name_Check", "Compliance_History_Check", "Period_Coverage_Check"],
  },
  {
    qid: "FC5",
    section: "Financial Soundness",
    sectionWeight: 16,
    question:
      "Has any loan or credit facility (or part thereof) extended to you by any financial institution, been restructured, renegotiated, provided against or been the subject of a write-off or debt forgiveness for reasons of non-payment by you?",
    polarity: "Negative",
    questionWeight: 10,
    isKnockOut: false,
    evidenceRequired: "if_yes",
    allowsNA: false,
    acceptsSupporting: true,
    checks: ["Document_Check", "Name_Check", "Facility_Status_Check", "Consistency_Check"],
  },
  {
    qid: "FC7",
    section: "Financial Soundness",
    sectionWeight: 16,
    question:
      "Do you (in your personal capacity), or through any legal person or arrangement controlled by you and/or any immediate relative have outstanding any loans or other forms of indebtedness (including guarantees) in excess of N$2.5mn?",
    polarity: "Negative",
    questionWeight: 6,
    isKnockOut: false,
    evidenceRequired: "if_yes",
    allowsNA: false,
    acceptsSupporting: true,
    checks: ["Document_Check", "Name_Check", "Indebtedness_Amount_Check", "Consistency_Check"],
  },
  {
    qid: "CoI2",
    section: "Conflict of interest. (Entity/Enterprise based)",
    sectionWeight: 14,
    question:
      "Have you ever been or are you currently a Director of any limited liability companies, societies, or other business enterprises engaged in financial services, as defined in the BSA?",
    polarity: "Negative",
    questionWeight: 5,
    isKnockOut: false,
    evidenceRequired: "always",
    allowsNA: false,
    acceptsSupporting: false,
    checks: ["Document_Check", "Name_Check", "Directorship_Check", "Entity_Activity_Check"],
  },
  {
    qid: "CoI6",
    section: "Conflict of interest. (Entity/Enterprise based)",
    sectionWeight: 14,
    question:
      "Are you a beneficial owner of a controlling interest (20% or more of the voting shares, or the ability to appoint or remove a majority of the board) in any financial institution, partnerships, societies, or trust corporations or other body, organization or entity whether for business, benevolent or other purposes?",
    polarity: "Negative",
    questionWeight: 9,
    isKnockOut: false,
    evidenceRequired: "if_yes",
    allowsNA: false,
    acceptsSupporting: false,
    checks: [
      "Document_Check",
      "Name_Check",
      "Beneficial_Ownership_Check",
      "Controlling_Interest_Threshold_Check",
    ],
  },
  {
    qid: "T1",
    section: "Time Commitment",
    sectionWeight: 8,
    question:
      "Will you be actively engaged in the business of the Licensee to which this application relates and devote the major portion of your time thereto?",
    polarity: "Positive",
    questionWeight: 5,
    isKnockOut: false,
    evidenceRequired: "always",
    allowsNA: false,
    acceptsSupporting: false,
    checks: ["Document_Check", "Name_Check", "Time_Commitment_Check"],
  },
  {
    qid: "T2",
    section: "Time Commitment",
    sectionWeight: 8,
    question:
      "If you are completing this form in the capacity of director or proposed director, please indicate whether you have or will have any executive responsibility for the management of the institution's business",
    polarity: "Positive",
    questionWeight: 3,
    isKnockOut: false,
    evidenceRequired: "always",
    allowsNA: true,
    acceptsSupporting: false,
    checks: ["Document_Check", "Name_Check", "Executive_Responsibility_Check"],
  },
  {
    qid: "CoL1",
    section: "Conflict of interest. (Licensee based)",
    sectionWeight: 8,
    question: "Are any shares of the Licensee registered in your name?",
    polarity: "Negative",
    questionWeight: 5,
    isKnockOut: false,
    evidenceRequired: "if_yes",
    allowsNA: false,
    acceptsSupporting: false,
    checks: ["Document_Check", "Name_Check", "Shareholding_Check"],
  },
  {
    qid: "CoL3",
    section: "Conflict of interest. (Licensee based)",
    sectionWeight: 8,
    question:
      "Are any shares of the Licensee registered in the name of an immediate relative?",
    polarity: "Negative",
    questionWeight: 3,
    isKnockOut: false,
    evidenceRequired: "if_yes",
    allowsNA: false,
    acceptsSupporting: false,
    checks: ["Document_Check", "Relative_Name_Check", "Relationship_Check", "Shareholding_Check"],
  },
  {
    qid: "CS4",
    section: "Collective Suitability",
    sectionWeight: 6,
    question:
      "Have you acquainted yourself with and do you understand the extent of the rights and powers, as well as your responsibilities and duties, as a director, officer or key employee or a proposed director, officer or key employee of the institution for which this questionnaire is being completed, as contained in the applicable law, regulations, and guidelines?",
    polarity: "Positive",
    questionWeight: 6,
    isKnockOut: false,
    evidenceRequired: "always",
    allowsNA: false,
    acceptsSupporting: false,
    checks: ["Document_Check", "Signature_Check", "Declaration_Content_Check"],
  },
];

export const QUESTION_BY_QID: Record<string, QuestionDef> = Object.fromEntries(
  QUESTIONS.map((q) => [q.qid, q])
);

/** Every question demands a Yes or a No; N/A only where the catalogue allows it. */
export function isNaEligible(qid: string): boolean {
  return QUESTION_BY_QID[qid]?.allowsNA ?? false;
}

/**
 * `allowed` is the reviewer's configured answer set for this question. An answer already saved
 * on the draft is always kept, so a configuration change can never leave a form showing an
 * answer the filer cannot re-select.
 */
export function answerOptionsFor(
  qid: string,
  currentAnswer?: Answer,
  allowed?: Answer[]
): Answer[] {
  const base: Answer[] = allowed ?? ["Yes", "No", ...(isNaEligible(qid) ? ["N/A" as Answer] : [])];
  const options = base.filter((a) => a === "Yes" || a === "No" || a === "N/A");
  if (currentAnswer && !options.includes(currentAnswer)) options.push(currentAnswer);
  return options;
}
