import { useSyncExternalStore } from "react";
import { currentToasts, dismissToast, subscribeToasts } from "../state/toast";
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon, XIcon } from "./icons";

const ICON = { good: CheckCircleIcon, info: InfoIcon, critical: AlertTriangleIcon } as const;

/** Where the confirmations raised with toast() appear; announced to screen readers as they come. */
export default function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, currentToasts, currentToasts);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div className={`toast is-${t.tone}`} key={t.id}>
            <Icon size={16} />
            <span className="toast-text">{t.message}</span>
            <button className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
              <XIcon size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
