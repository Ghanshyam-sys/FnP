import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { routes } from "../routes";
import type { ApplyStep } from "../routes";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { useAssessments, useRemoveAssessment, useResetForm, useSession } from "../api/queries";
import { STAGE_LABELS } from "../state/caseLabels";
import { Loading, LoadError } from "../components/LoadState";
import { formatDate } from "../utils/format";
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

  if (!user) return <Navigate to={routes.login()} replace />;
  // The reviewer's list of assessments is the queue.
  if (user.role === "reviewer") return <Navigate to={routes.reviewer()} replace />;
  if (list.isPending) return <Loading />;
  if (list.isError && !list.data) return <LoadError error={list.error} onRetry={() => list.refetch()} />;

  const email = user.email;
  const assignments = list.data.pages.flatMap((p) => p.results);

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

  const startNew = () => {
    if (drafts.length === 0) {
      navigate(routes.newApplication());
      return;
    }
    setChoosingStart(true);
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
          <h1>Your assessments</h1>
          <p className="page-sub">
            {assignments.length > 0
              ? `${assignments.length} fit and proper assessment${
                  assignments.length > 1 ? "s have" : " has"
                } been started for your applications. Complete each one for its department.`
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
        <Modal labelledBy="start-modal-title" portal={false} onClose={() => setChoosingStart(false)}>
          <h2 id="start-modal-title">Start a new application</h2>
          <p className="modal-sub">
            {drafts.length === 1
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

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setChoosingStart(false)}>
              Cancel
            </button>
          </div>
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
