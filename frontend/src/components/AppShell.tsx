import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAssessment, useSession, useSignOut } from "../api/queries";
import { CheckIcon, LogOutIcon, ShieldCheckIcon } from "./icons";
import { parseApplyPath, routes } from "../routes";
import type { ApplyStep } from "../routes";
import { useTrackHistoryEntry } from "../state/backNavigation";

const STEPS = ["Data collection", "Review", "Authentication", "Result"] as const;

/** Where each applicant route sits in the stepper; the form itself is step 0. */
const STEP_INDEX: Record<ApplyStep, number> = {
  review: 1,
  status: 2,
  authentication: 2,
  result: 3,
};

export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // Lets a page tell a Back press from a reload or Forward (see state/backNavigation).
  useTrackHistoryEntry();
  const navigate = useNavigate();
  const { data: user } = useSession();
  const signOut = useSignOut();
  const email = user?.email ?? null;

  const isReviewer = pathname.startsWith(routes.reviewer());
  const isPortal = pathname.startsWith(routes.assessments()) || isReviewer;
  const applyRoute = parseApplyPath(pathname);
  const stepIndex = applyRoute ? (applyRoute.step ? STEP_INDEX[applyRoute.step] : 0) : null;
  // Already cached by the page itself, so the header costs no extra request.
  const { data: assessment } = useAssessment(applyRoute?.assignmentId);

  if (!isPortal && stepIndex === null) return <main className="app-main">{children}</main>;

  const handleSignOut = () => {
    signOut.mutate(undefined, { onSettled: () => navigate(routes.login()) });
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to={isReviewer ? routes.reviewer() : routes.assessments()}>
            <span className="brand-mark">
              <ShieldCheckIcon size={18} />
            </span>
            <span className="brand-text">
              <span className="brand-title">Fit and Proper Assessment</span>
              <span className="brand-sub">
                {isReviewer
                  ? "Reviewer portal · All departments"
                  : (assessment?.department.name ?? "Applicant portal")}
              </span>
            </span>
          </Link>

          {email && (
            <div className="session">
              {/* On a phone only the initials show; the full address is in the tooltip. */}
              <span className="session-avatar" title={email}>
                {initials(email)}
              </span>
              <span className="session-email">{email}</span>
              <button className="btn btn-ghost btn-sm" onClick={handleSignOut}>
                <LogOutIcon size={13} />
                Sign out
              </button>
            </div>
          )}
        </div>

        {stepIndex !== null && !isReviewer && (
          <nav className="stepper" aria-label="Application progress">
            <ol>
              {STEPS.map((label, i) => {
                const state = i < stepIndex ? "is-done" : i === stepIndex ? "is-current" : "is-todo";
                return (
                  <li key={label} className={state}>
                    <span className="step-marker">
                      {i < stepIndex ? <CheckIcon size={13} /> : i + 1}
                    </span>
                    <span className="step-label">{label}</span>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
      </header>
      <main className="app-main">{children}</main>
    </>
  );
}

function initials(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[.\-_]/).filter(Boolean);
  const first = parts[0]?.[0] ?? local[0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}
