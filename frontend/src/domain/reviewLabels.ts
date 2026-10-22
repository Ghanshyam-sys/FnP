/**
 * What the reviewer did with a question, as a label beside its outcome in the score breakdown (on
 * the scoring page, and in the assessment summary and its PDF): the latest ruling only, and its
 * comment when the question's row is opened.
 */
import type { ReviewEntry } from "../api/types";

export type ReviewKind = "accepted" | "overridden" | "rejected";

export interface ReviewLabel {
  kind: ReviewKind;
  text: string;
  /** What the label means, for its tooltip. */
  title: string;
  /** The chip palette tone. */
  tone: string;
}

/** "v2" -> "v3": the version a sent-back answer was resubmitted in. */
function nextVersion(run: string): string | null {
  const n = Number(run.replace(/^v/, ""));
  return Number.isInteger(n) && n > 0 ? `v${n + 1}` : null;
}

export function reviewLabel(entry: ReviewEntry): ReviewLabel {
  if (entry.verdict === "accepted") {
    // Accepted on a run the reviewer then had scored although it did not authenticate CLEAR: the
    // AI engine's finding was set aside, not cleared.
    return entry.scoreForced
      ? {
          kind: "overridden",
          text: "Overridden by reviewer",
          title: "The AI engine flagged this answer; the reviewer accepted it and had the case scored anyway.",
          tone: "warning",
        }
      : {
          kind: "accepted",
          text: "Accepted by reviewer",
          title: "The AI engine flagged this answer; the reviewer accepted it.",
          tone: "decision",
        };
  }
  const next = entry.current ? null : nextVersion(entry.run);
  return {
    kind: "rejected",
    text: next ? `Rejected by reviewer · resubmitted (${next})` : "Rejected by reviewer",
    title: next
      ? `The reviewer sent this answer back in ${entry.run}; the applicant resubmitted it with new evidence in ${next}.`
      : "The reviewer sent this answer back for new evidence.",
    tone: "neutral",
  };
}

/** The label for a question's latest ruling, or null if the reviewer never ruled on it. */
export function latestReviewLabel(entries: ReviewEntry[] | undefined): ReviewLabel | null {
  const latest = entries?.[entries.length - 1];
  return latest ? reviewLabel(latest) : null;
}

/** "14 Oct 2026" from a timestamp. */
function day(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A ruling as a line under the question: "Accepted by admin · v1 · 14 Oct 2026" (an applicant
 * reads "the reviewer"), its comment given beside it.
 */
export function reviewLine(entry: ReviewEntry): string {
  const verb = entry.verdict === "accepted" ? (entry.scoreForced ? "Overridden" : "Accepted") : "Rejected";
  return `${verb} by ${entry.by ?? "the reviewer"} · ${entry.run} · ${day(entry.at)}`;
}

/** The questions the reviewer ruled on, in any run. */
export function reviewedQids(history: Record<string, ReviewEntry[]> | undefined): string[] {
  return Object.entries(history ?? {})
    .filter(([, entries]) => entries.length > 0)
    .map(([qid]) => qid);
}
