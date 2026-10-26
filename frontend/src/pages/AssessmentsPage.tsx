import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { routes } from "../routes";
import type { ApplyStep } from "../routes";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { useAssessments, useContinueApplication, useRemoveAssessment, useResetForm, useSession } from "../api/queries";
import { ApiError } from "../api/client";
import { STAGE_LABELS } from "../state/caseLabels";
import { Loading, LoadError } from "../components/LoadState";
import { formatDate, formatShortDay } from "../utils/format";
import type { Assessment, Stage } from "../api/types";
import DepartmentIcon from "../components/DepartmentIcon";
import { AlertTriangleIcon, ArrowRightIcon, MailIcon, PencilIcon, PlusIcon } from "../components/icons";

type ModalStep = "choose" | "confirm" | "remove";

/** How many applications an applicant may have started and not submitted (the server's limit). */
const MAX_OPEN_DRAFTS = 3;

/**
 * Where the second choice goes, given where the case actually stands. Only an unsubmitted form
 * is still editable: once it is with the reviewer, dropping the filer back into data collection
 * would let them change answers out from under a review that is already under way.
 */
function resumeFor(stage: Stage): {
  step: ApplyStep | null;
  title: string;
  sub: string;
} {
  if (stage === "AWAITING_APPLICANT") {
    return {
      step: "authentication",
      title: "Resubmit evidence",
      sub: "The reviewer asked for new documents",
    };
  }
  if (stage !== "NOT_SUBMITTED") {
    return {
      step: "status",
      title: "View this submission",
      sub: "Already submitted — track its progress",
    };
  }
  return { step: null, title: "Edit previous draft", sub: "Continue where you left off" };
}

