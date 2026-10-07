import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { issuesIn } from "../domain/authentication";
import { unresolvedFlags } from "../state/reviewState";
import {
  anyCaseInFlight,
  clearRuling,
  isScored,
  readCase,
  ruleOnQuestion,
  stageFor,
} from "../state/caseStore";
import { useCaseView } from "../state/useCaseView";
import { useStageTicker } from "../state/useStageTicker";
import { routes } from "../routes";
import AssessmentNotFound from "../components/AssessmentNotFound";
import AuthenticationReport from "../components/AuthenticationReport";
import OverrideDialog from "../components/OverrideDialog";
import ReviewerTabs from "../components/ReviewerTabs";
import { ReviewerCaseHeader } from "../components/PageHeader";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  MessageIcon,
} from "../components/icons";
import type { RulingVerdict } from "../state/caseStore";
import type { QuestionAuthResult } from "../domain/types";

interface Pending {
  result: QuestionAuthResult;
  verdict: RulingVerdict;
}

export default function ReviewerAuthenticationPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending | null>(null);
  // Bumped after each ruling so the page re-reads the case from storage.
  const [revision, setRevision] = useState(0);

  // Every hook runs before the guard below, so a not-found can never change the hook order.
  const view = useCaseView(id);
  const now = useStageTicker(anyCaseInFlight([id]));

  if (!view) return <AssessmentNotFound />;
  const { assignment, outcome, flagged } = view;

  const stage = stageFor(id, flagged, now);
  const record = readCase(id);
  const open = unresolvedFlags(id, outcome);
  const issues = issuesIn(outcome);
  const canRule = stage === "REVIEW_PENDING";

  const confirm = (comment: string) => {
    if (!pending) return;
    ruleOnQuestion(id, pending.result.qid, pending.verdict, comment);
    setPending(null);
    setRevision((v) => v + 1);
  };

  const undo = (qid: string) => {
    clearRuling(id, qid);
    setRevision((v) => v + 1);
  };

  const questionFooter = (result: QuestionAuthResult) => {
    if (result.status !== "issue") return null;
    const ruling = record.rulings[result.qid];

    if (ruling) {
      return (
        <div className="ruling-block" key={`${result.qid}-${revision}`}>
          <div className={`reviewer-note is-${ruling.verdict}`}>
            <MessageIcon size={14} />
            <div>
              <span className="reviewer-note-label">
                {ruling.verdict === "accepted"
                  ? "Accepted — AI finding overridden"
                  : "Rejected — returned to the applicant"}
              </span>
              <p>{ruling.comment}</p>
            </div>
          </div>
          {stage === "REVIEW_PENDING" && (
            <button className="btn btn-ghost btn-sm" onClick={() => undo(result.qid)}>
              Undo this ruling
            </button>
          )}
        </div>
      );
    }

    if (!canRule) return null;

    return (
      <div className="ruling-actions">
        <p className="ruling-prompt">
          The engine could not authenticate this answer. Accept it on your own judgment, or reject
          it and ask the applicant for new evidence.
        </p>
        <div className="ruling-buttons">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setPending({ result, verdict: "accepted" })}
          >
            <CheckCircleIcon size={14} />
            Accept with comment
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setPending({ result, verdict: "rejected" })}
          >
            <AlertTriangleIcon size={14} />
            Reject and return
          </button>
        </div>
      </div>
    );
  };

  const notice =
    issues.length === 0 ? (
      <div className="notice notice-good">
        <CheckCircleIcon size={17} />
        <div>
          <strong>Every answer was authenticated against its evidence.</strong> Nothing needs your
          judgment at this stage.
        </div>
      </div>
    ) : open.length > 0 ? (
      <div className="notice notice-critical">
        <AlertTriangleIcon size={17} />
        <div>
          <strong>
            {open.length} question{open.length > 1 ? "s" : ""} awaiting your ruling
          </strong>{" "}
          ({open.map((f) => f.result.qid).join(", ")}). The assessment moves to scoring once every
          flagged answer is accepted.
        </div>
      </div>
    ) : (
      <div className="notice notice-info">
        <CheckCircleIcon size={17} />
        <div>
          <strong>All flagged answers have been ruled on.</strong>{" "}
          {stage === "AWAITING_APPLICANT"
            ? "The applicant has been asked for new evidence."
            : "The assessment has moved on to scoring."}
        </div>
      </div>
    );

  return (
    <div className="page">
      <ReviewerCaseHeader assignment={assignment} stage={stage} />

      <ReviewerTabs assessmentId={id} active="authentication" scoringReady={isScored(stage)} />

      <AuthenticationReport
        assessmentId={id}
        outcome={outcome}
        notice={notice}
        questionFooter={questionFooter}
      />

      <footer className="actionbar">
        <button className="btn btn-ghost" onClick={() => navigate(routes.reviewer())}>
          <ArrowLeftIcon size={15} />
          Back to the queue
        </button>
        {isScored(stage) && (
          <button className="btn btn-primary" onClick={() => navigate(routes.reviewerResult(id))}>
            Go to scoring and decision
            <ArrowRightIcon size={15} />
          </button>
        )}
      </footer>

      {pending && (
        <OverrideDialog
          qid={pending.result.qid}
          question={pending.result.question}
          verdict={pending.verdict}
          failingChecks={pending.result.checks
            .filter((c) => c.status === "fail")
            .map((c) => `${c.label} — ${c.note}`)}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
