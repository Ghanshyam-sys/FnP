import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  DownloadIcon,
  InfoIcon,
  ShieldCheckIcon,
  XIcon,
} from "./icons";
import ConcernCard from "./ConcernCard";
import { concernKey } from "../domain/concerns";
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
  // Parts the engine may leave out, so a missing one shows as empty rather than breaking the pane.
  const concerns = assessment?.concerns ?? [];
  const strengths = assessment?.strengths ?? [];
  const forSupervisor = assessment?.for_supervisor ?? [];
  const outcomes = assessment?.questions ?? {};
  const evidence = assessment?.evidence;
  const meta = assessment?.assessment;
  const override = determination?.authentication_override;
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

              <section className="pane-section">
                <h3>
                  Concerns and proposed conditions
                  <span className="pane-count">{concerns.length}</span>
                </h3>
                {concerns.map((c, i) => (
                  <ConcernCard concern={c} key={concernKey(c, i)} />
                ))}
              </section>

              <section className="pane-section">
                <h3>
                  Strengths<span className="pane-count">{strengths.length}</span>
                </h3>
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
                <dl className="pane-qsplit">
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
              </section>

              <footer className="pane-meta">
                {evidence && (
                  <span>
                    {evidence.documents_read ?? 0} documents read · {evidence.questions_verified ?? 0} questions
                    verified · {evidence.questions_self_declared ?? 0} self-declared
                  </span>
                )}
                {meta && (
                  <span>
                    Assessment v{meta.version} · rules v{meta.rules_version}
                    {meta.generated_at && <> · generated {formatGeneratedAt(meta.generated_at)}</>}
                  </span>
                )}
                {meta?.inputs_digest && <span className="pane-digest">Inputs digest {meta.inputs_digest}</span>}
              </footer>
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
