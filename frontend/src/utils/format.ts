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
