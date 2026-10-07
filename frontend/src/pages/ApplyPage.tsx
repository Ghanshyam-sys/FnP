import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAssessment } from "../state/useAssessment";
import { getAssignment } from "../data/assignments";
import QuestionCard from "../components/QuestionCard";
import EvidenceBlock from "../components/EvidenceBlock";
import AssessmentNotFound from "../components/AssessmentNotFound";
import PageHeader, { AssignmentMeta } from "../components/PageHeader";
import { ArrowRightIcon, AlertTriangleIcon, ChevronDownIcon } from "../components/icons";
import { evidenceGaps, hasMissingMandatoryEvidence } from "../domain/evidenceRules";
import { buildEvidenceRef, CV_QID } from "../domain/evidenceOptions";
import { displaySection } from "../domain/sectionLabels";
import { readConfig } from "../state/questionConfigStore";
import { isSubmitted } from "../state/caseStore";
import { routes } from "../routes";
import type { Answer, EvidenceRole } from "../domain/types";

export default function ApplyPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { getForm, updateAnswer, attachEvidence, removeEvidence, attachCvEvidence, removeCvEvidence } =
    useAssessment();
  // Only sections the filer has explicitly toggled appear here; the rest fall back to the
  // default of opening the first section and leaving the others collapsed.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const assignment = getAssignment(id);

  if (!assignment) return <AssessmentNotFound />;

  // Once submitted, the form is locked: the reviewer's work is against what was submitted, and
  // the browser's Back button must not be a way to edit or resubmit underneath it.
  if (isSubmitted(assignment.id)) {
    return <Navigate to={routes.applyStatus(assignment.id)} replace />;
  }

  // Reviewer configuration reaches a filer only before they submit, which the lock above
  // guarantees; afterwards the assessment keeps the rules it was authenticated and scored against.
  const config = readConfig();

  const form = getForm(assignment);
  const sections = Array.from(new Set(form.responses.map((r) => r.section)));
  const cv = form.cv_verification;
  const { cvMissing, requiredTotal, missingTotal, missingIds } = evidenceGaps(form);

  const toggleSection = (section: string, isOpen: boolean) =>
    setOpenSections((prev) => ({ ...prev, [section]: !isOpen }));

  // The CV takes a single document, so whatever role the picker reports it is the primary.
  const handleAttachCv = (optionCode: string, _role: EvidenceRole, description?: string) => {
    const ref = buildEvidenceRef(assignment.applicantId, CV_QID, optionCode, "primary", description);
    if (ref) attachCvEvidence(assignment, ref);
  };

  const handleAttachEvidence = (
    qid: string,
    optionCode: string,
    role: EvidenceRole,
    description?: string
  ) => {
    const fileTypes = config[qid]?.fileTypes;
    const ref = buildEvidenceRef(assignment.applicantId, qid, optionCode, role, description, fileTypes);
    if (ref) attachEvidence(assignment, qid, ref);
  };

  return (
    <div className="page">
      <PageHeader
        title="Data collection"
        sub={
          <>
            {form.responses.length} questions across {sections.length} sections. Fields marked{" "}
            <span className="required-mark">*</span> are mandatory — attach supporting documents
            where they are asked for.
          </>
        }
      >
        <AssignmentMeta assignment={assignment} showDepartment />
      </PageHeader>

      {sections.map((section, index) => {
        const items = form.responses.filter((r) => r.section === section);
        const missingHere = items.filter(hasMissingMandatoryEvidence).length;
        const isOpen = openSections[section] ?? index === 0;
        const bodyId = `section-body-${index}`;

        return (
          <section className="card section" key={section}>
            <h2 className="section-head-wrap">
              <button
                className="section-head"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => toggleSection(section, isOpen)}
              >
                <span className="section-chevron">
                  <ChevronDownIcon size={15} />
                </span>
                <span className="section-title">{displaySection(section)}</span>
                {missingHere > 0 && (
                  <span className="section-flag">
                    <AlertTriangleIcon size={12} />
                    {missingHere} missing
                  </span>
                )}
                <span className="section-count">
                  {items.length} question{items.length > 1 ? "s" : ""}
                </span>
              </button>
            </h2>

            {isOpen && (
              <div className="section-body" id={bodyId}>
                {items.map((r) => (
                  <QuestionCard
                    key={r.qid}
                    response={r}
                    config={config[r.qid]}
                    onAnswerChange={(qid: string, answer: Answer) =>
                      updateAnswer(assignment, qid, answer)
                    }
                    onAttachEvidence={handleAttachEvidence}
                    onRemoveEvidence={(qid: string, docType: string) =>
                      removeEvidence(assignment, qid, docType)
                    }
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {cv && (
        <section className="card section">
          <h2 className="section-head-wrap">
            <div className="section-head section-head-static">
              <span className="section-title">Curriculum vitae</span>
              {cvMissing && (
                <span className="section-flag">
                  <AlertTriangleIcon size={12} />1 missing
                </span>
              )}
              <span className="section-count">Supplementary</span>
            </div>
          </h2>
          <div className="section-body">
            <article className="qcard">
              <div className="qcard-main">
                <div className="qcard-prompt">
                  <span className="qid">CV</span>
                  <p className="qtext">
                    Attach the applicant's curriculum vitae.
                    <span className="required-mark" aria-hidden="true">
                      *
                    </span>
                    <span className="qhint">
                      Checked against the qualification, experience and directorships established
                      by the documents above. Reviewer-facing only — it does not affect the score.
                    </span>
                  </p>
                </div>
              </div>
              <EvidenceBlock
                qid={CV_QID}
                evidence={cv.evidence}
                onAttach={handleAttachCv}
                onRemove={() => removeCvEvidence(assignment)}
              />
            </article>
          </div>
        </section>
      )}

      {missingTotal > 0 && (
        <div className="notice notice-warning">
          <AlertTriangleIcon size={17} />
          <div>
            <strong>
              {missingTotal} required document{missingTotal > 1 ? "s" : ""} not attached
            </strong>{" "}
            ({missingIds.join(", ")}). You can
            still submit — the engine will flag this during authentication.
          </div>
        </div>
      )}

      <footer className="actionbar">
        <span className="actionbar-note">
          {requiredTotal - missingTotal} of {requiredTotal} required documents attached
        </span>
        <button
          className="btn btn-primary"
          onClick={() => navigate(routes.applyReview(assignment.id))}
        >
          Continue to review
          <ArrowRightIcon size={15} />
        </button>
      </footer>
    </div>
  );
}
