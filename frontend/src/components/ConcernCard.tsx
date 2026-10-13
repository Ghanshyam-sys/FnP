import { ExternalLinkIcon } from "./icons";
import { displaySection } from "../domain/sectionLabels";
import type { FinalAssessment } from "../api/types";

export type Concern = FinalAssessment["concerns"][number];

/**
 * One concern from the AI engine's written assessment: what it found, the passage in the evidence
 * it rests on, and the condition proposed against it. Shown in the assessment summary and, for the
 * question it concerns, under that question's row in the score breakdown.
 */
export default function ConcernCard({ concern: c, showSection = true }: { concern: Concern; showSection?: boolean }) {
  return (
    <article className="pane-concern">
      <div className="pane-concern-head">
        <span className="qid">{c.qid}</span>
        <span className="chip chip-warning">{c.severity}</span>
        <span className="pane-concern-type">{c.risk_type}</span>
        {showSection && <span className="pane-concern-section">{displaySection(c.section)}</span>}
      </div>
      <p className="pane-prose">{c.statement}</p>
      <blockquote className="pane-quote">
        <span className="pane-quote-text">{c.quote}</span>
        {c.evidence_url && (
          <a href={c.evidence_url} target="_blank" rel="noreferrer">
            View in evidence
            <ExternalLinkIcon size={11} />
          </a>
        )}
      </blockquote>
      <div className="pane-condition">
        <span className="pane-condition-id">{c.condition_id}</span>
        <p>{c.condition}</p>
      </div>
    </article>
  );
}
