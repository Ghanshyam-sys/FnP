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
      { allowedAnswers: q.allowedAnswers, fileTypes: q.fileTypes, maxFiles: q.maxFiles },
    ])
  );
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

  const questions = current.questions;
  const total = questions.reduce((sum, q) => sum + q.weight, 0);

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
            <strong>The configuration was not applied.</strong>{" "}
            {save.error instanceof ApiError && save.error.status === 409
              ? "Another reviewer changed the settings in the meantime. Their settings are shown now; make your changes again."
              : "Check your connection and try again."}
          </div>
        </div>
      )}

      <div className="notice notice-info">
        <InfoIcon size={17} />
        <div>
          Weight drives the risk score and is set by the scoring model. Answer options and
          attachment rules drive the data collection form: a question set to a single file shows
          one picker, two allows a supporting document alongside the primary.
        </div>
      </div>

      {current.sections.map((section) => {
        const items = questions.filter((q) => q.section === section.name);
        const sectionTotal = items.reduce((sum, q) => sum + q.weight, 0);
        return (
          <section className="card section" key={section.name}>
            <div className="section-head section-head-static">
              <span className="section-title">{displaySection(section.name)}</span>
              <span className="section-count">
                {sectionTotal} of {section.weight} section weight
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
                          value={q.weight}
                          readOnly
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

      <footer className="actionbar">
        <button className="btn btn-ghost" onClick={() => navigate(routes.reviewer())}>
          <ArrowLeftIcon size={15} />
          Back to the queue
        </button>
        <button className="btn btn-ghost" disabled={save.isPending} onClick={restore}>
          Restore published model
        </button>
        <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({ version: current.version, questions: config })}>
          <SlidersIcon size={15} />
          {save.isPending ? "Applying…" : "Apply configuration"}
        </button>
      </footer>
    </div>
  );
}
