import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAssessment } from "../state/useAssessment";
import { getAssignment } from "../state/assignmentStore";
import { routes } from "../routes";
import AssessmentNotFound from "./AssessmentNotFound";

/**
 * Gate for the applicant's /apply/:id pages. Signing in is required, and an applicant sees only
 * the assessments addressed to them; the reviewer can open any of them. Unknown ids fall through
 * so the page itself shows its usual not-found state.
 */
export default function ApplicantRoute({ children }: { children: ReactNode }) {
  const { id = "" } = useParams();
  const { email, role } = useAssessment();

  if (!email) return <Navigate to={routes.login()} replace />;

  const assignment = getAssignment(id);
  if (assignment && role === "applicant" && assignment.email !== email) {
    return <AssessmentNotFound />;
  }

  return children;
}
