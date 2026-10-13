import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuestionnaire, useSaveQuestionnaire } from "../api/queries";
import { ApiError } from "../api/client";
import type { QuestionSettings } from "../api/queries";
import type { QuestionnaireVersion } from "../api/types";
import { displaySection } from "../domain/sectionLabels";
import { routes } from "../routes";
import { Loading, LoadError } from "../components/LoadState";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  InfoIcon,
  SlidersIcon,
} from "../components/icons";
import type { Answer } from "../domain/types";

const ANSWERS: Answer[] = ["Yes", "No", "N/A"];

function settingsOf(version: QuestionnaireVersion): QuestionSettings {
  return Object.fromEntries(
    version.questions.map((q) => [
      q.qid,
      { allowedAnswers: q.allowedAnswers, fileTypes: q.fileTypes, maxFiles: q.maxFiles, weight: q.weight },
    ])
  );
}

/** The weight inputs as typed, so a half-typed "4." is not snapped back while editing. */
function weightTextOf(version: QuestionnaireVersion): Record<string, string> {
  return Object.fromEntries(version.questions.map((q) => [q.qid, String(q.weight)]));
}

/** A weight as typed: a number from 0 with at most two decimals, or null. */
function parseWeight(text: string): number | null {
  const trimmed = text.trim();
  return /^\d{1,3}(\.\d{1,2})?$/.test(trimmed) ? Number(trimmed) : null;
}

// Weights are compared in hundredths, so 0.1 + 0.2 adds up to exactly 0.3.
const hundredths = (n: number) => Math.round(n * 100);
const fromHundredths = (h: number) => String(h / 100);

interface SectionCheck {
  /** The section's questions' weights as typed, added up; null while one is not a number. */
  total: number | null;
  ok: boolean;
  message: string;
}

function checkSection(sectionWeight: number, weights: (number | null)[]): SectionCheck {
  if (weights.some((w) => w === null)) {
    return { total: null, ok: false, message: "Enter each weight as a number from 0, with at most two decimals." };
  }
  const total = weights.reduce<number>((sum, w) => sum + hundredths(w ?? 0), 0);
  const target = hundredths(sectionWeight);
  if (total === target) return { total: total / 100, ok: true, message: "Matches the section weight" };
  const diff = fromHundredths(Math.abs(total - target));
  return { total: total / 100, ok: false, message: total > target ? `${diff} over the section weight` : `${diff} short of the section weight` };
}

