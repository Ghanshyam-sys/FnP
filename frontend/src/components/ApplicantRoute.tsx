import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../api/queries";
import { routes } from "../routes";

/**
 * Gate for the applicant's /apply/:id pages: signing in is required. Which assessments a user may
 * open is decided by the backend, which answers 404 for anyone else's — the page then shows its
 * not-found state.
 */
export default function ApplicantRoute({ children }: { children: ReactNode }) {
  const { data: user } = useSession();
  if (!user) return <Navigate to={routes.login()} replace />;
  return children;
}
