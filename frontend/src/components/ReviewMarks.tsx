import { CheckCircleIcon, AlertTriangleIcon, ArrowLeftIcon } from "./icons";
import { latestReviewLabel, reviewLine, type ReviewKind } from "../domain/reviewLabels";
import type { ReviewEntry } from "../api/types";

const ICON: Record<ReviewKind, typeof CheckCircleIcon> = {
  accepted: CheckCircleIcon,
  overridden: AlertTriangleIcon,
  rejected: ArrowLeftIcon,
};

/**
 * What the reviewer last did with a question, as a small label after its outcome ("Accepted by
 * reviewer", "Overridden by reviewer" ...). Earlier rulings are in the opened row.
 */
export function ReviewChips({ entries }: { entries?: ReviewEntry[] }) {
  const label = latestReviewLabel(entries);
  if (!label) return null;
  const Icon = ICON[label.kind];
  return (
    <span className="review-chips">
      <span className={`chip chip-${label.tone} chip-review is-${label.kind}`} title={label.title}>
        <Icon size={11} />
        {label.text}
      </span>
    </span>
  );
}

/** The reviewer's latest ruling on a question, with its comment, shown when its row is opened. */
export function ReviewNotes({ entries }: { entries?: ReviewEntry[] }) {
  const latest = entries?.[entries.length - 1];
  if (!latest) return null;
  return (
    <div className="review-notes">
      <p className="review-notes-title">Reviewer</p>
      <ul>
        <li>
          <span className="review-notes-line">{reviewLine(latest)}</span>
          {latest.comment && <span className="review-notes-comment">“{latest.comment}”</span>}
        </li>
      </ul>
    </div>
  );
}