export default function AssessmentsPage() {
  const navigate = useNavigate();
  const { data: user } = useSession();
  const list = useAssessments();
  const reset = useResetForm();
  const [selected, setSelected] = useState<Assessment | null>(null);
  const removal = useRemoveAssessment(selected?.id ?? "");
  const [step, setStep] = useState<ModalStep>("choose");
  // "Start a new application" first offers the applications not yet submitted, if there are any.
  const [choosingStart, setChoosingStart] = useState(false);
  // Its steps: the choices; which draft to remove (when several can be); confirming the removal.
  const [startStep, setStartStep] = useState<"choose" | "pick" | "remove">("choose");
  const [toRemove, setToRemove] = useState<Assessment | null>(null);
  const draftRemoval = useRemoveAssessment(toRemove?.id ?? "");
  // "Continue with previous": a new application from the details of a decided one.
  const continueFrom = useContinueApplication();

  if (!user) return <Navigate to={routes.login()} replace />;
  // The reviewer's list of assessments is the queue.
  if (user.role === "reviewer") return <Navigate to={routes.reviewer()} replace />;
  if (list.isPending) return <Loading />;
  if (list.isError && !list.data) return <LoadError error={list.error} onRetry={() => list.refetch()} />;

  const email = user.email;
  const assignments = list.data.pages.flatMap((p) => p.results);
  // The name on their most recent application, to greet them by.
  const firstName = assignments.find((a) => a.applicantName.trim())?.applicantName.trim().split(/\s+/)[0];
  // Where their applications stand, in a sentence.
  const count = (pred: (a: Assessment) => boolean) => assignments.filter(pred).length;
  const decided = (s: Stage) => s === "ACCEPTED" || s === "REJECTED";
  const parts = [
    [count((a) => a.stage === "NOT_SUBMITTED"), "not submitted yet"],
    [count((a) => a.stage === "AWAITING_APPLICANT"), "waiting for your new evidence"],
    [count((a) => a.stage !== "NOT_SUBMITTED" && a.stage !== "AWAITING_APPLICANT" && !decided(a.stage)), "being assessed"],
    [count((a) => decided(a.stage)), "decided"],
  ].filter(([n]) => (n as number) > 0).map(([n, label]) => `${n} ${label}`);
  const summary = `You have ${assignments.length} application${assignments.length === 1 ? "" : "s"}: ${parts.join(", ")}.`;

  const open = (assessment: Assessment) => {
    setSelected(assessment);
    setStep("choose");
    removal.reset();
  };

  const close = () => setSelected(null);

  const beginNew = () => {
    if (!selected) return;
    if (selected.hasDraft) {
      setStep("confirm");
      return;
    }
    navigate(routes.apply(selected.id));
  };

  const confirmNew = () => {
    if (!selected) return;
    reset.mutate(selected.id, { onSuccess: () => navigate(routes.apply(selected.id)) });
  };

  const confirmRemove = () => removal.mutate(undefined, { onSuccess: close });

  // Applications not yet submitted, which "Start a new application" offers to continue. Only those
  // the applicant started count towards the limit; one a department opened for them does not.
  const drafts = assignments.filter((a) => a.stage === "NOT_SUBMITTED");
  const ownDrafts = drafts.filter((a) => a.startedByApplicant).length;
  const atLimit = ownDrafts >= MAX_OPEN_DRAFTS;

  // Only an application the applicant started themselves can be removed (the server's rule).
  const removableDrafts = drafts.filter((a) => a.removable);
  // The application a new one can start from: their most recent decided one (the list is newest
  // first). With none decided yet, their most recent submitted one is shown, but cannot be taken
  // until it is decided.
  const previous =
    assignments.find((a) => decided(a.stage)) ?? assignments.find((a) => a.stage !== "NOT_SUBMITTED");
  const previousDecided = previous !== undefined && decided(previous.stage);

  const startNew = () => {
    if (drafts.length === 0 && !previous) {
      navigate(routes.newApplication());
      return;
    }
    setStartStep("choose");
    setToRemove(null);
    draftRemoval.reset();
    continueFrom.reset();
    setChoosingStart(true);
  };

  const continuePrevious = () => {
    if (!previous || !previousDecided || atLimit) return;
    continueFrom.mutate(previous.id, { onSuccess: (created) => navigate(routes.apply(created.id)) });
  };

  const closeStart = () => setChoosingStart(false);

  const askRemove = (draft?: Assessment) => {
    draftRemoval.reset();
    const only = draft ?? (removableDrafts.length === 1 ? removableDrafts[0] : null);
    if (only) {
      setToRemove(only);
      setStartStep("remove");
    } else {
      setStartStep("pick");
    }
  };

  const confirmDraftRemove = () => {
    const removed = toRemove;
    draftRemoval.mutate(undefined, {
      onSuccess: () => {
        setToRemove(null);
        // Nothing left to continue: the popup has done its job. Otherwise back to the choices.
        if (drafts.every((d) => d.id === removed?.id)) closeStart();
        else setStartStep("choose");
      },
    });
  };

  const startApplication = (
    <button className="btn btn-primary" onClick={startNew}>
      <PlusIcon size={15} />
      Start a new application
    </button>
  );

  // The second choice in the dialog depends on where the selected case stands. Only a form not
  // yet submitted can be started over: a submitted one is a record the reviewer is working on.
  const resume = selected ? resumeFor(selected.stage) : null;
  const resumeAvailable = selected ? selected.hasDraft || selected.stage !== "NOT_SUBMITTED" : false;
  const canStartOver = selected?.stage === "NOT_SUBMITTED";

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head-text">
          <h1>{firstName ? `Welcome back, ${firstName}` : "Your assessments"}</h1>
          <p className="page-sub">
            {assignments.length > 0
              ? summary
              : "Fit and proper assessments for your applications appear here."}
          </p>
        </div>
        {assignments.length > 0 && <div className="page-head-aside">{startApplication}</div>}
      </header>

      {assignments.length === 0 ? (
        <EmptyState icon={<MailIcon size={22} />} title={<>No assessments for {email}</>} action={startApplication}>
          Start your own application for the department handling your licence or accreditation
          application, or wait for the department to open one for you. Either way, it is listed here.
        </EmptyState>
      ) : (
        <div className="tiles">
          {assignments.map((assignment) => {
            const department = assignment.department;
            const started = assignment.hasDraft;
            const stage = assignment.stage;
            // A submitted assessment reports where it stands; before that, whether it is started.
            const badge =
              stage !== "NOT_SUBMITTED"
                ? { label: STAGE_LABELS[stage].applicant, tone: STAGE_LABELS[stage].tone }
                : {
                    label: started ? "Draft saved" : "Not started",
                    tone: started ? "info" : "neutral",
                  };
            return (
              <button className="tile" key={assignment.id} onClick={() => open(assignment)}>
                <span className="tile-head">
                  <span className="tile-icon">
                    <DepartmentIcon departmentKey={department.key} size={19} />
                  </span>
                  <span className={`chip chip-${badge.tone}`}>{badge.label}</span>
                </span>

                <span className="tile-dept">{department.name}</span>
                <span className="tile-blurb">{department.blurb}</span>

                <span className="tile-detail">
                  <span className="tile-label">Entity</span>
                  <span className="tile-value">{assignment.entity}</span>
                </span>
                <span className="tile-detail">
                  <span className="tile-label">Position</span>
                  <span className="tile-value">{assignment.position}</span>
                </span>

                {stage === "NOT_SUBMITTED" && assignment.progress ? (
                  <span className="tile-progress">
                    <span className="tile-progress-label">
                      {assignment.progress.documentsAttached} of {assignment.progress.documentsNeeded} documents attached
                      {assignment.progress.answersMissing
                        ? ` · ${assignment.progress.answersMissing} answer${assignment.progress.answersMissing === 1 ? "" : "s"} to write`
                        : ""}
                    </span>
                    <span
                      className="tile-progress-track"
                      role="progressbar"
                      aria-label="Documents attached"
                      aria-valuemin={0}
                      aria-valuemax={assignment.progress.documentsNeeded}
                      aria-valuenow={assignment.progress.documentsAttached}
                    >
                      <span
                        className="tile-progress-fill"
                        style={{
                          width: `${Math.round((assignment.progress.documentsAttached / Math.max(1, assignment.progress.documentsNeeded)) * 100)}%`,
                        }}
                      />
                    </span>
                  </span>
                ) : stage !== "NOT_SUBMITTED" ? (
                  <span className="tile-since">
                    {STAGE_LABELS[stage].applicant} since {formatShortDay(assignment.stageSince ?? assignment.updatedAt)}
                  </span>
                ) : null}

                <span className="tile-foot">
                  <span className="tile-ref">{assignment.reference}</span>
                  <span>Initiated {formatDate(assignment.initiatedOn)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {choosingStart && (
        <Modal labelledBy="start-modal-title" portal={false} onClose={closeStart}>
          {startStep === "remove" && toRemove ? (
            <>
              <span className="modal-icon">
                <AlertTriangleIcon size={20} />
              </span>
              <h2 id="start-modal-title">Remove this application?</h2>
              <p className="modal-sub">
                The {toRemove.department.name} application {toRemove.reference} and everything saved
                for it are deleted. This cannot be undone.
              </p>
              {draftRemoval.isError && (
                <p className="field-error" role="alert">
                  It was not removed. It may have been submitted in the meantime; close this and check.
                </p>
              )}
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setStartStep("choose")}>
                  Cancel
                </button>
                <button className="btn btn-critical" onClick={confirmDraftRemove} disabled={draftRemoval.isPending}>
                  {draftRemoval.isPending ? "Removing…" : "Remove application"}
                </button>
              </div>
            </>
          ) : startStep === "pick" ? (
            <>
              <h2 id="start-modal-title">Remove an application</h2>
              <p className="modal-sub">
                Choose the application to delete. Only applications you started yourself, and have
                not submitted, can be removed.
              </p>
              {removableDrafts.map((draft) => (
                <button className="choice" key={draft.id} onClick={() => askRemove(draft)}>
                  <span className="choice-icon">
                    <AlertTriangleIcon size={17} />
                  </span>
                  <span className="choice-text">
                    <span className="choice-title">{draft.department.name}</span>
                    <span className="choice-sub">
                      {draft.entity} · {draft.reference}
                    </span>
                  </span>
                  <ArrowRightIcon size={15} className="choice-arrow" />
                </button>
              ))}
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setStartStep("choose")}>
                  Back
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 id="start-modal-title">Start a new application</h2>
              <p className="modal-sub">
                {drafts.length === 0
                  ? "Continue from your previous application with its details filled in, or start another."
                  : drafts.length === 1
                    ? "You have an application that is not submitted yet. Continue it, or start another."
                    : `You have ${drafts.length} applications that are not submitted yet. Continue one, or start another.`}
              </p>

              {drafts.length === 1 && (
                <dl className="modal-detail">
                  <div>
                    <dt>Department</dt>
                    <dd>{drafts[0].department.name}</dd>
                  </div>
                  <div>
                    <dt>Entity</dt>
                    <dd>{drafts[0].entity}</dd>
                  </div>
                  <div>
                    <dt>Position applied for</dt>
                    <dd>{drafts[0].position}</dd>
                  </div>
                </dl>
              )}

              {drafts.map((draft) => (
                <button className="choice" key={draft.id} onClick={() => navigate(routes.apply(draft.id))}>
                  <span className="choice-icon">
                    <PencilIcon size={17} />
                  </span>
                  <span className="choice-text">
                    <span className="choice-title">Edit previous draft</span>
                    <span className="choice-sub">
                      {drafts.length === 1
                        ? draft.hasDraft
                          ? "Continue where you left off"
                          : "Not started yet — open the form"
                        : `${draft.department.name} · ${draft.entity} · ${draft.reference}`}
                    </span>
                  </span>
                  <ArrowRightIcon size={15} className="choice-arrow" />
                </button>
              ))}

              {previous && (
                <button
                  className={`choice${!previousDecided || atLimit ? " is-disabled" : ""}`}
                  disabled={!previousDecided || atLimit || continueFrom.isPending}
                  onClick={continuePrevious}
                >
                  <span className="choice-icon">
                    <PencilIcon size={17} />
                  </span>
                  <span className="choice-text">
                    <span className="choice-title">
                      {continueFrom.isPending ? "Starting…" : "Continue with previous"}
                    </span>
                    <span className="choice-sub">
                      {!previousDecided
                        ? `${previous.reference} is ${STAGE_LABELS[previous.stage].applicant.toLowerCase()}. Available once a decision is made.`
                        : atLimit
                          ? `You have ${MAX_OPEN_DRAFTS} applications not submitted yet. Submit or remove one first.`
                          : `${previous.department.name} · ${previous.entity} · ${previous.reference}: its details filled in, straight to the questions`}
                    </span>
                  </span>
                  <ArrowRightIcon size={15} className="choice-arrow" />
                </button>
              )}
              {continueFrom.isError && (
                <p className="field-error" role="alert">
                  {continueFrom.error instanceof ApiError && continueFrom.error.message
                    ? continueFrom.error.message
                    : "The application could not be started. Try again."}
                </p>
              )}

              <button
                className={`choice${atLimit ? " is-disabled" : ""}`}
                disabled={atLimit}
                onClick={() => navigate(routes.newApplication())}
              >
                <span className="choice-icon">
                  <PlusIcon size={17} />
                </span>
                <span className="choice-text">
                  <span className="choice-title">Start a new application</span>
                  <span className="choice-sub">
                    {atLimit
                      ? `You have ${MAX_OPEN_DRAFTS} applications not submitted yet. Submit or remove one first.`
                      : "Open a new form for another application"}
                  </span>
                </span>
                <ArrowRightIcon size={15} className="choice-arrow" />
              </button>

              {removableDrafts.length > 0 && (
                <button className="choice" onClick={() => askRemove()}>
                  <span className="choice-icon">
                    <AlertTriangleIcon size={17} />
                  </span>
                  <span className="choice-text">
                    <span className="choice-title">Remove application</span>
                    <span className="choice-sub">
                      {removableDrafts.length > 1
                        ? "Choose a draft to delete, with everything saved for it"
                        : drafts.length === 1
                          ? "Delete it and everything saved for it"
                          : `${removableDrafts[0].department.name} · ${removableDrafts[0].entity} · ${removableDrafts[0].reference}`}
                    </span>
                  </span>
                  <ArrowRightIcon size={15} className="choice-arrow" />
                </button>
              )}

              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={closeStart}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {selected && resume && (
        <Modal labelledBy="assessment-modal-title" portal={false} onClose={close}>
          {step === "choose" ? (
            <>
              <h2 id="assessment-modal-title">{selected.department.name}</h2>
              <p className="modal-sub">
                Entity and position are carried over from application {selected.reference}.
              </p>

              <dl className="modal-detail">
                <div>
                  <dt>Entity</dt>
                  <dd>{selected.entity}</dd>
                </div>
                <div>
                  <dt>Position applied for</dt>
                  <dd>{selected.position}</dd>
                </div>
              </dl>

              {canStartOver && (
                <button className="choice" onClick={beginNew}>
                  <span className="choice-icon">
                    <PlusIcon size={17} />
                  </span>
                  <span className="choice-text">
                    <span className="choice-title">Start over</span>
                    <span className="choice-sub">Clear this form and begin again</span>
                  </span>
                  <ArrowRightIcon size={15} className="choice-arrow" />
                </button>
              )}

              <button
                className={`choice${resumeAvailable ? "" : " is-disabled"}`}
                disabled={!resumeAvailable}
                onClick={() =>
                  navigate(
                    resume.step
                      ? routes.applyStep(selected.id, resume.step)
                      : routes.apply(selected.id)
                  )
                }
              >
                <span className="choice-icon">
                  <PencilIcon size={17} />
                </span>
                <span className="choice-text">
                  <span className="choice-title">{resume.title}</span>
                  <span className="choice-sub">
                    {resumeAvailable ? resume.sub : "No saved draft yet"}
                  </span>
                </span>
                <ArrowRightIcon size={15} className="choice-arrow" />
              </button>

              {selected.removable && (
                <button className="choice" onClick={() => setStep("remove")}>
                  <span className="choice-icon">
                    <AlertTriangleIcon size={17} />
                  </span>
                  <span className="choice-text">
                    <span className="choice-title">Remove application</span>
                    <span className="choice-sub">Delete it and everything saved for it</span>
                  </span>
                  <ArrowRightIcon size={15} className="choice-arrow" />
                </button>
              )}

              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={close}>
                  Cancel
                </button>
              </div>
            </>
          ) : step === "remove" ? (
            <>
              <span className="modal-icon">
                <AlertTriangleIcon size={20} />
              </span>
              <h2 id="assessment-modal-title">Remove this application?</h2>
              <p className="modal-sub">
                The {selected.department.name} application {selected.reference} and everything saved
                for it are deleted. This cannot be undone.
              </p>
              {removal.isError && (
                <p className="field-error" role="alert">
                  It was not removed. It may have been submitted in the meantime; close this and check.
                </p>
              )}
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setStep("choose")}>
                  Cancel
                </button>
                <button className="btn btn-critical" onClick={confirmRemove} disabled={removal.isPending}>
                  {removal.isPending ? "Removing…" : "Remove application"}
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="modal-icon">
                <AlertTriangleIcon size={20} />
              </span>
              <h2 id="assessment-modal-title">Replace your saved draft?</h2>
              <p className="modal-sub">
                Starting over clears everything saved for{" "}
                {selected.department.name}. This cannot be undone.
              </p>
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setStep("choose")}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={confirmNew} disabled={reset.isPending}>
                  Replace and start
                  <ArrowRightIcon size={15} />
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
