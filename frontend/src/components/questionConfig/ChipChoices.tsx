import { useState } from "react";

/** How many choices show before "+ N more". */
export const CHIPS_SHOWN = 6;

/**
 * A long list of choices as chips to turn on and off, the first few shown and the rest behind
 * "+ N more". A chosen one is always shown, wherever it is in the list, so nothing chosen is ever
 * hidden.
 */
export default function ChipChoices({
  label,
  items,
  isOn,
  onToggle,
}: {
  /** What the chips are, for screen readers. */
  label: string;
  items: { key: string; label: string }[];
  isOn: (key: string) => boolean;
  onToggle: (key: string) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.filter((item, i) => i < CHIPS_SHOWN || isOn(item.key));
  const hidden = items.length - shown.length;
  return (
    <div className="chipset" role="group" aria-label={label}>
      {shown.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`toggle-chip${isOn(item.key) ? " is-on" : ""}`}
          aria-pressed={isOn(item.key)}
          onClick={() => onToggle(item.key)}
        >
          {item.label}
        </button>
      ))}
      {hidden > 0 && (
        <button type="button" className="toggle-chip is-more" aria-expanded={false} onClick={() => setAll(true)}>
          + {hidden} more
        </button>
      )}
      {all && items.length > CHIPS_SHOWN && (
        <button type="button" className="toggle-chip is-more" aria-expanded onClick={() => setAll(false)}>
          Show fewer
        </button>
      )}
    </div>
  );
}
