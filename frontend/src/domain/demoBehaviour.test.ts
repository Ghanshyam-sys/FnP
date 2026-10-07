import { describe, expect, it } from "vitest";
import { REVIEWABLE_ASSIGNMENTS } from "../data/assignments";
import { getDraft, resetDraft } from "../state/draftStore";
import { authenticate, issuesIn } from "./authentication";
import { score } from "./engine";
import { bandFor } from "./bands";
import { answerOptionsFor, QUESTIONS } from "./questions";
import { evidenceOptionsFor, labelForDocType } from "./evidenceOptions";
import { defaultConfig } from "../state/questionConfigStore";

/**
 * Pins what the demo shows today. The engine outputs are stub data standing in for a backend,
 * so these snapshots are the contract: any refactor of the domain layer must leave them
 * unchanged.
 */
describe.each(REVIEWABLE_ASSIGNMENTS.map((a) => [a.applicantId, a] as const))(
  "%s seeded draft",
  (_applicantId, assignment) => {
    it("authenticates to the same outcome", () => {
      const outcome = authenticate(assignment.id, assignment.applicantId, getDraft(assignment));
      expect(outcome).toMatchSnapshot();
    });

    it("scores to the same result", () => {
      expect(score(getDraft(assignment))).toMatchSnapshot();
    });
  }
);

describe("flagged questions", () => {
  const flagsFor = (applicantId: string) => {
    const assignment = REVIEWABLE_ASSIGNMENTS.find((a) => a.applicantId === applicantId)!;
    return issuesIn(authenticate(assignment.id, applicantId, getDraft(assignment))).map(
      (q) => q.qid
    );
  };

  it("only APP003 and APP004 fail authentication", () => {
    expect(flagsFor("APP001")).toEqual([]);
    expect(flagsFor("APP002")).toEqual([]);
    expect(flagsFor("APP003")).toEqual(["Q3", "PC19"]);
    expect(flagsFor("APP004")).toEqual(["PC1"]);
    expect(flagsFor("APP005")).toEqual([]);
  });
});

describe("blank new application", () => {
  it("authenticates and scores the same", () => {
    const assignment = REVIEWABLE_ASSIGNMENTS[0];
    const blank = resetDraft(assignment);
    const { submitted_at: _ignored, ...stable } = blank;
    expect(stable).toMatchSnapshot();
    expect(authenticate(assignment.id, assignment.applicantId, blank)).toMatchSnapshot();
    expect(score(blank)).toMatchSnapshot();
  });
});

describe("question rules", () => {
  it("offers the same answers, evidence options and defaults per question", () => {
    const rules = QUESTIONS.map((q) => ({
      qid: q.qid,
      answers: answerOptionsFor(q.qid),
      options: evidenceOptionsFor(q.qid).map((o) => `${o.code}:${o.docType}:${o.label}`),
      labels: evidenceOptionsFor(q.qid).map((o) => labelForDocType(o.docType, q.qid)),
    }));
    expect(rules).toMatchSnapshot();
    expect(defaultConfig()).toMatchSnapshot();
  });

  it("bands the risk score at the published thresholds", () => {
    expect([0, 0.0999, 0.1, 0.2499, 0.25, 0.4499, 0.45, 1].map((s) => bandFor(s).band)).toEqual([
      "Low",
      "Low",
      "Moderate",
      "Moderate",
      "Elevated",
      "Elevated",
      "High",
      "High",
    ]);
  });
});
