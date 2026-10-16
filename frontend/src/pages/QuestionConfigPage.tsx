import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuestionnaire, useSaveQuestionnaire } from "../api/queries";
import { ApiError } from "../api/client";
import type { SectionEdit } from "../api/queries";
import type { AnswerType, CatalogueQuestion, EvidenceRule, QuestionnaireVersion } from "../api/types";
import { displaySection } from "../domain/sectionLabels";
import { queueUrl } from "../state/queueReturn";
import { Loading, LoadError } from "../components/LoadState";
import Modal from "../components/Modal";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  InfoIcon,
  PlusIcon,
  SlidersIcon,
  XIcon,
} from "../components/icons";
import type { Answer } from "../domain/types";

const ANSWERS: Answer[] = ["Yes", "No", "N/A"];
// Weights are kept in hundredths, so 0.1 + 0.2 adds up to exactly 0.3; percentages likewise.
const TOTAL = 10000; // 100.00, the section weights' total, and each section's percentages' total.

/** A question as the editor holds it. */
interface EditQuestion {
  key: string;
  /** Its code; null for a question added in this edit (the server gives it one). */
  qid: string | null;
  text: string;
  polarity: "Positive" | "Negative";
  answerType: AnswerType;
  /** Its share of the section's weight, as typed. */
  pct: string;
  allowedAnswers: Answer[];
  fileTypes: string[];
  maxFiles: 1 | 2;
  evidenceRequired: EvidenceRule;
  evidenceOptions: string[];
  /** Whether the reviewer chooses its document types (one added here); otherwise the engine's apply. */
  ownOptions: boolean;
  /** As published (null for one added now): its weight is kept exactly while nothing it depends on changes. */
  baseWeight: number | null;
  basePct: string;
  /** As published (null for one added now), to say what changing them does. */
  basePolarity: EditQuestion["polarity"] | null;
  baseAnswerType: AnswerType | null;
}

interface EditSection {
  key: string;
  /** The name as shown and edited (the display name of a published section). */
  name: string;
  /** As published: the stored name, sent back unless it is renamed. */
  baseName: string | null;
  weight: string;
  baseWeight: number | null;
  baseCount: number;
  questions: EditQuestion[];
}

let nextKey = 1;
const newKey = () => `k${nextKey++}`;

/** A number from 0 to 100 with at most two decimals, in hundredths; null otherwise. */
function hundredths(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Math.round(Number(trimmed) * 100);
  return value <= TOTAL ? value : null;
}

const show = (h: number) => String(h / 100);

function fromVersion(version: QuestionnaireVersion): EditSection[] {
  return version.sections.map((s) => {
    const questions = version.questions.filter((q) => q.section === s.name);
    return {
      key: newKey(),
      name: displaySection(s.name),
      baseName: s.name,
      weight: String(s.weight),
      baseWeight: s.weight,
      baseCount: questions.length,
      questions: withWholePercentages(questions.map((q) => fromQuestion(q, s.weight))),
    };
  });
}

/**
 * Percentages rounded one by one need not add up to 100 (6, 6 and 6 of 18 read 33.33 each, 99.99
 * in all): the last question takes what is left, so a published section always reads 100%.
 */
function withWholePercentages(questions: EditQuestion[]): EditQuestion[] {
  if (questions.length === 0) return questions;
  const others = questions.slice(0, -1).reduce((sum, q) => sum + (hundredths(q.pct) ?? 0), 0);
  const rest = TOTAL - others;
  if (rest < 0) return questions;
  const last = { ...questions[questions.length - 1], pct: show(rest), basePct: show(rest) };
  return [...questions.slice(0, -1), last];
}

function fromQuestion(q: CatalogueQuestion, sectionWeight: number): EditQuestion {
  const pct = sectionWeight > 0 ? String(Math.round((q.weight / sectionWeight) * 10000) / 100) : "0";
  return {
    key: newKey(),
    qid: q.qid,
    text: q.text,
    polarity: q.polarity,
    answerType: q.answerType ?? "choice",
    pct,
    allowedAnswers: q.allowedAnswers,
    fileTypes: q.fileTypes,
    maxFiles: q.maxFiles,
    evidenceRequired: q.evidenceRequired,
    evidenceOptions: q.evidenceOptions ?? [],
    // A question added here names its document types (the engine has no list of its own for it).
    ownOptions: q.addedHere ?? false,
    baseWeight: q.weight,
    basePct: pct,
    basePolarity: q.polarity,
    baseAnswerType: q.answerType ?? "choice",
  };
}

