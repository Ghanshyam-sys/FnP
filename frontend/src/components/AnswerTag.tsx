const CHOICES = ["Yes", "No", "N/A"];

/**
 * Yes / No / N/A as a small coloured tag. "N/A" maps to the `answer-na` style. An answer given in
 * words (a text question) is shown as the words themselves.
 */
export default function AnswerTag({ answer }: { answer: string }) {
  if (!CHOICES.includes(answer)) {
    return <span className="answer-text">{answer.trim() || "Not answered"}</span>;
  }
  return (
    <span className={`answer-tag answer-${answer.toLowerCase().replace("/", "")}`}>{answer}</span>
  );
}
