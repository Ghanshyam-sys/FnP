import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Tells a Back press apart from the other ways a page is reached without a link. React Router
 * reports "POP" for Back, Forward and a reload alike; only Back should step back again from a page
 * that no longer applies (see LeaveLockedPage).
 *
 * React Router numbers its history entries (history.state.idx). The browser's popstate event, which
 * Back and Forward fire and a reload does not, carries the entry being entered; comparing its number
 * with the entry being left says which way the user went.
 */

type RouterState = { key?: string; idx?: number } | null;

/** The number of the entry on screen, kept current by useTrackHistoryEntry. */
let currentIdx: number | null = null;
/** The last Back or Forward: the entry it entered, and whether it went back. */
let lastPop: { key: string; back: boolean } | null = null;

if (typeof window !== "undefined") {
  // Registered when this module loads, before the router's own listener: it has run by the time
  // the router renders the entry.
  window.addEventListener("popstate", (event) => {
    const state = event.state as RouterState;
    const idx = state?.idx;
    lastPop = {
      key: state?.key ?? "default",
      back: idx !== undefined && currentIdx !== null && idx < currentIdx,
    };
  });
}

/** Keeps the number of the entry on screen. Rendered once, inside the router. */
export function useTrackHistoryEntry(): void {
  const location = useLocation();
  useEffect(() => {
    currentIdx = (window.history.state as RouterState)?.idx ?? null;
  }, [location.key]);
}

/** Whether the entry with this location key was reached by pressing Back. */
export function reachedByBack(locationKey: string): boolean {
  return lastPop !== null && lastPop.key === locationKey && lastPop.back;
}
