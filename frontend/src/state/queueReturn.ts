import { routes } from "../routes";

/**
 * The queue as the reviewer last left it: its filters and search, as the address's query string
 * ("?status=NEEDS_ACTION&q=smith"). "Back to the queue" on a case page returns to that same list.
 * Kept for this tab (and across a reload of it); the plain queue if nothing was kept.
 */
const KEY = "fnpQueueSearch";
let last: string | null = null;

export function rememberQueueSearch(search: string): void {
  last = search;
  try {
    sessionStorage.setItem(KEY, search);
  } catch {
    // Storage blocked: remembered for this page load only.
  }
}

export function queueUrl(): string {
  if (last === null) {
    try {
      last = sessionStorage.getItem(KEY) ?? "";
    } catch {
      last = "";
    }
  }
  return routes.reviewer() + (last.startsWith("?") ? last : "");
}
