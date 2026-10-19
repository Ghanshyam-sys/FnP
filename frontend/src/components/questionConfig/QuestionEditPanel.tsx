import { useState } from "react";
import Modal from "../Modal";
import { ANSWERS, TOTAL, hundredths, questionProblem, settingsOf, show, weightsOf } from "../../domain/questionWeights";
import type { EditQuestion, EditSection, QuestionSettingsDraft } from "../../domain/questionWeights";
import type { AnswerType, EvidenceRule } from "../../api/types";
import { displaySection } from "../../domain/sectionLabels";
import { CUSTOM_NAME_MAX, customCode, customName } from "../../domain/catalogue";
import { XIcon } from "../icons";

const toggle = <T,>(list: T[], item: T, order: T[]) =>
  list.includes(item) ? list.filter((x) => x !== item) : order.filter((x) => list.includes(x) || x === item);

/** What a polarity means for the score, in a line. */
function polarityMeaning(polarity: EditQuestion["polarity"], answerType: AnswerType): string {
  if (answerType === "text") return "The AI engine judges the risk from what is written.";
  return polarity === "Positive"
    ? "Yes is the expected answer: a No counts as a risk. N/A is left out of the score."
    : "No is the expected answer: a Yes counts as a risk. N/A is left out of the score.";
}

/**
 * One question's settings, in steps: the question, how it is answered, what counts as a risk, the
 * evidence it takes, and its weight. Changes stay in the panel until Done; Cancel leaves the
 * question as it was. Nothing is published until the configuration is applied.
 */
