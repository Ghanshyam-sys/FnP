/**
 * Short confirmations of something done ("Application submitted", "Decision recorded"), shown by
 * <Toaster /> for a few seconds. Any code can raise one; the newest three are kept.
 */
export type ToastTone = "good" | "info" | "critical";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const SHOWN_MS = 4500;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

export function toast(message: string, tone: ToastTone = "good"): void {
  const item = { id: nextId++, message, tone };
  toasts = [...toasts, item].slice(-3);
  changed();
  window.setTimeout(() => dismissToast(item.id), SHOWN_MS);
}

export function dismissToast(id: number): void {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  changed();
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const currentToasts = (): Toast[] => toasts;
