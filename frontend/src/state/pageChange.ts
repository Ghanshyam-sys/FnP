import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { matchPath, useLocation, useNavigationType } from "react-router-dom";
import { ROUTE_PATTERNS } from "../routes";

const APP_NAME = "iRIS · Fit and Proper Assessment";

/** Each page's name in the browser tab and history (a case page adds its case ID). */
const PAGE_NAMES: [pattern: string, name: string][] = [
  [ROUTE_PATTERNS.login, "Sign in"],
  [ROUTE_PATTERNS.assessments, "My assessments"],
  [ROUTE_PATTERNS.newApplication, "New application"],
  [ROUTE_PATTERNS.apply, "Application form"],
  [ROUTE_PATTERNS.applyReview, "Review your answers"],
  [ROUTE_PATTERNS.applyStatus, "Submission status"],
  [ROUTE_PATTERNS.applyAuthentication, "Authentication"],
  [ROUTE_PATTERNS.applyResult, "Result"],
  [ROUTE_PATTERNS.reviewer, "Assessment queue"],
  [ROUTE_PATTERNS.reviewerQuestions, "Configure questions"],
  [ROUTE_PATTERNS.reviewerNewAssessment, "New assessment"],
  [ROUTE_PATTERNS.reviewerAdmin, "Admin panel"],
  [ROUTE_PATTERNS.reviewerAdminUsers, "Users"],
  [ROUTE_PATTERNS.reviewerAdminUser, "User"],
  [ROUTE_PATTERNS.reviewerAuthentication, "Authentication"],
  [ROUTE_PATTERNS.reviewerResult, "Scoring and decision"],
];

export function pageTitle(pathname: string): string {
  for (const [pattern, name] of PAGE_NAMES) {
    const match = matchPath(pattern, pathname);
    if (match) return [name, match.params.id, APP_NAME].filter(Boolean).join(" · ");
  }
  return APP_NAME;
}

/**
 * What changes with the page: the tab's title, and on moving to another page by a link or button,
 * the view goes back to the top and keyboard focus to the page itself (so a screen reader starts
 * there, and Tab does not continue from a button that is gone). Back and Forward leave both as
 * the browser restores them, and a change of address within a page (a filter) leaves them alone.
 */
export function usePageChange(main: RefObject<HTMLElement | null>): void {
  const { pathname } = useLocation();
  const navigation = useNavigationType();
  const previous = useRef(pathname);

  useEffect(() => {
    document.title = pageTitle(pathname);
  }, [pathname]);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    // Back and Forward keep what the browser restores; a link, a button or a redirect (which
    // replaces the entry, as after submitting) starts the new page at the top.
    if (navigation === "POP") return;
    window.scrollTo(0, 0);
    // Focus goes to the page unless a field on it has already taken it (one that focuses itself).
    const active = document.activeElement;
    const el = main.current;
    if (el && (!active || active === document.body || !active.isConnected || !el.contains(active))) {
      el.focus({ preventScroll: true });
    }
  }, [pathname, navigation, main]);
}
