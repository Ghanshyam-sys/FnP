import type { Answer } from "../domain/types";

/** Yes / No / N/A as a small coloured tag. "N/A" maps to the `answer-na` style. */
export default function AnswerTag({ answer }: { answer: Answer }) {
  return (
    <span className={`answer-tag answer-${answer.toLowerCase().replace("/", "")}`}>{answer}</span>
  );
}
