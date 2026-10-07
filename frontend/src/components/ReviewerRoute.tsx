import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAssessment } from "../state/useAssessment";
import { routes } from "../routes";

/**
 * Gate for the /reviewer pages. Anyone who is not the reviewer goes to the applicant list, which
 * in turn sends a signed-out visitor to the login page.
 */
export default function ReviewerRoute({ children }: { children: ReactNode }) {
  const { role } = useAssessment();
  if (role !== "reviewer") return <Navigate to={routes.assessments()} replace />;
  return children;
}
