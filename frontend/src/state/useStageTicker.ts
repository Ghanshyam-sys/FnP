import { useEffect, useState } from "react";

/**
 * Authentication and scoring are simulated with elapsed time, so a page showing a case in one
 * of those stages has to re-render to notice it finishing. Ticking stops as soon as nothing is
 * in flight, so a settled queue costs nothing.
 *
 * `active` may be a function of the ticker's own clock, for a page whose "still running?"
 * question depends on the time being rendered — it is evaluated on every render.
 */
export function useStageTicker(
  active: boolean | ((now: number) => boolean),
  intervalMs = 500
): number {
  const [now, setNow] = useState(() => Date.now());
  const isActive = typeof active === "function" ? active(now) : active;

  useEffect(() => {
    if (!isActive) return;
    const tick = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(tick);
  }, [isActive, intervalMs]);

  return now;
}