function blankQuestion(pct = "0"): EditQuestion {
  return {
    key: newKey(),
    qid: null,
    text: "",
    polarity: "Positive",
    answerType: "choice",
    pct,
    allowedAnswers: ["Yes", "No"],
    fileTypes: ["pdf"],
    maxFiles: 1,
    evidenceRequired: "if_yes",
    evidenceOptions: [],
    ownOptions: true,
    baseWeight: null,
    basePct: pct,
    basePolarity: null,
    baseAnswerType: null,
  };
}

/**
 * Each question's weight, in hundredths, from the section's weight and the percentages: the last
 * question takes what is left, so they add up to the section's weight exactly. While nothing they
 * depend on has changed, the published weights stand as they are. Null while a number is not valid.
 */
function weightsOf(section: EditSection): number[] | null {
  const sw = hundredths(section.weight);
  const pcts = section.questions.map((q) => hundredths(q.pct));
  if (sw === null || pcts.some((p) => p === null)) return null;
  const untouched =
    section.baseWeight !== null &&
    sw === Math.round(section.baseWeight * 100) &&
    section.questions.length === section.baseCount &&
    section.questions.every((q) => q.baseWeight !== null && q.pct === q.basePct);
  if (untouched) return section.questions.map((q) => Math.round((q.baseWeight ?? 0) * 100));
  if (pctTotal(section) !== TOTAL) return pcts.map((p) => Math.round((sw * (p ?? 0)) / TOTAL));
  // Shared out exactly (largest remainder): each gets its share rounded down, and the hundredths
  // left go to those with the biggest fractions, so they add up to the section weight and none is
  // ever below 0.
  const exact = pcts.map((p) => (sw * (p ?? 0)) / TOTAL);
  const weights = exact.map(Math.floor);
  let left = sw - weights.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    weights[i] += 1;
    left -= 1;
  }
  return weights;
}

function pctTotal(section: EditSection): number | null {
  const pcts = section.questions.map((q) => hundredths(q.pct));
  return pcts.some((p) => p === null) ? null : pcts.reduce<number>((a, b) => a + (b ?? 0), 0);
}

/** What is wrong with a question's settings, if anything. */
function questionProblem(q: EditQuestion): string | null {
  if (!q.text.trim()) return "Enter the question.";
  if (hundredths(q.pct) === null) return "Enter a percentage from 0 to 100, with at most two decimals.";
  if (q.answerType === "choice" && q.allowedAnswers.length === 0) return "Choose at least one answer option.";
  if (q.evidenceRequired !== "never" && q.fileTypes.length === 0) return "Choose at least one accepted file type.";
  if (q.ownOptions && q.evidenceRequired !== "never" && q.evidenceOptions.length === 0) {
    return "Choose the document types this question takes.";
  }
  return null;
}

/** The questionnaire in the shape the server takes it. */
function toBody(sections: EditSection[]): SectionEdit[] {
  return sections.map((s) => {
    const weights = weightsOf(s) ?? s.questions.map(() => 0);
    const takesDocs = (q: EditQuestion) => q.evidenceRequired !== "never";
    return {
      name: s.baseName !== null && s.name.trim() === displaySection(s.baseName) ? s.baseName : s.name.trim(),
      weight: (hundredths(s.weight) ?? 0) / 100,
      questions: s.questions.map((q, i) => ({
        qid: q.qid,
        text: q.text.trim(),
        polarity: q.polarity,
        answerType: q.answerType,
        weight: weights[i] / 100,
        allowedAnswers: q.answerType === "text" ? [] : ANSWERS.filter((a) => q.allowedAnswers.includes(a)),
        fileTypes: takesDocs(q) ? q.fileTypes : [],
        maxFiles: takesDocs(q) ? q.maxFiles : 1,
        evidenceRequired: q.evidenceRequired,
        evidenceOptions: q.ownOptions && takesDocs(q) ? q.evidenceOptions : [],
      })),
    };
  });
}

