import { describe, expect, it } from "vitest";
import {
  readCase,
  recordDecision,
  recordResubmission,
  recordSubmission,
  ruleOnQuestion,
  stageFor,
} from "./caseStore";

const ID = "FNP-TEST";
const T0 = 1_000_000;
const AUTH_MS = 6000;
const SCORING_MS = 8000;

describe("case stage timeline", () => {
  it("is not submitted until the applicant submits", () => {
    expect(stageFor(ID, [], T0)).toBe("NOT_SUBMITTED");
  });

  it("runs authentication, then scoring, then waits for a decision on a clean case", () => {
    recordSubmission(ID, undefined, T0);
    expect(stageFor(ID, [], T0 + 1)).toBe("AUTH_RUNNING");
    expect(stageFor(ID, [], T0 + AUTH_MS)).toBe("SCORING");
    expect(stageFor(ID, [], T0 + AUTH_MS + SCORING_MS)).toBe("DECISION_PENDING");
  });

  it("waits on the reviewer while flags are unruled, then scores once all are accepted", () => {
    recordSubmission(ID, undefined, T0);
    const done = T0 + AUTH_MS;
    expect(stageFor(ID, ["Q3", "PC19"], done)).toBe("REVIEW_PENDING");
    ruleOnQuestion(ID, "Q3", "accepted", "", done + 10);
    expect(stageFor(ID, ["Q3", "PC19"], done + 20)).toBe("REVIEW_PENDING");
    ruleOnQuestion(ID, "PC19", "accepted", "", done + 30);
    expect(stageFor(ID, ["Q3", "PC19"], done + 40)).toBe("SCORING");
    expect(stageFor(ID, ["Q3", "PC19"], done + 30 + SCORING_MS)).toBe("DECISION_PENDING");
  });

  it("goes back to the applicant on a rejection, and resubmission runs clean", () => {
    recordSubmission(ID, undefined, T0);
    const done = T0 + AUTH_MS;
    ruleOnQuestion(ID, "PC1", "rejected", "needs a court order", done);
    expect(stageFor(ID, ["PC1"], done + 1)).toBe("AWAITING_APPLICANT");
    recordResubmission(ID, done + 100);
    expect(stageFor(ID, ["PC1"], done + 101)).toBe("AUTH_RUNNING");
    expect(stageFor(ID, ["PC1"], done + 100 + AUTH_MS)).toBe("SCORING");
    expect(readCase(ID).rulings).toEqual({});
  });

  it("settles on the reviewer's decision", () => {
    recordSubmission(ID, undefined, T0);
    recordDecision(ID, "accepted", "ok", T0 + 1);
    expect(stageFor(ID, [], T0 + 2)).toBe("ACCEPTED");
    recordDecision(ID, "rejected", "no", T0 + 3);
    expect(stageFor(ID, [], T0 + 4)).toBe("REJECTED");
  });
});
