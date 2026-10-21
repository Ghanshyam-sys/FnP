import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  DownloadIcon,
  InfoIcon,
  XIcon,
} from "./icons";
import ConcernCard from "./ConcernCard";
import PrintRiskBreakdown from "./PrintRiskBreakdown";
import PrintQuestionOutcomes from "./PrintQuestionOutcomes";
import { concernKey } from "../domain/concerns";
import { detailedQids } from "../domain/riskSections";
import type { Assessment, Case, FinalAssessment } from "../api/types";
import type { ScoreResult } from "../domain/types";

const VERDICT_TONE: Record<string, string> = {
  APPROVE: "low",
  CONDITIONAL: "warning",
  REFER: "serious",
  REJECT: "critical",
};

/** "1 Oct 2026, 09:53", as dates read everywhere else in the app. */
function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** "3 Oct 2026" from a timestamp. */
function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The engine lists question outcomes as "A1, A4, Q1": shown as the question tags used everywhere
 * else. Anything that is not such a list is shown as written.
 */
function QuestionIds({ list }: { list?: string | string[] | null }) {
  // The engine leaves an outcome out when no question has it, and may send a list instead of text.
  const text = Array.isArray(list) ? list.join(", ") : typeof list === "string" ? list : "";
  const ids = text
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) return <dd className="pane-qsplit-none">None</dd>;
  if (ids.some((id) => /\s/.test(id))) return <dd>{text}</dd>;
  return (
    <dd className="pane-qids">
      {ids.map((id) => (
        <span className="qid" key={id}>
          {id}
        </span>
      ))}
    </dd>
  );
}

/** A value for a CSS string: printed in the page footer, so quotes and backslashes are escaped. */
const cssString = (value: string) => `"${value.replace(/[\\"]/g, "\\$&").replace(/[\r\n]+/g, " ")}"`;

/**
 * Identifies the case at the top of the printed summary, so the PDF still says whose assessment it
 * is, for what, and where it stands once it has left the app. Hidden on screen, where the page
 * behind the pane already says all of this.
 */
function PrintHeader({ assignment }: { assignment: Assessment }) {
  return (
    <header className="pane-print-head">
      <div className="pane-print-brand">
        <img className="pane-print-logo" src="/brand/iris-logo.png" alt="iRIS" width="38" height="24" />
        <span>Fit and Proper Assessment</span>
        <span className="pane-print-doc">Assessment summary</span>
      </div>
      <h1 className="pane-print-name">{assignment.applicantName}</h1>
      <p className="pane-print-role">
        {assignment.position} · {assignment.entity}
      </p>
      <dl className="pane-print-meta">
        <div>
          <dt>Assessment</dt>
          <dd>{assignment.id}</dd>
        </div>
        <div>
          <dt>Application reference</dt>
          <dd>{assignment.reference}</dd>
        </div>
        <div>
          <dt>Department</dt>
          <dd>{assignment.department.name}</dd>
        </div>
      </dl>
    </header>
  );
}

/**
 * The reviewer's decision and the feedback they gave with it, at the top of the summary for both
 * the reviewer and the applicant, and in the PDF. Before a decision, it says the case is waiting.
 */
function ReviewerDecision({ decision }: { decision: Case["decision"] }) {
  if (!decision) {
    return (
      <section className="pane-section pane-decision is-pending">
        <h3>Reviewer decision</h3>
        <p className="pane-prose">Not decided yet. The reviewer's decision and feedback appear here once given.</p>
      </section>
    );
  }
  const accepted = decision.verdict === "accepted";
  return (
    <section className="pane-section pane-decision">
      <h3>Reviewer decision</h3>
      <div className="pane-decision-head">
        <span className={`chip chip-${accepted ? "low" : "critical"}`}>
          {accepted ? <CheckCircleIcon size={12} /> : <AlertTriangleIcon size={12} />}
          {accepted ? "Accepted" : "Rejected"}
        </span>
        <span className="pane-decision-date">{formatDay(decision.at)}</span>
      </div>
      <p className="pane-decision-label">Feedback</p>
      <p className="pane-prose pane-decision-feedback">{decision.remarks}</p>
    </section>
  );
}

function Empty({ applicantName }: { applicantName: string }) {
  return (
    <div className="pane-empty">
      <InfoIcon size={20} />
      <p>
        <strong>No assessment summary yet.</strong>
      </p>
      <p>
        There is no written assessment for {applicantName}. The AI engine writes one only for a
        submission in which every answer was authenticated, so there is none when answers were
        flagged (even if the reviewer then accepted them) or when the engine could not produce one.
      </p>
    </div>
  );
}

