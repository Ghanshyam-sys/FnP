import { describe, expect, it } from "vitest";
import { latestReviewLabel, reviewLabel, reviewLine, reviewedQids } from "./reviewLabels";
import type { ReviewEntry } from "../api/types";

const entry = (change: Partial<ReviewEntry>): ReviewEntry => ({
  verdict: "accepted",
  comment: "Fine.",
  at: "2026-10-14T09:00:00Z",
  by: "admin",
  run: "v1",
  current: true,
  scoreForced: false,
  ...change,
});

describe("reviewer labels beside a question's outcome", () => {
  it("says the reviewer accepted a flagged answer", () => {
    const label = latestReviewLabel([entry({})]);
    expect([label?.text, label?.tone]).toEqual(["Accepted by reviewer", "decision"]);
  });

  it("says the reviewer overrode it when the run was scored at their request", () => {
    expect(latestReviewLabel([entry({ scoreForced: true })])?.text).toBe("Overridden by reviewer");
  });

  it("says an answer sent back earlier was resubmitted, in which version", () => {
    const label = reviewLabel(entry({ verdict: "rejected", run: "v1", current: false }));
    expect(label.text).toBe("Rejected by reviewer · resubmitted (v2)");
    expect(label.title).toContain("in v1");
  });

  it("labels only the latest ruling of a question sent back and later overridden", () => {
    const label = latestReviewLabel([
      entry({ verdict: "rejected", run: "v1", current: false }),
      entry({ verdict: "rejected", run: "v2", current: false }),
      entry({ verdict: "accepted", run: "v3", current: true, scoreForced: true }),
    ]);
    expect(label?.text).toBe("Overridden by reviewer");
  });

  it("has nothing for a question the reviewer never ruled on", () => {
    expect(latestReviewLabel(undefined)).toBeNull();
    expect(latestReviewLabel([])).toBeNull();
    expect(reviewedQids({ A1: [entry({})], Q1: [] })).toEqual(["A1"]);
  });

  it("names the reviewer to a reviewer, and the reviewer's role to an applicant", () => {
    expect(reviewLine(entry({}))).toBe("Accepted by admin · v1 · 14 Oct 2026");
    expect(reviewLine(entry({ by: null, verdict: "rejected" }))).toBe("Rejected by the reviewer · v1 · 14 Oct 2026");
  });
});
