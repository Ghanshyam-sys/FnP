import { useRef, useState, useSyncExternalStore } from "react";
import { currentToasts, dismissToast, pauseToasts, resumeToasts, subscribeToasts } from "../state/toast";
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon, XIcon } from "./icons";

const ICON = { good: CheckCircleIcon, info: InfoIcon, critical: AlertTriangleIcon } as const;

/**
 * Where the confirmations raised with toast() appear. Screen readers hear them through two live
 * regions that are always there: a failure is announced at once, anything else politely.
 */
export default function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, currentToasts, currentToasts);
  const area = useRef<HTMLDivElement>(null);
  // Dismissing removes the button that had focus, and the browser then sends no blur: once it is
  // gone, the others carry on counting down unless the pointer or focus is still on them.
  const dismiss = (id: number) => {
    dismissToast(id);
    window.setTimeout(() => {
      const el = area.current;
      if (el && !el.contains(document.activeElement) && !el.matches(":hover")) resumeToasts();
    }, 0);
  };
  // What each live region last announced. It changes only when a newer toast arrives: dismissing
  // the newest must not make an older one's message be read out again.
  const [announced, setAnnounced] = useState({ polite: { id: 0, message: "" }, alert: { id: 0, message: "" } });
  const newest = (critical: boolean) => toasts.findLast((t) => (t.tone === "critical") === critical);
  const polite = newest(false);
  const alert = newest(true);
  if ((polite && polite.id > announced.polite.id) || (alert && alert.id > announced.alert.id)) {
    setAnnounced({
      polite: polite && polite.id > announced.polite.id ? { id: polite.id, message: polite.message } : announced.polite,
      alert: alert && alert.id > announced.alert.id ? { id: alert.id, message: alert.message } : announced.alert,
    });
  }
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">
        {announced.polite.message}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive">
        {announced.alert.message}
      </div>
      <div
        ref={area}
        className="toaster"
        onMouseEnter={pauseToasts}
        // The pointer leaving does not restart them while keyboard focus is still on one.
        onMouseLeave={(e) => {
          if (!e.currentTarget.contains(document.activeElement)) resumeToasts();
        }}
        onFocus={pauseToasts}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) resumeToasts();
        }}
      >
        {toasts.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div className={`toast is-${t.tone}`} key={t.id}>
              <Icon size={16} />
              <span className="toast-text">{t.message}</span>
              <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <XIcon size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
