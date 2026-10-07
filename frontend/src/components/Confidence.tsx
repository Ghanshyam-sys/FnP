import type { ReactNode } from "react";
import { percent } from "../utils/format";
import type { CheckResult } from "../domain/types";

/** A 0–1 confidence as a small bar with the percentage beside it. */
export function ConfidenceBar({ value }: { value: number }) {
  return (
    <span className="check-confidence">
      <span className="confidence-track">
        <span className="confidence-fill" style={{ width: `${value * 100}%` }} />
      </span>
      {percent(value)}
    </span>
  );
}

/** One named check with its outcome, confidence and the engine's note. */
export function CheckItem({
  check,
  tone,
  icon,
}: {
  check: CheckResult;
  tone: string;
  icon: ReactNode;
}) {
  return (
    <li className={`check check-${tone}`}>
      <span className="check-icon">{icon}</span>
      <div className="check-body">
        <div className="check-head">
          <span className="check-label">{check.label}</span>
          <ConfidenceBar value={check.confidence} />
        </div>
        <p className="check-note">{check.note}</p>
      </div>
    </li>
  );
}
