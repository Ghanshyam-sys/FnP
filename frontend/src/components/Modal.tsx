import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Overlay plus dialog box. Clicking the overlay cancels; clicks inside the box do not. Portalled
 * by default so a dialog opened from deep in a page still covers the whole viewport.
 */
export default function Modal({
  labelledBy,
  wide = false,
  portal = true,
  onClose,
  children,
}: {
  labelledBy: string;
  wide?: boolean;
  portal?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
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
