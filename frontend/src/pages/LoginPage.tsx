import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { keys, useSession, useSignIn, useSignOut } from "../api/queries";
import { ApiError } from "../api/client";
import { ArrowRightIcon, ShieldCheckIcon } from "../components/icons";
import { routes } from "../routes";

/** The development sign-in's reviewer account (see backend/cases/views/session.py). */
const REVIEWER_USERNAME = "admin";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const navigate = useNavigate();
  const signIn = useSignIn();
  const [emailInput, setEmailInput] = useState("");
  const client = useQueryClient();
  const [error, setError] = useState(() =>
    client.getQueryData(keys.sessionEnded) ? "Your session ended. Sign in again to continue." : ""
  );

  // Reaching this page while signed in (pressing Back from the dashboard, say) ends the session, so
  // it is a real sign-in page and Forward cannot return into the app. It is decided once, as soon
  // as who is signed in is known: signing in here afterwards must not sign straight back out.
  const session = useSession();
  const signOut = useSignOut();
  const [signedOut, setSignedOut] = useState(false);
  const arrivalChecked = useRef(false);
  useEffect(() => {
    if (arrivalChecked.current || session.isPending) return;
    arrivalChecked.current = true;
    if (session.data) signOut.mutate(undefined, { onSettled: () => setSignedOut(true) });
  }, [session.isPending, session.data, signOut]);
  // Signing in waits for that check and its sign-out to finish, so a late sign-out cannot end the
  // new session.
  const busy = signIn.isPending || signOut.isPending || session.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const value = emailInput.trim();
    const isReviewer = value.toLowerCase() === REVIEWER_USERNAME;
    if (!isReviewer && !EMAIL_PATTERN.test(value)) {
      setError("Enter a valid email address, or Admin for the reviewer portal.");
      return;
    }
    setError("");
    signIn.mutate(value, {
      onSuccess: ({ user }) => navigate(user.role === "reviewer" ? routes.reviewer() : routes.assessments()),
      onError: (err) =>
        setError(
          err instanceof ApiError && err.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : err instanceof ApiError && err.status === 403
              ? err.message
              : (err instanceof ApiError && err.field("email")) || "Sign-in failed. Try again."
        ),
    });
  };

  return (
    <div className="hero">
      <div className="hero-aura" aria-hidden="true" />

      <section className="hero-card">
        <span className="hero-mark">
          <ShieldCheckIcon size={24} />
        </span>
        <h1 className="hero-title">Fit and Proper Assessment</h1>
        <p className="hero-org">Applicant portal</p>

        <form className="hero-form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="email-input">
              Email address or username
            </label>
            <input
              id="email-input"
              className="input"
              type="text"
              placeholder="you@example.na"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              autoComplete="username"
              autoFocus
            />
            {error && <p className="field-error">{error}</p>}
            {signedOut && !error && (
              <p className="field-hint" role="status">
                You have been signed out. Sign in again to continue.
              </p>
            )}
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            Continue
            <ArrowRightIcon size={15} />
          </button>
          <p className="hero-hint">
            Assessments appear here once a department initiates one against your application.
            Reviewers sign in as <code>Admin</code>.
          </p>
        </form>
      </section>

      <p className="hero-foot">Proof of concept · assessment engine v0.1</p>
    </div>
  );
}
