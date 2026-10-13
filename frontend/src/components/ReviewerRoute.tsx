import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../api/queries";
import { routes } from "../routes";

/**
 * Gate for the /reviewer pages. Anyone who is not the reviewer goes to the applicant list, which in
 * turn sends a signed-out visitor to the login page. The backend enforces the same rule.
 */
export default function ReviewerRoute({ children }: { children: ReactNode }) {
  const { data: user } = useSession();
  if (user?.role !== "reviewer") return <Navigate to={routes.assessments()} replace />;
  return children;
}
