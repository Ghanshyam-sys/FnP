import type { FinalAssessment } from "../api/types";
import type { SectionScoreLine } from "../domain/types";

type Outcomes = NonNullable<FinalAssessment["questions"]>;

/** The engine's "A1, A4, Q1" (or a list) as codes. */
function codes(list?: string | string[] | null): string[] {
  const text = Array.isArray(list) ? list.join(",") : typeof list === "string" ? list : "";
  return text
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

const GROUPS: { key: keyof Outcomes; title: string; tone: string; explain: string }[] = [
  {
    key: "passed",
    title: "Passed",
    tone: "low",
    explain: "Answered, and where a document was needed, confirmed by it. Nothing to act on.",
  },
  {
    key: "conditional",
    title: "Conditional",
    tone: "warning",
    explain: "Acceptable with a condition.",
  },
  {
    key: "not_applicable",
    title: "Not applicable",
    tone: "neutral",
    explain: "Answered N/A, so left out of the score.",
  },
];

/**
 * "Question outcomes" in the assessment summary, the same on screen and in its PDF: each outcome
 * explained, with what every question asked and how it was answered, rather than codes alone. A
 * question whose text "Where the risk comes from" already shows (`detailed`: one carrying risk or
 * with a concern) is listed by its code only, pointing there, so nothing shows twice.
 */
export default function QuestionOutcomes({
  outcomes,
  lines,
  detailed,
}: {
  outcomes: Outcomes;
  lines: SectionScoreLine[];
  detailed: Set<string>;
}) {
  const byQid = new Map(lines.map((l) => [l.qid, l]));
  return (
    <div className="pane-outcomes">
      {GROUPS.map((g) => {
        const ids = codes(outcomes[g.key] as string | string[] | undefined);
        // Printed in full above (carrying risk, or with a concern): only its code here.
        const shownAbove = ids.filter((id) => detailed.has(id));
        const listed = ids.filter((id) => !shownAbove.includes(id));
        return (
          <div className="pane-outcome-group" key={g.key}>
            <h4>
              <span className={`chip chip-${g.tone}`}>{g.title}</span>
              <span className="pane-outcome-count">
                {ids.length} question{ids.length === 1 ? "" : "s"}
              </span>
            </h4>
            <p className="pane-outcome-explain">{g.explain}</p>
            {ids.length === 0 ? (
              <p className="pane-outcome-none">None.</p>
            ) : (
              <>
                {listed.length > 0 && (
                  <table className="pane-outcome-table">
                    <thead>
                      <tr>
                        <th scope="col">Question</th>
                        <th scope="col">What it asked</th>
                        <th scope="col">Answer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listed.map((id) => {
                        const line = byQid.get(id);
                        return (
                          <tr key={id}>
                            <td>
                              <span className="qid">{id}</span>
                            </td>
                            <td>{line?.question || "—"}</td>
                            <td>{line?.answer ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {shownAbove.length > 0 && (
                  <p className="pane-outcome-above">
                    {shownAbove.map((id) => (
                      <span className="qid" key={id}>
                        {id}
                      </span>
                    ))}
                    <span>
                      {listed.length > 0 ? "Also: " : ""}
                      shown with their questions under Where the risk comes from.
                    </span>
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