/** The messages from a refused save, or the general one. */
function saveErrorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return "Another reviewer changed the settings in the meantime. Their settings are shown now; make your changes again.";
  }
  if (error instanceof ApiError && error.status === 503) {
    return "The AI engine's document types could not be read. Try again shortly.";
  }
  if (error instanceof ApiError && error.status === 400) {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(error.body)) {
      if (key === "sections" && value && typeof value === "object" && !Array.isArray(value)) {
        for (const [name, message] of Object.entries(value as Record<string, string>)) {
          parts.push(`${displaySection(name)}: ${message}`);
        }
      } else if (key === "detail") {
        parts.push(String(value));
      } else if (key.startsWith("questions.")) {
        parts.push(`${key.slice("questions.".length)}: ${String(value)}`);
      }
    }
    return parts.length > 0 ? parts.join(" ") : "Some settings are not valid. Check them and try again.";
  }
  return "Check your connection and try again.";
}

export default function QuestionConfigPage() {
  const questionnaire = useQuestionnaire();
  // Held here so the outcome of a save outlives the editor's remount onto the new version.
  const save = useSaveQuestionnaire();
  if (questionnaire.isPending) return <Loading />;
  if (questionnaire.isError && !questionnaire.data) return <LoadError error={questionnaire.error} onRetry={questionnaire.refetch} />;
  // Keyed on the version so a newly published one starts the editor from its own settings.
  return <QuestionConfigEditor key={questionnaire.data.current.version} {...questionnaire.data} save={save} />;
}

type Confirm =
  | { kind: "leave" }
  | { kind: "restore" }
  | { kind: "deleteSection"; sectionKey: string }
  | { kind: "deleteQuestion"; sectionKey: string; questionKey: string };

