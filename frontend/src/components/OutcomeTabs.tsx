import { Link } from "react-router-dom";
import { routes } from "../routes";

export default function OutcomeTabs({
  assessmentId,
  active,
  scoringReady,
}: {
  assessmentId: string;
  active: "authentication" | "scoring";
  scoringReady: boolean;
}) {
  return (
    <nav className="outcome-tabs" aria-label="Assessment reports">
      <Link
        className={`outcome-tab${active === "authentication" ? " is-active" : ""}`}
        to={routes.applyAuthentication(assessmentId)}
      >
        Authentication
      </Link>

      {scoringReady ? (
        <Link
          className={`outcome-tab${active === "scoring" ? " is-active" : ""}`}
          to={routes.applyResult(assessmentId)}
        >
          Scoring
        </Link>
      ) : (
        <span className="outcome-tab is-disabled" title="Scoring runs once authentication is clean">
          Scoring
        </span>
      )}

      <Link className="outcome-tab-status" to={routes.applyStatus(assessmentId)}>
        Status
      </Link>
    </nav>
  );
}
