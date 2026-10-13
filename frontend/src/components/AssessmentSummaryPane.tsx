import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  DownloadIcon,
  ExternalLinkIcon,
  InfoIcon,
  ShieldCheckIcon,
  XIcon,
} from "./icons";
import { displaySection } from "../domain/sectionLabels";
import type { Assessment, Case, FinalAssessment } from "../api/types";

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
function QuestionIds({ list }: { list: string }) {
  const ids = list
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) return <dd className="pane-qsplit-none">None</dd>;
  if (ids.some((id) => /\s/.test(id))) return <dd>{list}</dd>;
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
function PrintHeader({ assignment, decision }: { assignment: Assessment; decision: Case["decision"] }) {
  return (
    <header className="pane-print-head">
      <div className="pane-print-brand">
        <span className="pane-print-mark">
          <ShieldCheckIcon size={14} />
        </span>
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
        <div>
          <dt>Reviewer decision</dt>
          <dd>
            {decision
              ? `${decision.verdict === "accepted" ? "Accepted" : "Rejected"} · ${formatDay(decision.at)}`
              : "Not yet decided"}
          </dd>
        </div>
      </dl>
      {decision?.remarks && (
        <p className="pane-print-remarks">
          <span>Reviewer remarks</span>
          {decision.remarks}
        </p>
      )}
    </header>
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
        There is no narrative assessment for {applicantName}. The engine writes one only when it
        scores a submission itself, so there is none when the score was calculated after the
        reviewer accepted flagged answers, or when the engine could not produce one.
      </p>
    </div>
  );
}

export default function AssessmentSummaryPane({
  assessment,
  assignment,
  decision,
  onClose,
}: {
  assessment: FinalAssessment | null;
  /** The case the summary belongs to: printed at the top of the PDF. */
  assignment: Assessment;
  decision: Case["decision"];
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
          <PrintHeader assignment={assignment} decision={decision} />
          {!assessment || !determination ? (
            <Empty applicantName={applicantName} />
          ) : (
            <>
              <section className="pane-section pane-section-verdict">
                <div className="pane-verdict">
                  <span className={`chip chip-${VERDICT_TONE[determination.verdict] ?? "neutral"}`}>
                    {determination.verdict}
                  </span>
                  <span className="pane-verdict-reco">{determination.recommendation}</span>
                </div>
                <dl className="pane-stats">
                  <div>
                    <dt>Risk score</dt>
                    <dd>{determination.risk_score}</dd>
                  </div>
                  <div>
                    <dt>Band</dt>
                    <dd>{determination.risk_band}</dd>
                  </div>
                  <div>
                    <dt>Weighted risk</dt>
                    <dd>{determination.weighted_risk}</dd>
                  </div>
                  <div>
                    <dt>Knock-out</dt>
                    <dd>{determination.knock_out_triggered ? "Triggered" : "None"}</dd>
                  </div>
                </dl>
              </section>

              <section className="pane-section">
                <h3>Executive summary</h3>
                <p className="pane-prose">{assessment.executive_summary}</p>
              </section>

              <section className="pane-section">
                <h3>
                  Concerns and proposed conditions
                  <span className="pane-count">{assessment.concerns.length}</span>
                </h3>
                {assessment.concerns.map((c) => (
                  <article className="pane-concern" key={c.condition_id}>
                    <div className="pane-concern-head">
                      <span className="qid">{c.qid}</span>
                      <span className="chip chip-warning">{c.severity}</span>
                      <span className="pane-concern-type">{c.risk_type}</span>
                      <span className="pane-concern-section">{displaySection(c.section)}</span>
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
                ))}
              </section>

              <section className="pane-section">
                <h3>
                  Strengths<span className="pane-count">{assessment.strengths.length}</span>
                </h3>
                <ul className="pane-list">
                  {assessment.strengths.map((s) => (
                    <li key={s.qid}>
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
                <ul className="pane-list pane-list-questions">
                  {assessment.for_supervisor.map((q) => (
                    <li key={q}>
                      <AlertTriangleIcon size={14} />
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="pane-section">
                <h3>Question outcomes</h3>
                <dl className="pane-qsplit">
                  <div>
                    <dt>Passed</dt>
                    <QuestionIds list={assessment.questions.passed} />
                  </div>
                  <div>
                    <dt>Conditional</dt>
                    <QuestionIds list={assessment.questions.conditional} />
                  </div>
                  <div>
                    <dt>Not applicable</dt>
                    <QuestionIds list={assessment.questions.not_applicable} />
                  </div>
                </dl>
              </section>

              <footer className="pane-meta">
                <span>
                  {assessment.evidence.documents_read} documents read ·{" "}
                  {assessment.evidence.questions_verified} questions verified ·{" "}
                  {assessment.evidence.questions_self_declared} self-declared
                </span>
                <span>
                  Assessment v{assessment.assessment.version} · rules v
                  {assessment.assessment.rules_version} · generated{" "}
                  {formatGeneratedAt(assessment.assessment.generated_at)}
                </span>
                <span className="pane-digest">Inputs digest {assessment.assessment.inputs_digest}</span>
              </footer>
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
