import { useId, useState } from "react";
import { ChevronDownIcon } from "../icons";
import { TOTAL, show } from "../../domain/questionWeights";

export interface WeightPart {
  key: string;
  label: string;
  /** Its share of 100, in hundredths. */
  value: number;
  onSelect?: () => void;
}

/** How many tones the parts cycle through, so neighbouring parts always differ. */
const TONES = 4;

/**
 * How 100 is shared out, as one bar: a part for each share, a grey gap for what is left to assign,
 * and red when more than 100 is given out. Each part says its share on hover and to screen readers.
 *
 * With `legend`, the parts are numbered in order and listed in full underneath (number, name and
 * share), so every name can be read however small its part is; a part wide enough also shows its
 * share inside it.
 */
export default function WeightBar({
  parts,
  unit,
  legend = false,
  legendName = "section",
  label,
}: {
  parts: WeightPart[];
  unit: string;
  /** Number the parts and list them in full under the bar (the questionnaire's sections), behind
   * a "Show … details" toggle. */
  legend?: boolean;
  /** What the listed parts are, for the toggle ("Show section details"). */
  legendName?: string;
  /** What the bar shows, for screen readers. */
  label: string;
}) {
  // The list under the bar starts closed, so the panel stays compact; the toggle opens it.
  const [open, setOpen] = useState(false);
  const listId = useId();
  const given = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0);
  const scale = Math.max(TOTAL, given);
  const left = TOTAL - given;
  const over = left < 0;
  const tone = (i: number) => `tone-${i % TONES}`;

  const bar = (
    <div
      className={`weight-bar${legend ? " has-legend" : ""}${over ? " is-over" : ""}`}
      role="group"
      aria-label={label}
    >
      {parts.map((part, i) => {
        const share = Math.max(0, part.value) / scale;
        const text = `${legend ? `${i + 1}. ` : ""}${part.label}: ${show(part.value)}${unit}`;
        // Numbered in order; the share too where the part is wide enough to hold it.
        const content = legend && share > 0 ? (
          <span className="weight-bar-label">
            {share >= 0.025 ? i + 1 : ""}
            {share >= 0.1 ? <span className="weight-bar-value"> · {show(part.value)}</span> : null}
          </span>
        ) : null;
        const props = {
          className: `weight-bar-part ${tone(i)}`,
          style: { flexBasis: `${share * 100}%` },
          title: text,
        };
        return part.onSelect ? (
          <button key={part.key} type="button" {...props} aria-label={text} onClick={part.onSelect}>
            {content}
          </button>
        ) : (
          <span key={part.key} {...props}>
            <span className="sr-only">{text}</span>
            {content}
          </span>
        );
      })}
      {left > 0 && (
        <span className="weight-bar-gap" style={{ flexBasis: `${(left / scale) * 100}%` }} title={`${show(left)}${unit} left to assign`}>
          <span className="sr-only">{`${show(left)}${unit} left to assign`}</span>
        </span>
      )}
    </div>
  );

  if (!legend) return bar;
  return (
    <div className="weight-bar-wrap">
      {bar}
      <button
        type="button"
        className={`weight-legend-toggle${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDownIcon size={15} />
        {open ? `Hide ${legendName} details` : `Show ${legendName} details`}
      </button>
      <ol id={listId} hidden={!open} className={`weight-legend${over ? " is-over" : ""}`} aria-label={`${label}, in detail`}>
        {parts.map((part, i) => {
          const inner = (
            <>
              <span className={`weight-legend-swatch ${tone(i)}`} aria-hidden="true">
                {i + 1}
              </span>
              <span className="weight-legend-name">{part.label}</span>
              <span className="weight-legend-value">
                {show(part.value)}
                {unit}
              </span>
            </>
          );
          return (
            <li key={part.key}>
              {part.onSelect ? (
                <button type="button" className="weight-legend-item" onClick={part.onSelect} title={`Go to ${part.label}`}>
                  {inner}
                </button>
              ) : (
                <span className="weight-legend-item">{inner}</span>
              )}
            </li>
          );
        })}
        {left > 0 && (
          <li>
            <span className="weight-legend-item is-gap">
              <span className="weight-legend-swatch is-gap" aria-hidden="true" />
              <span className="weight-legend-name">Left to assign</span>
              <span className="weight-legend-value">
                {show(left)}
                {unit}
              </span>
            </span>
          </li>
        )}
      </ol>
    </div>
  );
}