function QuestionConfigEditor({
  current,
  published,
  configurableFileTypes,
  evidenceOptionChoices = [],
  save,
}: {
  current: QuestionnaireVersion;
  published: QuestionnaireVersion;
  configurableFileTypes: string[];
  evidenceOptionChoices?: { code: string; label: string }[];
  save: ReturnType<typeof useSaveQuestionnaire>;
}) {
  const navigate = useNavigate();
  const [sections, setSections] = useState<EditSection[]>(() => fromVersion(current));
  // The questionnaire as published, in the shape it is sent, to tell whether anything changed.
  const [saved] = useState(() => JSON.stringify(toBody(fromVersion(current))));
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  // Shown once a section was added: every section weight went back to 0 to be shared out again.
  const [reweighing, setReweighing] = useState(false);
  // The section weights as they were before a section was added, to put back if every section
  // added is cancelled again.
  const [beforeAdd, setBeforeAdd] = useState<Record<string, string> | null>(null);
  // The field a section or question just added starts in (its name, or its question text).
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const body = toBody(sections);
  const dirty = JSON.stringify(body) !== saved;
  // Closing or reloading the tab with changes not applied asks the browser to confirm.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // The section weights first: until they add up to 100, the questions are locked.
  const sectionWeights = sections.map((s) => hundredths(s.weight));
  const sectionsValid = sectionWeights.every((w) => w !== null);
  const sectionTotal = sectionWeights.reduce<number>((a, b) => a + (b ?? 0), 0);
  const names = sections.map((s) => s.name.trim().toLowerCase());
  const nameProblem = (s: EditSection, i: number) =>
    !s.name.trim() ? "Name the section." : names.indexOf(names[i]) !== i ? "Another section has this name." : null;
  const sectionsOk = sectionsValid && sectionTotal === TOTAL && sections.every((s, i) => !nameProblem(s, i));
  const frozen = !(sectionsValid && sectionTotal === TOTAL);
  const sectionOff = (s: EditSection) => pctTotal(s) !== TOTAL || s.questions.some((q) => questionProblem(q));
  const allOk = sectionsOk && sections.every((s) => !sectionOff(s));

  const updateSection = (key: string, change: Partial<EditSection>) => {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...change } : s)));
    save.reset();
  };
  const updateQuestion = (sectionKey: string, questionKey: string, change: Partial<EditQuestion>) => {
    setSections((prev) =>
      prev.map((s) =>
        s.key === sectionKey
          ? { ...s, questions: s.questions.map((q) => (q.key === questionKey ? { ...q, ...change } : q)) }
          : s
      )
    );
    save.reset();
  };
  const toggle = <T,>(list: T[], item: T, order: T[]) =>
    list.includes(item) ? list.filter((x) => x !== item) : order.filter((x) => list.includes(x) || x === item);

  const addSection = () => {
    // Every section weight goes back to 0, to be shared out again with the new section in; what
    // they were is kept, in case the new section is cancelled.
    setBeforeAdd((kept) => kept ?? Object.fromEntries(sections.map((s) => [s.key, s.weight])));
    const key = newKey();
    setSections((prev) => [
      ...prev.map((s) => ({ ...s, weight: "0" })),
      {
        key,
        name: `New section ${prev.length + 1}`,
        baseName: null,
        weight: "0",
        baseWeight: null,
        baseCount: 0,
        questions: [blankQuestion("100")],
      },
    ]);
    setFocusKey(`section:${key}`);
    setReweighing(true);
    save.reset();
  };
  const addQuestion = (sectionKey: string) => {
    const question = blankQuestion();
    setSections((prev) =>
      prev.map((s) => (s.key === sectionKey ? { ...s, questions: [...s.questions, question] } : s))
    );
    setFocusKey(question.key);
    save.reset();
  };
  /**
   * Removes a section. Once every section added in this edit is gone again, the section weights
   * that were set to 0 for it go back to what they were (any changed since stay as changed).
   */
  const removeSection = (sectionKey: string) => {
    const rest = sections.filter((s) => s.key !== sectionKey);
    if (beforeAdd && !rest.some((s) => s.baseName === null)) {
      setSections(rest.map((s) => (s.weight === "0" && beforeAdd[s.key] !== undefined ? { ...s, weight: beforeAdd[s.key] } : s)));
      setBeforeAdd(null);
      setReweighing(false);
    } else {
      setSections(rest);
    }
    save.reset();
  };
  const removeQuestion = (sectionKey: string, questionKey: string) => {
    setSections((prev) =>
      prev.map((s) => (s.key === sectionKey ? { ...s, questions: s.questions.filter((q) => q.key !== questionKey) } : s))
    );
    save.reset();
  };
  const doDelete = () => {
    if (confirm?.kind === "deleteSection") removeSection(confirm.sectionKey);
    else if (confirm?.kind === "deleteQuestion") removeQuestion(confirm.sectionKey, confirm.questionKey);
    setConfirm(null);
  };

  const apply = () => {
    if (!allOk) return;
    save.mutate({ version: current.version, sections: body });
  };
  const restore = () => {
    setConfirm(null);
    const restored = fromVersion(published);
    setSections(restored);
    setReweighing(false);
    setBeforeAdd(null);
    save.mutate({ version: current.version, sections: toBody(restored) });
  };
  const leave = () => (dirty ? setConfirm({ kind: "leave" }) : navigate(queueUrl()));

  const questionCount = sections.reduce((n, s) => n + s.questions.length, 0);
  const confirmTarget =
    confirm?.kind === "deleteSection"
      ? sections.find((s) => s.key === confirm.sectionKey)
      : confirm?.kind === "deleteQuestion"
        ? sections.find((s) => s.key === confirm.sectionKey)?.questions.find((q) => q.key === confirm.questionKey)
        : undefined;

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head-text">
          <h1>Question configuration</h1>
          <p className="page-sub">
            Sections, their weights, and the weight, answer options and attachment rules of each of
            the {questionCount} questions. Changes reach applicants who have not submitted yet — an
            assessment already submitted keeps the configuration it was scored against.
          </p>
        </div>
        <div className="page-head-aside">
          <span className={`chip ${sectionTotal === TOTAL && sectionsValid ? "chip-low" : "chip-critical"}`}>
            Total weight {sectionsValid ? show(sectionTotal) : "—"} of 100
          </span>
        </div>
      </header>

      {save.isSuccess && (
        <div className="notice notice-good">
          <CheckCircleIcon size={17} />
          <div>
            <strong>Configuration applied.</strong> It takes effect for every assessment that has
            not been submitted yet.
          </div>
        </div>
      )}

      {save.isError && (
        <div className="notice notice-critical" role="alert">
          <AlertTriangleIcon size={17} />
          <div>
            <strong>The configuration was not applied.</strong> {saveErrorText(save.error)}
          </div>
        </div>
      )}

      <div className="notice notice-info">
        <InfoIcon size={17} />
        <div>
          Weight drives the risk score. The section weights add up to 100. Within a section, give
          each question a percentage of the section's weight — its weight follows from that, and the
          percentages add up to 100%. The weights go to the AI engine with each submission. Answer
          options and attachment rules drive the data collection form: a question set to a single
          file shows one picker, two allows a supporting document alongside the primary.
        </div>
      </div>

      {frozen && (
        <div className="notice notice-warning" role="status">
          <AlertTriangleIcon size={17} />
          <div>
            <strong>
              {reweighing ? "A section was added, so every section weight is back to 0." : "The section weights do not add up to 100."}
            </strong>{" "}
            They add up to {sectionsValid ? show(sectionTotal) : "—"}; share 100 between the sections.
            The questions are locked until the section weights add up to 100.
          </div>
        </div>
      )}

      {sections.map((section, si) => {
        const weights = weightsOf(section);
        const pctSum = pctTotal(section);
        const off = !frozen && sectionOff(section);
        const sectionWeightInvalid = hundredths(section.weight) === null;
        const nameError = nameProblem(section, si);
        const checkId = `pcheck-${section.key}`;
        return (
          <section
            className={`card section qsection${frozen ? " is-frozen" : ""}${off || nameError ? " is-off" : ""}`}
            key={section.key}
            aria-label={section.name || "Section"}
          >
            <div className="qsection-head">
              <div className="qconfig-field qsection-name">
                <label className="field-label" htmlFor={`sname-${section.key}`}>
                  Section
                </label>
                <input
                  id={`sname-${section.key}`}
                  className="input"
                  value={section.name}
                  maxLength={120}
                  autoFocus={focusKey === `section:${section.key}`}
                  aria-invalid={nameError ? true : undefined}
                  onChange={(e) => updateSection(section.key, { name: e.target.value })}
                />
                {nameError && <span className="field-error">{nameError}</span>}
              </div>
              <div className="qconfig-field qsection-weight">
                <label className="field-label" htmlFor={`sweight-${section.key}`}>
                  Section weight
                </label>
                <input
                  id={`sweight-${section.key}`}
                  className="input input-num"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="any"
                  value={section.weight}
                  aria-invalid={sectionWeightInvalid || frozen || undefined}
                  onChange={(e) => {
                    updateSection(section.key, { weight: e.target.value });
                  }}
                />
              </div>
              <span
                id={checkId}
                // While the questions are locked their check waits, neither passed nor failed.
                className={`section-count weight-check${frozen ? "" : pctSum === TOTAL ? " is-ok" : " is-off"}`}
              >
                {!frozen && (pctSum === TOTAL ? <CheckCircleIcon size={13} /> : <AlertTriangleIcon size={13} />)}
                <span>
                  Questions {pctSum === null ? "—" : show(pctSum)}% of 100%
                </span>
              </span>
              {section.baseName === null ? (
                // Added in this edit: cancelling it takes it away again (asked first only if
                // something was typed in it).
                <button
                  type="button"
                  className="btn btn-ghost btn-sm qsection-delete"
                  onClick={() =>
                    section.questions.some((q) => q.text.trim())
                      ? setConfirm({ kind: "deleteSection", sectionKey: section.key })
                      : removeSection(section.key)
                  }
                >
                  <XIcon size={13} />
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm qsection-delete"
                  disabled={sections.length === 1}
                  title={sections.length === 1 ? "The questionnaire needs at least one section" : undefined}
                  onClick={() => setConfirm({ kind: "deleteSection", sectionKey: section.key })}
                >
                  <XIcon size={13} />
                  Delete section
                </button>
              )}
            </div>

            <fieldset className="qsection-body" disabled={frozen}>
              <legend className="sr-only">Questions in {section.name}</legend>
              {section.questions.map((q, qi) => {
                const problem = questionProblem(q);
                const pctInvalid = hundredths(q.pct) === null || (!frozen && pctSum !== TOTAL);
                const takesDocs = q.evidenceRequired !== "never";
                const isNew = q.qid === null;
                return (
                  <article className={`qconfig${!frozen && problem ? " is-off" : ""}`} key={q.key}>
                    <div className="qconfig-prompt">
                      <span className="qid">{q.qid ?? "New"}</span>
                      <textarea
                        className="input qconfig-text"
                        rows={1}
                        value={q.text}
                        aria-label={`Question ${q.qid ?? "text"}`}
                        placeholder="Type the question"
                        maxLength={2000}
                        autoFocus={focusKey === q.key}
                        aria-invalid={!q.text.trim() || undefined}
                        onChange={(e) => updateQuestion(section.key, q.key, { text: e.target.value })}
                      />
                      <button
                        type="button"
                        className="icon-button qconfig-delete"
                        aria-label={`Delete question ${q.qid ?? ""}`.trim()}
                        title={
                          section.questions.length === 1
                            ? "A section needs at least one question; delete the section instead"
                            : "Delete question"
                        }
                        disabled={section.questions.length === 1}
                        onClick={() =>
                          // A question just added and still blank goes at once; others are asked about first.
                          isNew && !q.text.trim()
                            ? removeQuestion(section.key, q.key)
                            : setConfirm({ kind: "deleteQuestion", sectionKey: section.key, questionKey: q.key })
                        }
                      >
                        <XIcon size={14} />
                      </button>
                    </div>

                    <div className="qconfig-grid qconfig-grid-edit">
                      <div className="qconfig-field">
                        <label className="field-label" htmlFor={`p-${q.key}`}>
                          Percentage
                        </label>
                        <div className="input-suffix">
                          <input
                            id={`p-${q.key}`}
                            className="input input-num"
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={100}
                            step="any"
                            value={q.pct}
                            aria-invalid={pctInvalid || undefined}
                            aria-describedby={checkId}
                            onChange={(e) => updateQuestion(section.key, q.key, { pct: e.target.value })}
                          />
                          <span aria-hidden="true">%</span>
                        </div>
                      </div>

                      <div className="qconfig-field">
                        <label className="field-label" htmlFor={`w-${q.key}`}>
                          Weight
                        </label>
                        <input
                          id={`w-${q.key}`}
                          className="input input-num"
                          value={weights ? show(weights[qi]) : "—"}
                          readOnly
                          tabIndex={-1}
                          title="Section weight × percentage"
                        />
                      </div>

                      <div className="qconfig-field">
                        <label className="field-label" htmlFor={`pol-${q.key}`}>
                          Polarity
                        </label>
                        <select
                          id={`pol-${q.key}`}
                          className="input"
                          value={q.polarity}
                          title="Decides which answer counts as a risk"
                          onChange={(e) =>
                            updateQuestion(section.key, q.key, { polarity: e.target.value as EditQuestion["polarity"] })
                          }
                        >
                          <option value="Positive">Positive</option>
                          <option value="Negative">Negative</option>
                        </select>
                        {q.basePolarity !== null && q.polarity !== q.basePolarity && (
                          <span className="qconfig-note is-changed">Changes which answer counts as a risk.</span>
                        )}
                      </div>

                      <div className="qconfig-field">
                        <span className="field-label" id={`at-${q.key}`}>
                          Answer type
                        </span>
                        <div className="segmented segmented-sm" role="radiogroup" aria-labelledby={`at-${q.key}`}>
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
                              aria-checked={q.answerType === type}
                              className={`segment${q.answerType === type ? " is-selected" : ""}`}
                              onClick={() =>
                                updateQuestion(section.key, q.key, {
                                  answerType: type,
                                  allowedAnswers:
                                    type === "choice" && q.allowedAnswers.length === 0 ? ["Yes", "No"] : q.allowedAnswers,
                                  // Words are not Yes or No: a document is then always or never asked for.
                                  evidenceRequired:
                                    type === "text" && q.evidenceRequired === "if_yes" ? "never" : q.evidenceRequired,
                                })
                              }
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {q.baseAnswerType !== null && q.answerType !== q.baseAnswerType && (
                          <span className="qconfig-note is-changed">
                            Answers already saved for it on applications not yet submitted are cleared.
                          </span>
                        )}
                        {q.answerType === "text" ? (
                          <span className="qconfig-note">Answered in words</span>
                        ) : (
                          <div className="chipset">
                            {ANSWERS.map((a) => (
                              <button
                                key={a}
                                type="button"
                                className={`toggle-chip${q.allowedAnswers.includes(a) ? " is-on" : ""}`}
                                aria-pressed={q.allowedAnswers.includes(a)}
                                onClick={() => {
                                  const next = toggle(q.allowedAnswers, a, ANSWERS);
                                  // A question with no answer options could not be filled in at all.
                                  if (next.length > 0) updateQuestion(section.key, q.key, { allowedAnswers: next });
                                }}
                              >
                                {a}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="qconfig-field">
                        <label className="field-label" htmlFor={`e-${q.key}`}>
                          Document
                        </label>
                        <select
                          id={`e-${q.key}`}
                          className="input"
                          value={q.evidenceRequired}
                          onChange={(e) => {
                            const evidenceRequired = e.target.value as EvidenceRule;
                            updateQuestion(section.key, q.key, {
                              evidenceRequired,
                              // Asked for a document again: it takes PDF unless other formats are chosen.
                              fileTypes: evidenceRequired !== "never" && q.fileTypes.length === 0 ? ["pdf"] : q.fileTypes,
                            });
                          }}
                        >
                          <option value="always">Always required</option>
                          {q.answerType === "choice" && <option value="if_yes">Required if Yes</option>}
                          <option value="never">Not required</option>
                        </select>
                      </div>

                      {takesDocs && (
                        <div className="qconfig-field">
                          <span className="field-label">Accepted file types</span>
                          <div className="chipset">
                            {configurableFileTypes.map((t) => (
                              <button
                                key={t}
                                type="button"
                                className={`toggle-chip${q.fileTypes.includes(t) ? " is-on" : ""}`}
                                aria-pressed={q.fileTypes.includes(t)}
                                onClick={() => {
                                  const next = toggle(q.fileTypes, t, configurableFileTypes);
                                  if (next.length > 0) updateQuestion(section.key, q.key, { fileTypes: next });
                                }}
                              >
                                {t.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {takesDocs && (
                        <div className="qconfig-field">
                          <label className="field-label" htmlFor={`f-${q.key}`}>
                            Files allowed
                          </label>
                          <select
                            id={`f-${q.key}`}
                            className="input"
                            value={q.maxFiles}
                            onChange={(e) =>
                              updateQuestion(section.key, q.key, { maxFiles: Number(e.target.value) as 1 | 2 })
                            }
                          >
                            <option value={1}>1 — primary only</option>
                            <option value={2}>2 — primary and supporting</option>
                          </select>
                        </div>
                      )}
                    </div>

                    {q.ownOptions && takesDocs && (
                      <div className="qconfig-field qconfig-doctypes">
                        <span className="field-label">Document types this question takes</span>
                        {evidenceOptionChoices.length === 0 ? (
                          <span className="qconfig-note">
                            The AI engine's document types could not be loaded. Reload the page to try again.
                          </span>
                        ) : (
                          <div className="chipset">
                            {evidenceOptionChoices.map((o) => (
                              <button
                                key={o.code}
                                type="button"
                                className={`toggle-chip${q.evidenceOptions.includes(o.code) ? " is-on" : ""}`}
                                aria-pressed={q.evidenceOptions.includes(o.code)}
                                onClick={() =>
                                  updateQuestion(section.key, q.key, {
                                    evidenceOptions: toggle(
                                      q.evidenceOptions,
                                      o.code,
                                      evidenceOptionChoices.map((c) => c.code)
                                    ),
                                  })
                                }
                              >
                                {o.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {!frozen && problem && <p className="field-error qconfig-problem">{problem}</p>}
                  </article>
                );
              })}
              <div className="qsection-foot">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => addQuestion(section.key)}>
                  <PlusIcon size={14} />
                  Add question
                </button>
              </div>
            </fieldset>
          </section>
        );
      })}

      <div className="qconfig-add-section">
        <button type="button" className="btn btn-ghost" onClick={addSection}>
          <PlusIcon size={15} />
          Add section
        </button>
      </div>

      {!frozen && !allOk && (
        <div className="notice notice-warning" role="status">
          <AlertTriangleIcon size={17} />
          <div>
            <strong>Some settings need attention before applying.</strong> In{" "}
            {sections
              .filter((s, i) => sectionOff(s) || nameProblem(s, i))
              .map((s) => s.name || "an unnamed section")
              .join(", ")}
            , make the percentages add up to 100% and complete the highlighted questions.
          </div>
        </div>
      )}

      <footer className="actionbar">
        <button className="btn btn-ghost" onClick={leave}>
          <ArrowLeftIcon size={15} />
          Back to the queue
        </button>
        <button className="btn btn-ghost" disabled={save.isPending} onClick={() => setConfirm({ kind: "restore" })}>
          Restore published model
        </button>
        <button
          className="btn btn-primary"
          disabled={save.isPending || !allOk}
          title={allOk ? undefined : "Section weights must add up to 100, and each section's percentages to 100%"}
          onClick={apply}
        >
          <SlidersIcon size={15} />
          {save.isPending ? "Applying…" : "Apply configuration"}
        </button>
      </footer>

      {confirm?.kind === "leave" && (
        <Modal labelledBy="leave-title" onClose={() => setConfirm(null)}>
          <span className="modal-icon">
            <AlertTriangleIcon size={20} />
          </span>
          <h2 id="leave-title">Leave without applying?</h2>
          <p className="modal-sub">
            Your changes to the question configuration have not been applied, and will be lost.
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
              Keep editing
            </button>
            <button className="btn btn-primary" onClick={() => navigate(queueUrl())}>
              Leave without applying
            </button>
          </div>
        </Modal>
      )}

      {confirm?.kind === "restore" && (
        <Modal labelledBy="restore-title" onClose={() => setConfirm(null)}>
          <span className="modal-icon">
            <AlertTriangleIcon size={20} />
          </span>
          <h2 id="restore-title">Restore the published model?</h2>
          <p className="modal-sub">
            Every section and question goes back to the published model — its weights, answer
            options and attachment rules — and this is applied at once for every assessment not
            submitted yet. Sections and questions added since are removed.
            {dirty ? " Your changes not yet applied are discarded." : ""}
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={restore}>
              Restore and apply
            </button>
          </div>
        </Modal>
      )}

      {(confirm?.kind === "deleteSection" || confirm?.kind === "deleteQuestion") && confirmTarget && (
        <Modal labelledBy="delete-title" onClose={() => setConfirm(null)}>
          <span className="modal-icon">
            <AlertTriangleIcon size={20} />
          </span>
          <h2 id="delete-title">
            {confirm.kind === "deleteSection"
              ? `Delete the section "${(confirmTarget as EditSection).name || "New section"}"?`
              : `Delete question ${(confirmTarget as EditQuestion).qid ?? "(new)"}?`}
          </h2>
          <p className="modal-sub">
            {confirm.kind === "deleteSection"
              ? "The section and its questions are removed from the questionnaire once you apply. Share its weight between the other sections so they add up to 100."
              : "The question is removed from the questionnaire once you apply. Share its percentage between the section's other questions so they add up to 100%."}{" "}
            Assessments already submitted keep it.
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={doDelete}>
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
