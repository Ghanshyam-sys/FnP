/** Today's date as YYYY-MM-DD, in local time. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A 0–1 confidence as a whole percentage: 0.956 → "96%". */
export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** "14 Aug 2026" from an ISO date ("2026-08-14"), read as a local calendar date. */
export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "12 Oct" from a timestamp, in local time (with the year when it is not this year). */
export function formatShortDay(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-GB", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

/** Whole days from a timestamp to now (0 on the same day). */
export function daysSince(iso: string, now: Date = new Date()): number {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

/** "12 Oct 2026, 14:05" from a timestamp, in local time. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** "2.7 MB" from a size in bytes. */
export function formatBytes(bytes: number): string {
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${value} ${units[0]}` : `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
