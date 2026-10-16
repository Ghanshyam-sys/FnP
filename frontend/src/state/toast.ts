/**
 * Short confirmations of something done ("Application submitted", "Decision recorded"), shown by
 * <Toaster /> for a few seconds. Any code can raise one; the newest three are kept.
 *
 * A failure ("critical") stays until it is dismissed, so it cannot be missed. The others go after
 * a few seconds of being shown: the count pauses while the pointer or keyboard focus is on them,
 * so one being read does not vanish.
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

/** Each timed toast's countdown: the time it has left, and the timer running it down, if any. */
const countdowns = new Map<number, { left: number; startedAt: number; timer: number | null }>();
let paused = false;

function changed() {
  for (const listener of listeners) listener();
}

function run(id: number) {
  const countdown = countdowns.get(id);
  if (!countdown || paused) return;
  countdown.startedAt = Date.now();
  countdown.timer = window.setTimeout(() => dismissToast(id), countdown.left);
}

export function toast(message: string, tone: ToastTone = "good"): void {
  const item = { id: nextId++, message, tone };
  const kept = [...toasts, item].slice(-3);
  // Ones pushed out by a newer toast are gone, with their countdowns.
  for (const old of toasts) if (!kept.includes(old)) stopCountdown(old.id);
  toasts = kept;
  changed();
  if (tone !== "critical") {
    countdowns.set(item.id, { left: SHOWN_MS, startedAt: Date.now(), timer: null });
    run(item.id);
  }
}

function stopCountdown(id: number) {
  const countdown = countdowns.get(id);
  if (countdown?.timer != null) window.clearTimeout(countdown.timer);
  countdowns.delete(id);
}

export function dismissToast(id: number): void {
  stopCountdown(id);
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  // None left to point at: the pointer cannot leave them now, so nothing stays paused.
  if (toasts.length === 0) paused = false;
  changed();
}

/** The pointer or focus is on the toasts: every countdown stops where it is. */
export function pauseToasts(): void {
  if (paused) return;
  paused = true;
  for (const countdown of countdowns.values()) {
    if (countdown.timer == null) continue;
    window.clearTimeout(countdown.timer);
    countdown.timer = null;
    countdown.left = Math.max(1000, countdown.left - (Date.now() - countdown.startedAt));
  }
}

/** The pointer and focus have left the toasts: the countdowns carry on. */
export function resumeToasts(): void {
  if (!paused) return;
  paused = false;
  for (const id of countdowns.keys()) run(id);
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const currentToasts = (): Toast[] => toasts;
