import { useNavigate } from "react-router-dom";
import { routes } from "../routes";

/** The two halves of a case in the reviewer portal. Scoring opens only once a case is scored. */
export default function ReviewerTabs({
  assessmentId,
  active,
  scoringReady,
}: {
  assessmentId: string;
  active: "authentication" | "scoring";
  scoringReady: boolean;
}) {
  const navigate = useNavigate();

  return (
    <nav className="reviewer-tabs">
      {active === "authentication" ? (
        <span className="is-active">Authentication</span>
      ) : (
        <button onClick={() => navigate(routes.reviewerAuthentication(assessmentId))}>
          Authentication
        </button>
      )}
      {active === "scoring" ? (
        <span className="is-active">Scoring and decision</span>
      ) : (
        <button
          disabled={!scoringReady}
          onClick={() => navigate(routes.reviewerResult(assessmentId))}
          title={scoringReady ? undefined : "Available once scoring has finished"}
        >
          Scoring and decision
        </button>
      )}
    </nav>
  );
}
