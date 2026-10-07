import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAssessment } from "../state/useAssessment";
import { getAssignment, departmentFor } from "../data/assignments";
import { CheckIcon, LogOutIcon, ShieldCheckIcon } from "./icons";
import { parseApplyPath, routes } from "../routes";
import type { ApplyStep } from "../routes";

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
  const navigate = useNavigate();
  const { email, signOut } = useAssessment();

  const isReviewer = pathname.startsWith(routes.reviewer());
  const isPortal = pathname.startsWith(routes.assessments()) || isReviewer;
  const applyRoute = parseApplyPath(pathname);
  const stepIndex = applyRoute ? (applyRoute.step ? STEP_INDEX[applyRoute.step] : 0) : null;
  const assignment = applyRoute ? getAssignment(applyRoute.assignmentId) : undefined;

  if (!isPortal && stepIndex === null) return <main className="app-main">{children}</main>;

  const handleSignOut = () => {
    signOut();
    navigate(routes.login());
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
                  ? "Reviewer portal · Banking Licence"
                  : assignment
                    ? departmentFor(assignment).name
                    : "Applicant portal"}
              </span>
            </span>
          </Link>

          {email && (
            <div className="session">
              <span className="session-avatar">{initials(email)}</span>
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