/** The sections' messages from a refused save, or the general one. */
function saveErrorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return "Another reviewer changed the settings in the meantime. Their settings are shown now; make your changes again.";
  }
  if (error instanceof ApiError && error.status === 400) {
    const sections = error.body.sections;
    if (sections && typeof sections === "object") {
      return Object.entries(sections as Record<string, string>)
        .map(([name, message]) => `${displaySection(name)}: ${message}`)
        .join(" ");
    }
    return "Some settings are not valid. Check the weights and try again.";
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

function QuestionConfigEditor({
  current,
  published,
  configurableFileTypes,
  save,
}: {
  current: QuestionnaireVersion;
  published: QuestionnaireVersion;
  configurableFileTypes: string[];
  save: ReturnType<typeof useSaveQuestionnaire>;
}) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<QuestionSettings>(() => settingsOf(current));
  const [weightText, setWeightText] = useState<Record<string, string>>(() => weightTextOf(current));

  const questions = current.questions;
  const weightOf = (qid: string) => parseWeight(weightText[qid] ?? "");
  const checks = new Map(
    current.sections.map((s) => [
      s.name,
      checkSection(s.weight, questions.filter((q) => q.section === s.name).map((q) => weightOf(q.qid))),
    ])
  );
  const weightsOk = [...checks.values()].every((c) => c.ok);
  // Section weights are fixed, so once every section adds up the total is theirs.
  const total = fromHundredths(current.sections.reduce((sum, s) => sum + hundredths(s.weight), 0));

  const setWeight = (qid: string, text: string) => {
    setWeightText((prev) => ({ ...prev, [qid]: text }));
    save.reset();
  };

  const apply = () => {
    if (!weightsOk) return;
    const questionsToSave = Object.fromEntries(
      Object.entries(config).map(([qid, c]) => [qid, { ...c, weight: weightOf(qid) ?? c.weight }])
    );
    save.mutate({ version: current.version, questions: questionsToSave });
  };

  const update = (qid: string, change: Partial<QuestionSettings[string]>) => {
    setConfig((prev) => ({ ...prev, [qid]: { ...prev[qid], ...change } }));
    save.reset();
  };

  const toggleAnswer = (qid: string, answer: Answer) => {
    const selected = config[qid].allowedAnswers;
    const next = selected.includes(answer)
      ? selected.filter((a) => a !== answer)
      : ANSWERS.filter((a) => selected.includes(a) || a === answer);
    // A question with no answer options could not be filled in at all.
    if (next.length === 0) return;
    update(qid, { allowedAnswers: next });
  };

  const toggleFileType = (qid: string, type: string) => {
    const selected = config[qid].fileTypes;
    const next = selected.includes(type)
      ? selected.filter((t) => t !== type)
      : configurableFileTypes.filter((t) => selected.includes(t) || t === type);
    if (next.length === 0) return;
    update(qid, { fileTypes: next });
  };

  const restore = () => {
    const defaults = settingsOf(published);
    setConfig(defaults);
    setWeightText(weightTextOf(published));
    save.mutate({ version: current.version, questions: defaults });
  };

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head-text">
          <h1>Question configuration</h1>
          <p className="page-sub">
            Weight, answer options and attachment rules for each of the {questions.length}{" "}
            questions. Changes reach applicants who have not submitted yet — an assessment already
            submitted keeps the configuration it was scored against.
          </p>
        </div>
        <div className="page-head-aside">
          <span className="chip chip-low">Total weight {total}</span>
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
          Weight drives the risk score. Each section's weight is fixed: you can change how it is
          shared between the section's questions, as long as their weights add up to it. The
          weights go to the AI engine with each submission. Answer options and attachment rules
          drive the data collection form: a question set to a single file shows one picker, two
          allows a supporting document alongside the primary.
        </div>
      </div>

      {current.sections.map((section) => {
        const items = questions.filter((q) => q.section === section.name);
        const check = checks.get(section.name)!;
        const checkId = `wcheck-${section.name.replace(/[^a-z0-9]+/gi, "-")}`;
        return (
          <section className="card section" key={section.name}>
            <div className="section-head section-head-static">
              <span className="section-title">{displaySection(section.name)}</span>
              <span
                id={checkId}
                className={`section-count weight-check ${check.ok ? "is-ok" : "is-off"}`}
                role={check.ok ? undefined : "status"}
              >
                {check.ok ? <CheckCircleIcon size={13} /> : <AlertTriangleIcon size={13} />}
                <span>
                  {check.total ?? "—"} of {section.weight} section weight
                  {check.ok ? "" : ` · ${check.message}`}
                </span>
              </span>
            </div>
            <div className="section-body">
              {items.map((q) => {
                const c = config[q.qid];
                return (
                  <article className="qconfig" key={q.qid}>
                    <div className="qconfig-prompt">
                      <span className="qid">{q.qid}</span>
                      <p className="qtext">{q.text}</p>
                    </div>

                    <div className="qconfig-grid">
                      <div className="qconfig-field">
                        <label className="field-label" htmlFor={`w-${q.qid}`}>
                          Weight
                        </label>
                        <input
                          id={`w-${q.qid}`}
                          className="input input-num"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={section.weight}
                          step="any"
                          value={weightText[q.qid] ?? ""}
                          aria-invalid={weightOf(q.qid) === null || !check.ok}
                          aria-describedby={checkId}
                          onChange={(e) => setWeight(q.qid, e.target.value)}
                        />
                      </div>

                      <div className="qconfig-field">
                        <span className="field-label">Answer options</span>
                        <div className="chipset">
                          {ANSWERS.map((a) => (
                            <button
                              key={a}
                              type="button"
                              className={`toggle-chip${c.allowedAnswers.includes(a) ? " is-on" : ""}`}
                              aria-pressed={c.allowedAnswers.includes(a)}
                              onClick={() => toggleAnswer(q.qid, a)}
                            >
                              {a}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="qconfig-field">
                        <span className="field-label">Accepted file types</span>
                        <div className="chipset">
                          {configurableFileTypes.map((t) => (
                            <button
                              key={t}
                              type="button"
                              className={`toggle-chip${c.fileTypes.includes(t) ? " is-on" : ""}`}
                              aria-pressed={c.fileTypes.includes(t)}
                              onClick={() => toggleFileType(q.qid, t)}
                            >
                              {t.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="qconfig-field">
                        <label className="field-label" htmlFor={`f-${q.qid}`}>
                          Files allowed
                        </label>
                        <select
                          id={`f-${q.qid}`}
                          className="input"
                          value={c.maxFiles}
                          onChange={(e) => update(q.qid, { maxFiles: Number(e.target.value) })}
                        >
                          <option value={1}>1 — primary only</option>
                          <option value={2}>2 — primary and supporting</option>
                        </select>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      {!weightsOk && (
        <div className="notice notice-warning" role="status">
          <AlertTriangleIcon size={17} />
          <div>
            <strong>The weights do not add up yet.</strong> In{" "}
            {current.sections
              .filter((s) => !checks.get(s.name)!.ok)
              .map((s) => displaySection(s.name))
              .join(", ")}
            , make the question weights add up to the section weight before applying.
          </div>
        </div>
      )}

      <footer className="actionbar">
        <button className="btn btn-ghost" onClick={() => navigate(routes.reviewer())}>
          <ArrowLeftIcon size={15} />
          Back to the queue
        </button>
        <button className="btn btn-ghost" disabled={save.isPending} onClick={restore}>
          Restore published model
        </button>
        <button
          className="btn btn-primary"
          disabled={save.isPending || !weightsOk}
          title={weightsOk ? undefined : "Each section's question weights must add up to its section weight"}
          onClick={apply}
        >
          <SlidersIcon size={15} />
          {save.isPending ? "Applying…" : "Apply configuration"}
        </button>
      </footer>
    </div>
  );
}