export default function QuestionEditPanel({
  question,
  section,
  isNew,
  configurableFileTypes,
  evidenceOptionChoices,
  onDone,
  onCancel,
}: {
  question: EditQuestion;
  section: EditSection;
  /** Added just now and never confirmed: cancelling takes it away again. */
  isNew: boolean;
  configurableFileTypes: string[];
  evidenceOptionChoices: { code: string; label: string }[];
  onDone: (settings: QuestionSettingsDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<QuestionSettingsDraft>(() => settingsOf(question));
  const [initial] = useState(() => JSON.stringify(draft));
  const changed = JSON.stringify(draft) !== initial;
  // Cancel with changes made asks first, as Escape and a click outside will not throw them away.
  const [discarding, setDiscarding] = useState(false);
  const cancel = () => (changed ? setDiscarding(true) : onCancel());
  const set = (change: Partial<QuestionSettingsDraft>) => setDraft((d) => ({ ...d, ...change }));

  // A document name typed in, added beside the engine's document types.
  const [docName, setDocName] = useState("");
  const [docNameNote, setDocNameNote] = useState<string | null>(null);
  const engineCodes = evidenceOptionChoices.map((c) => c.code);
  const named = draft.evidenceOptions.filter((c) => customName(c) !== null);
  const addDocName = () => {
    const name = docName.split(/\s+/).filter(Boolean).join(" ");
    if (!name) return;
    const sameAsEngine = evidenceOptionChoices.find((o) => o.label.toLowerCase() === name.toLowerCase());
    if (sameAsEngine) {
      // Already one of the engine's: that one is chosen instead.
      if (!draft.evidenceOptions.includes(sameAsEngine.code)) toggleEngine(sameAsEngine.code);
      setDocNameNote(`"${sameAsEngine.label}" is one of the AI engine's document types, so it is chosen from the list.`);
    } else if (named.some((c) => customName(c)?.toLowerCase() === name.toLowerCase())) {
      setDocNameNote(`"${name}" is already added.`);
    } else {
      set({ evidenceOptions: [...draft.evidenceOptions, customCode(name)] });
      setDocNameNote(null);
    }
    setDocName("");
  };
  // The engine's document types in their list order, then the names typed in, in the order added.
  function toggleEngine(code: string) {
    const engine = toggle(draft.evidenceOptions.filter((c) => engineCodes.includes(c)), code, engineCodes);
    set({ evidenceOptions: [...engine, ...named] });
  }

  const takesDocs = draft.evidenceRequired !== "never";
  const asEdited: EditQuestion = { ...question, ...draft };
  const problem = questionProblem(asEdited);
  // Its weight as the section now stands, with this question's settings as in the panel.
  const sectionNow: EditSection = { ...section, questions: section.questions.map((q) => (q.key === question.key ? asEdited : q)) };
  const index = sectionNow.questions.findIndex((q) => q.key === question.key);
  const weights = weightsOf(sectionNow);
  const weight = weights ? weights[index] : null;
  const others = sectionNow.questions
    .filter((q) => q.key !== question.key)
    .reduce((sum, q) => sum + (hundredths(q.pct) ?? 0), 0);
  const titleId = `qpanel-${question.key}`;
  const code = question.qid ?? "New question";

  return (
    <Modal labelledBy={titleId} panel dismissible={!changed} onClose={onCancel}>
      <div className="qpanel-head">
        <span className="qid">{code}</span>
        <h2 id={titleId}>{isNew ? "New question" : "Edit question"}</h2>
        <span className="qpanel-section">{displaySection(section.name) || "New section"}</span>
      </div>

      <fieldset className="qpanel-step">
        <legend>Question</legend>
        <textarea
          className="input textarea qpanel-text"
          rows={3}
          value={draft.text}
          maxLength={2000}
          placeholder="Type the question"
          aria-label="Question text"
          aria-invalid={!draft.text.trim() || undefined}
          autoFocus
          onChange={(e) => set({ text: e.target.value })}
        />
      </fieldset>

      <fieldset className="qpanel-step">
        <legend>How it is answered</legend>
        <div className="segmented segmented-sm" role="radiogroup" aria-label="Answer type">
          {(
            [
              ["choice", "Yes / No"],
              ["text", "Text"],
            ] as const
          ).map(([type, label]) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={draft.answerType === type}
              className={`segment${draft.answerType === type ? " is-selected" : ""}`}
              onClick={() =>
                set({
                  answerType: type,
                  allowedAnswers: type === "choice" && draft.allowedAnswers.length === 0 ? ["Yes", "No"] : draft.allowedAnswers,
                  // Words are not Yes or No: a document is then always or never asked for.
                  evidenceRequired: type === "text" && draft.evidenceRequired === "if_yes" ? "never" : draft.evidenceRequired,
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
        {draft.answerType === "choice" ? (
          <div className="qpanel-row">
            <span className="field-label">Answers offered</span>
            <div className="chipset">
              {ANSWERS.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`toggle-chip${draft.allowedAnswers.includes(a) ? " is-on" : ""}`}
                  aria-pressed={draft.allowedAnswers.includes(a)}
                  onClick={() => {
                    const next = toggle(draft.allowedAnswers, a, ANSWERS);
                    // A question with no answer options could not be filled in at all.
                    if (next.length > 0) set({ allowedAnswers: next });
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="qpanel-hint">The applicant answers in words, up to 2,000 characters.</p>
        )}
        {question.baseAnswerType !== null && draft.answerType !== question.baseAnswerType && (
          <p className="qconfig-note is-changed">Answers already saved for it on applications not yet submitted are cleared.</p>
        )}
      </fieldset>

      <fieldset className="qpanel-step">
        <legend>What counts as a risk</legend>
        <label className="field-label" htmlFor={`${titleId}-pol`}>
          Polarity
        </label>
        <select
          id={`${titleId}-pol`}
          className="input"
          value={draft.polarity}
          onChange={(e) => set({ polarity: e.target.value as EditQuestion["polarity"] })}
        >
          <option value="Positive">Positive</option>
          <option value="Negative">Negative</option>
        </select>
        <p className="qpanel-hint">{polarityMeaning(draft.polarity, draft.answerType)}</p>
        {question.basePolarity !== null && draft.polarity !== question.basePolarity && (
          <p className="qconfig-note is-changed">Changes which answer counts as a risk.</p>
        )}
      </fieldset>

      <fieldset className="qpanel-step">
        <legend>Evidence</legend>
        <label className="field-label" htmlFor={`${titleId}-doc`}>
          Document
        </label>
        <select
          id={`${titleId}-doc`}
          className="input"
          value={draft.evidenceRequired}
          onChange={(e) => {
            const evidenceRequired = e.target.value as EvidenceRule;
            // Asked for a document again: it takes PDF unless other formats are chosen.
            set({ evidenceRequired, fileTypes: evidenceRequired !== "never" && draft.fileTypes.length === 0 ? ["pdf"] : draft.fileTypes });
          }}
        >
          <option value="always">Always required</option>
          {draft.answerType === "choice" && <option value="if_yes">Required if Yes</option>}
          <option value="never">Not required</option>
        </select>
        {takesDocs && (
          <>
            <div className="qpanel-row">
              <span className="field-label">Accepted file types</span>
              <div className="chipset">
                {configurableFileTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`toggle-chip${draft.fileTypes.includes(t) ? " is-on" : ""}`}
                    aria-pressed={draft.fileTypes.includes(t)}
                    onClick={() => {
                      const next = toggle(draft.fileTypes, t, configurableFileTypes);
                      if (next.length > 0) set({ fileTypes: next });
                    }}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <label className="field-label" htmlFor={`${titleId}-files`}>
              Files allowed
            </label>
            <select
              id={`${titleId}-files`}
              className="input"
              value={draft.maxFiles}
              onChange={(e) => set({ maxFiles: Number(e.target.value) as 1 | 2 })}
            >
              <option value={1}>1 — primary only</option>
              <option value={2}>2 — primary and supporting</option>
            </select>
            {question.ownOptions && (
              <div className="qpanel-row">
                <span className="field-label">Document types this question takes</span>
                {evidenceOptionChoices.length === 0 ? (
                  <p className="qpanel-hint">
                    The AI engine's document types could not be loaded. Reload the page to try again, or add
                    document names of your own below.
                  </p>
                ) : (
                  <div className="chipset">
                    {evidenceOptionChoices.map((o) => (
                      <button
                        key={o.code}
                        type="button"
                        className={`toggle-chip${draft.evidenceOptions.includes(o.code) ? " is-on" : ""}`}
                        aria-pressed={draft.evidenceOptions.includes(o.code)}
                        onClick={() => toggleEngine(o.code)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
                {named.length > 0 && (
                  <div className="chipset" role="group" aria-label="Document names added">
                    {named.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="toggle-chip is-on is-custom"
                        aria-label={`Remove ${customName(c)}`}
                        title="Remove"
                        onClick={() => set({ evidenceOptions: draft.evidenceOptions.filter((x) => x !== c) })}
                      >
                        {customName(c)}
                        <XIcon size={11} />
                      </button>
                    ))}
                  </div>
                )}
                <label className="field-label" htmlFor={`${titleId}-docname`}>
                  Add a document name
                </label>
                <div className="qpanel-custom">
                  <input
                    id={`${titleId}-docname`}
                    className="input"
                    value={docName}
                    maxLength={CUSTOM_NAME_MAX}
                    placeholder="For example, Professional licence"
                    aria-describedby={`${titleId}-docname-hint`}
                    onChange={(e) => {
                      setDocName(e.target.value);
                      setDocNameNote(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addDocName();
                      }
                    }}
                  />
                  <button type="button" className="btn btn-ghost btn-sm" disabled={!docName.trim()} onClick={addDocName}>
                    Add
                  </button>
                </div>
                <p className="qpanel-hint" id={`${titleId}-docname-hint`} role="status">
                  {docNameNote ??
                    "When none in the list fits, name the document: the applicant picks it like the others, and the AI engine reads it as a document of another kind."}
                </p>
              </div>
            )}
          </>
        )}
      </fieldset>

      <fieldset className="qpanel-step">
        <legend>Weight</legend>
        <label className="field-label" htmlFor={`${titleId}-pct`}>
          Share of the section
        </label>
        <div className="input-suffix qpanel-pct">
          <input
            id={`${titleId}-pct`}
            className="input input-num"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="any"
            value={draft.pct}
            aria-invalid={hundredths(draft.pct) === null || undefined}
            onChange={(e) => set({ pct: e.target.value })}
          />
          <span aria-hidden="true">%</span>
        </div>
        <p className="qpanel-hint">
          {displaySection(section.name) || "This section"} {section.weight || "0"} × {draft.pct || "0"}% ={" "}
          <strong>{weight === null ? "—" : show(weight)}</strong> of 100 overall. The other questions in this section
          have {show(others)}%
          {others > TOTAL
            ? ` — already ${show(others - TOTAL)}% over 100% before this one; lower theirs to make room.`
            : others + (hundredths(draft.pct) ?? 0) === TOTAL
              ? "."
              : ` — this one needs ${show(TOTAL - others)}% to make 100%.`}
        </p>
      </fieldset>

      {problem && (
        <p className="field-error" role="status">
          {problem}
        </p>
      )}

      <div className="panel-foot">
        {discarding ? (
          <>
            <span className="panel-foot-ask" role="alert">
              Discard your changes to this question?
            </span>
            <button type="button" className="btn btn-ghost" autoFocus onClick={() => setDiscarding(false)}>
              Keep editing
            </button>
            <button type="button" className="btn btn-primary" onClick={onCancel}>
              Discard changes
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" onClick={cancel}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => onDone(draft)}>
              Done
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