export default function AssessmentSummaryPane({
  assessment,
  assignment,
  decision,
  scoreResult = null,
  onClose,
}: {
  assessment: FinalAssessment | null;
  /** The case the summary belongs to: printed at the top of the PDF. */
  assignment: Assessment;
  decision: Case["decision"];
  /** The score as the page shows it (null: none to show): its breakdown prints with the PDF. */
  scoreResult?: ScoreResult | null;
  onClose: () => void;
}) {
  const applicantName = assignment.applicantName;

  // Escape closes the pane, as it would any slide-over, and the page behind it stays put.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  // While printing, the page title names the case: it is the PDF's default file name and the
  // title in the browser's print header, instead of the app's name for every summary.
  useEffect(() => {
    let previous: string | null = null;
    const before = () => {
      // Kept from the first of any repeated beforeprint events, so the app's title is restored.
      previous ??= document.title;
      document.title = `Assessment summary - ${applicantName} - ${assignment.id}`;
    };
    const after = () => {
      if (previous !== null) document.title = previous;
      previous = null;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      after();
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [applicantName, assignment.id]);

  const determination = assessment?.determination;
  // Parts the engine may leave out, so a missing one shows as empty rather than breaking the pane.
  const concerns = assessment?.concerns ?? [];
  const strengths = assessment?.strengths ?? [];
  const forSupervisor = assessment?.for_supervisor ?? [];
  const outcomes = assessment?.questions ?? {};
  const evidence = assessment?.evidence;
  const meta = assessment?.assessment;
  const override = determination?.authentication_override;
  // The concerns the PDF prints in their own section: every one until the reviewer decides; after
  // that only those with no question in the breakdown (where the rest print, under their question).
  const lineQids = new Set(scoreResult?.lines.map((l) => l.qid) ?? []);
  const concernsMoved = Boolean(decision && scoreResult);
  const concernsPrintHere = concernsMoved ? concerns.filter((c) => !lineQids.has(c.qid)) : concerns;
  // Decided, and every concern is under its question: the section is left out of the PDF.
  const concernsLeftOut = concernsMoved && concernsPrintHere.length === 0;
  // The running footer on every printed page. CSS cannot read the case from the page, so the
  // rule is written with it.
  const pageFooter = `@page { @bottom-left { content: ${cssString(`${assignment.id} · ${applicantName}`)}; } }`;

  // Rendered at the document root: the pane is a modal layer, and printing it as the PDF means
  // hiding everything else under <body>, which only works if it is a sibling of the app root.
  return createPortal(
    <div className="pane-overlay" role="presentation" onClick={onClose}>
      <aside
        className="pane"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assessment-pane-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pane-head">
          <div className="pane-head-text">
            <h2 id="assessment-pane-title">Assessment summary</h2>
            <p className="pane-sub">{applicantName}</p>
          </div>
          <div className="pane-head-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => window.print()}
              disabled={!assessment}
              title={
                assessment
                  ? "Opens the print dialog — choose Save as PDF"
                  : "Nothing to download yet"
              }
            >
              <DownloadIcon size={14} />
              Download as PDF
            </button>
            <button className="pane-close" onClick={onClose} aria-label="Close assessment summary">
              <XIcon size={16} />
            </button>
          </div>
        </header>

        <div className="pane-body">
          <style>{pageFooter}</style>
          <PrintHeader assignment={assignment} />
          <ReviewerDecision decision={decision} />
          {!assessment || !determination ? (
            <Empty applicantName={applicantName} />
          ) : (
            <>
              <section className="pane-section pane-section-verdict">
                <p className="pane-print-explain pane-verdict-who">
                  The AI engine's assessment{decision ? "; the reviewer's decision is above" : ""}.
                </p>
                <div className="pane-verdict">
                  <span className={`chip chip-${VERDICT_TONE[determination.verdict] ?? "neutral"}`}>
                    {determination.verdict}
                  </span>
                  <span className="pane-verdict-reco">{determination.recommendation}</span>
                </div>
                <dl className="pane-stats">
                  <div>
                    <dt>Risk score</dt>
                    <dd>
                      {determination.risk_score}
                      <span className="pane-print-explain">Out of 100: the higher, the more risk.</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Band</dt>
                    <dd>
                      {determination.risk_band}
                      <span className="pane-print-explain">Low, Moderate, Elevated or High.</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Weighted risk</dt>
                    <dd>
                      {determination.weighted_risk}
                      <span className="pane-print-explain">Risk points from the answers, of the most possible.</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Knock-out</dt>
                    <dd>
                      {determination.knock_out_triggered ? "Triggered" : "None"}
                      <span className="pane-print-explain">An answer that refers the case on its own.</span>
                    </dd>
                  </div>
                </dl>
                {override?.note && (
                  <p className="pane-override" role="note">
                    <AlertTriangleIcon size={14} />
                    <span>
                      <strong>Scored at the reviewer's request.</strong> {override.note}
                    </span>
                  </p>
                )}
              </section>

              {assessment.executive_summary && (
                <section className="pane-section">
                  <h3>Executive summary</h3>
                  <p className="pane-prose">{assessment.executive_summary}</p>
                </section>
              )}

              {/* In the PDF only: where the risk comes from, risky sections open. */}
              {scoreResult && <PrintRiskBreakdown scoreResult={scoreResult} concerns={concerns} />}

              {/* In the PDF the concerns print under their questions in the breakdown above; this
                  section prints as well until the reviewer decides, then only for a concern with
                  no question there. On screen it always shows. */}
              <section className={`pane-section${concernsLeftOut ? " pane-screen-only" : ""}`}>
                <h3>
                  Concerns and proposed conditions
                  <span className="pane-count">{concerns.length}</span>
                </h3>
                <p className="pane-print-explain pane-section-explain">
                  What the AI engine found that needs attention: how serious it judges it, the passage
                  in the evidence it rests on, and the condition proposed against it (COND-…).
                </p>
                {concerns.map((c, i) => (
                  <div
                    className={`pane-concern-item${concernsPrintHere.includes(c) ? "" : " pane-screen-only"}`}
                    key={concernKey(c, i)}
                  >
                    <ConcernCard concern={c} />
                  </div>
                ))}
              </section>

              <section className="pane-section">
                <h3>
                  Strengths<span className="pane-count">{strengths.length}</span>
                </h3>
                <p className="pane-print-explain pane-section-explain">
                  What the evidence shows in the applicant's favour, by question.
                </p>
                <ul className="pane-list">
                  {strengths.map((s, i) => (
                    <li key={`${s.qid}-${i}`}>
                      <CheckCircleIcon size={14} />
                      <span>
                        <span className="qid">{s.qid}</span> {s.statement}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="pane-section">
                <h3>For the supervisor</h3>
                <p className="pane-print-explain pane-section-explain">
                  Points the AI engine suggests the supervisor looks into further.
                </p>
                <ul className="pane-list pane-list-questions">
                  {forSupervisor.map((q, i) => (
                    <li key={i}>
                      <AlertTriangleIcon size={14} />
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="pane-section">
                <h3>Question outcomes</h3>
                {/* On screen, the codes; in the PDF, each outcome explained with what every
                    question asked (when the score's questions are to hand). */}
                <dl className={`pane-qsplit${scoreResult ? " pane-screen-only" : ""}`}>
                  <div>
                    <dt>Passed</dt>
                    <QuestionIds list={outcomes.passed} />
                  </div>
                  <div>
                    <dt>Conditional</dt>
                    <QuestionIds list={outcomes.conditional} />
                  </div>
                  <div>
                    <dt>Not applicable</dt>
                    <QuestionIds list={outcomes.not_applicable} />
                  </div>
                </dl>
                {scoreResult && (
                  <PrintQuestionOutcomes
                    outcomes={outcomes}
                    lines={scoreResult.lines}
                    detailed={detailedQids(
                      scoreResult,
                      concerns.map((c) => c.qid)
                    )}
                  />
                )}
              </section>

              <footer className="pane-meta">
                {evidence && (
                  <span>
                    {evidence.documents_read ?? 0} documents read · {evidence.questions_verified ?? 0} questions
                    verified<span className="pane-print-inline"> (checked against a document)</span> ·{" "}
                    {evidence.questions_self_declared ?? 0} self-declared
                    <span className="pane-print-inline"> (taken as answered, with no document)</span>
                  </span>
                )}
                {meta && (
                  <span>
                    Assessment v{meta.version} · rules v{meta.rules_version}
                    {meta.generated_at && <> · generated {formatGeneratedAt(meta.generated_at)}</>}
                  </span>
                )}
              </footer>
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
