import { useState } from "react";
import { CHECK_MAX, checkLabel, checkName } from "../../domain/checks";
import { XIcon } from "../icons";
import ChipChoices from "./ChipChoices";

/**
 * The checks the AI engine runs on a question's documents, chosen like its document types: the
 * checks in use (on any question) as chips to turn on and off, and checks of the admin's own typed
 * in, shown beside them to remove again. Saved in the engine's form ("Licence_Validity_Check").
 */
export default function ChecksStep({
  idPrefix,
  checks,
  choices,
  onChange,
}: {
  idPrefix: string;
  /** The checks chosen, in order. */
  checks: string[];
  /** Every check in use, with its name in words. */
  choices: { name: string; label: string }[];
  onChange: (checks: string[]) => void;
}) {
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const known = choices.map((c) => c.name);
  // Checks of its own not (yet) among those in use: shown beside them, to remove again.
  const own = checks.filter((c) => !known.includes(c));
  const toggle = (name: string) =>
    onChange(checks.includes(name) ? checks.filter((c) => c !== name) : [...checks, name]);

  const add = () => {
    const name = checkName(typed);
    setTyped("");
    if (!name) return;
    const same = (c: string) => c.toLowerCase() === name.toLowerCase();
    const existing = known.find(same);
    if (existing) {
      // One already in use: that one is chosen instead.
      if (!checks.includes(existing)) onChange([...checks, existing]);
      setNote(`"${checkLabel(existing)}" is already a check, so it is chosen from the list.`);
    } else if (checks.some(same)) {
      setNote(`"${checkLabel(name)}" is already added.`);
    } else if (name.length > CHECK_MAX) {
      setNote(`A check's name can be at most ${CHECK_MAX} characters.`);
    } else {
      onChange([...checks, name]);
      setNote(null);
    }
  };

  return (
    <fieldset className="qpanel-step">
      <legend>Checks</legend>
      <p className="qpanel-hint">What the AI engine checks in this question's documents.</p>
      {choices.length > 0 && (
        <ChipChoices
          label="Checks"
          items={choices.map((c) => ({ key: c.name, label: c.label }))}
          isOn={(name) => checks.includes(name)}
          onToggle={toggle}
        />
      )}
      {own.length > 0 && (
        <div className="chipset" role="group" aria-label="Checks added">
          {own.map((c) => (
            <button
              key={c}
              type="button"
              className="toggle-chip is-on is-custom"
              aria-label={`Remove ${checkLabel(c)}`}
              title="Remove"
              onClick={() => toggle(c)}
            >
              {checkLabel(c)}
              <XIcon size={11} />
            </button>
          ))}
        </div>
      )}
      <label className="field-label" htmlFor={`${idPrefix}-check`}>
        Add a check
      </label>
      <div className="qpanel-custom">
        <input
          id={`${idPrefix}-check`}
          className="input"
          value={typed}
          maxLength={CHECK_MAX}
          placeholder="For example, Licence validity"
          aria-describedby={`${idPrefix}-check-hint`}
          onChange={(e) => {
            setTyped(e.target.value);
            setNote(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn btn-ghost btn-sm" disabled={!typed.trim()} onClick={add}>
          Add
        </button>
      </div>
      <p className="qpanel-hint" id={`${idPrefix}-check-hint`} role="status">
        {note ?? "When none in the list fits, describe the check: the AI engine runs it on this question's documents."}
      </p>
      {checks.length === 0 && (
        <p className="qconfig-note is-changed">No check is chosen: the AI engine checks nothing specific in these documents.</p>
      )}
    </fieldset>
  );
}
