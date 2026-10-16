import { useEffect, useRef, useState } from "react";

/** The longest answer in words the server accepts (models.TEXT_ANSWER_MAX). */
const MAX_LENGTH = 2000;
/** How long typing pauses before what is typed is saved. */
const SAVE_AFTER_MS = 800;

/**
 * The answer to a text question. Saved once typing pauses, and on leaving the box, so nothing
 * typed is lost; only a change is sent.
 */
export default function TextAnswer({
  value,
  labelledBy,
  onSave,
}: {
  value: string;
  labelledBy: string;
  onSave: (answer: string) => void;
}) {
  const [text, setText] = useState(value);
  // What the server is taken to have, so the same words are not sent twice.
  const [sent, setSent] = useState(value);
  // The words this box itself last sent (null until it sends any).
  const [mine, setMine] = useState<string | null>(null);

  // The saved answer changed underneath the box:
  // - to what the box shows (its own save going through): nothing to do;
  // - away from what this box sent (the save was refused and the form reloaded): the words typed
  //   stay in the box, and go again on the next pause or on leaving it;
  // - while the box still shows the answer it started from (it changed elsewhere): it follows.
  const [saved, setSaved] = useState(value);
  if (value !== saved) {
    setSaved(value);
    const typed = text.trim();
    if (typed !== value.trim()) {
      if (mine !== null && typed === mine) {
        setSent(value);
      } else if (typed === saved.trim()) {
        setText(value);
        setSent(value);
      }
    }
  }

  // For the timer and the save on leaving, which run outside render.
  const latest = useRef({ text, sent, onSave });
  useEffect(() => {
    latest.current = { text, sent, onSave };
  });

  const save = () => {
    const trimmed = latest.current.text.trim();
    if (trimmed === latest.current.sent.trim()) return;
    // Noted at once, so a second trigger before the next render does not send it again.
    latest.current = { ...latest.current, sent: trimmed };
    setSent(trimmed);
    setMine(trimmed);
    latest.current.onSave(trimmed);
  };

  useEffect(() => {
    const timer = window.setTimeout(save, SAVE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  // Leaving the page with something typed and not yet sent still saves it.
  useEffect(() => () => save(), []);

  return (
    <div className="text-answer">
      <textarea
        className="input textarea"
        rows={3}
        maxLength={MAX_LENGTH}
        value={text}
        aria-labelledby={labelledBy}
        aria-required="true"
        placeholder="Type your answer"
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
      />
      <span className="text-answer-count" aria-hidden="true">
        {text.length} / {MAX_LENGTH}
      </span>
    </div>
  );
}
