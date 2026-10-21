import { Fragment } from "react";
import ConcernCard from "./ConcernCard";
import { displaySection } from "../domain/sectionLabels";
import { detailedQids, riskShare, sectionTotals } from "../domain/riskSections";
import { concernKey, type Concern } from "../domain/concerns";
import type { ScoreResult, SectionScoreLine } from "../domain/types";

/** The outcome of one question, in words, as the scoring page's chips read. */
function outcome(line: SectionScoreLine): { text: string; tone: string } {
  if (line.answer === "N/A") return { text: "Not applicable", tone: "neutral" };
  return line.riskFlag ? { text: "Risk", tone: "critical" } : { text: "Clear", tone: "low" };
}

/**
 * "Where the risk comes from", for the printed assessment summary only (the panel on screen is
 * unchanged; the scoring page has the interactive version). Every section prints as its bar; a
 * section carrying risk, or holding a question the AI engine wrote a concern about, prints open
 * with all its questions. Under each such question come what it asks and the engine's concerns
 * about it (what it found, the passage in the evidence, the condition proposed), as the scoring
 * page shows them when the question is opened. The sections' total is the weighted risk the score
 * block already gives.
 */
export default function PrintRiskBreakdown({ scoreResult, concerns }: { scoreResult: ScoreResult; concerns: Concern[] }) {
  const sections = sectionTotals(scoreResult);
  if (sections.length === 0) return null;
  const detailed = detailedQids(
    scoreResult,
    concerns.map((c) => c.qid)
  );

  return (
    <section className="pane-section pane-print-risk">
      <h3>Where the risk comes from</h3>
      <p className="pane-print-risk-sub">
        Each bar shows the risk points a section's answers carry, of the most it could carry (for
        example 5.0 / 14). Together they make the weighted risk above. Sections with risk are opened
        to show their questions, with the AI engine's concerns and proposed conditions under the
        question they are about.
      </p>

      {sections.map((s) => {
        const open = s.risk > 0 || s.lines.some((l) => detailed.has(l.qid));
        return (
          <div className={`pane-risk-section${open ? " is-risky" : ""}`} key={s.section}>
            <div className="pane-risk-row">
              <span className="pane-risk-label">{displaySection(s.section)}</span>
              <span className="pane-risk-track">
                <span className="pane-risk-fill" style={{ width: `${riskShare(s)}%` }} />
              </span>
              <span className="pane-risk-value">
                <strong>{s.risk.toFixed(1)}</strong> / {s.weight}
              </span>
            </div>

            {open && (
              <table className="pane-risk-table">
                <thead>
                  <tr>
                    <th scope="col">Question</th>
                    <th scope="col">Answer</th>
                    <th scope="col" className="num">
                      Points possible
                    </th>
                    <th scope="col">Outcome</th>
                    <th scope="col" className="num">
                      Risk points
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {s.lines.map((l) => {
                    const o = outcome(l);
                    const about = concerns.filter((c) => c.qid === l.qid);
                    const full = detailed.has(l.qid);
                    return (
                      <Fragment key={l.qid}>
                        <tr className={full ? "is-risk" : undefined}>
                          <td>
                            <span className="qid">{l.qid}</span>
                          </td>
                          <td>{l.answer}</td>
                          <td className="num">{l.applicableWeight}</td>
                          <td>
                            <span className={`chip chip-${o.tone}`}>{o.text}</span>
                          </td>
                          <td className="num strong">{l.weightedRisk.toFixed(1)}</td>
                        </tr>
                        {/* What the question asks, and why it counts, across the full width. */}
                        {full && (
                          <tr className="pane-risk-why">
                            <td colSpan={5}>
                              {l.question && <p className="pane-risk-question">{l.question}</p>}
                              {l.knockOutTriggered && (
                                <p className="pane-risk-note is-knockout">
                                  Knock-out question: the case is referred regardless of the weighted score.
                                </p>
                              )}
                              {about.length > 0 ? (
                                <div className="pane-risk-concerns">
                                  {about.map((c, i) => (
                                    <ConcernCard key={concernKey(c, i)} concern={c} showSection={false} />
                                  ))}
                                </div>
                              ) : (
                                <p className="pane-risk-note">
                                  The answer "{l.answer}" counts as a risk for this question, adding{" "}
                                  {l.weightedRisk.toFixed(1)} to the score. The AI engine wrote no further concern about it.
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </section>
  );
}
