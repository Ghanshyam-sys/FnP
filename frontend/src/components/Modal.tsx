import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** What Tab moves between inside a dialog. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The dialogs open, oldest first: only the one on top answers Escape and Tab. */
const openDialogs: symbol[] = [];

/**
 * Overlay plus dialog box. Clicking the overlay or pressing Escape cancels, unless the dialog holds
 * something typed that would be lost (dismissible=false): then only its own Cancel does. Clicks
 * inside the box do not. While it is open, Tab stays inside it and the page behind does not
 * scroll; focus goes into it on opening (to a field that asks for it, or its first control) and
 * back to what had it on closing. Portalled by default so a dialog opened from deep in a page still
 * covers the whole viewport.
 */
export default function Modal({
  labelledBy,
  wide = false,
  portal = true,
  dismissible = true,
  onClose,
  children,
}: {
  labelledBy: string;
  wide?: boolean;
  portal?: boolean;
  dismissible?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  // What had focus when the dialog opened, read before a field in it can take focus itself.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  // The latest of these, for the key listener added once on opening.
  const latest = useRef({ dismissible, onClose });
  useEffect(() => {
    latest.current = { dismissible, onClose };
  });

  useEffect(() => {
    const dialog = box.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      (dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog).focus();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const me = Symbol("dialog");
    openDialogs.push(me);
    const onKey = (e: KeyboardEvent) => {
      // A dialog opened over this one handles the key; this one waits until it is on top again.
      if (openDialogs[openDialogs.length - 1] !== me) return;
      if (e.key === "Escape") {
        // Handled here only, so neither a dialog nor a slide-over behind it closes as well.
        e.stopImmediatePropagation();
        if (latest.current.dismissible) latest.current.onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const outside = !dialog.contains(document.activeElement);
      if (e.shiftKey && (outside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (outside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      openDialogs.splice(openDialogs.indexOf(me), 1);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);

  const dialog = (
    <div className="modal-overlay" role="presentation" onClick={() => dismissible && onClose()}>
      <div
        ref={box}
        tabIndex={-1}
        className={`modal${wide ? " modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
  return portal ? createPortal(dialog, document.body) : dialog;
}

/** The coloured strip at the top of a dialog stating what the action does. */
export function ModalBanner({
  tone,
  icon,
  titleId,
  title,
  children,
}: {
  tone: "good" | "critical" | "info";
  icon: ReactNode;
  titleId: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`modal-banner is-${tone}`}>
      {icon}
      <div>
        <h2 id={titleId}>{title}</h2>
        <p>{children}</p>
      </div>
    </div>
  );
}

/** A required free-text field: a dialog cannot be confirmed until it has something in it. */
export function RequiredTextArea({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  maxLength,
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hint: string;
  /** The longest text the server accepts. */
  maxLength: number;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        <span className="required-mark" aria-hidden="true">
          *
        </span>
      </label>
      <textarea
        id={id}
        className="input textarea"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus
      />
      {value.trim().length === 0 && <p className="field-hint">{hint}</p>}
    </div>
  );
}
