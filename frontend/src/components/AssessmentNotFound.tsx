import { Link } from "react-router-dom";
import { routes } from "../routes";
import EmptyState from "./EmptyState";
import { AlertTriangleIcon } from "./icons";

export default function AssessmentNotFound() {
  return (
    <div className="page">
      <EmptyState
        icon={<AlertTriangleIcon size={22} />}
        title="Assessment not found"
        action={
          <Link className="btn btn-primary" to={routes.assessments()}>
            Back to your assessments
          </Link>
        }
      >
        This assessment is no longer available, or the link is incorrect.
      </EmptyState>
    </div>
  );
}
