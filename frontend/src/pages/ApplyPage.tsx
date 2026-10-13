import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useRemoveEvidence, useSaveForm, useUploadEvidence } from "../api/queries";
import type { SaveRefusal } from "../api/queries";
import { ApiError } from "../api/client";
import { APPLICANT_API_FIELD } from "../api/adapt";
import { useApplication } from "../api/useApplication";
import QuestionCard from "../components/QuestionCard";
import EvidenceBlock from "../components/EvidenceBlock";
import PageHeader, { AssignmentMeta } from "../components/PageHeader";
import { ApplicantDetailsDone, ApplicantDetailsSection } from "../components/ApplicantDetails";
import { Loading, LoadError } from "../components/LoadState";
import { ArrowRightIcon, AlertTriangleIcon, ChevronDownIcon } from "../components/icons";
import { documentRuleBreaks, evidenceGaps, hasMissingMandatoryEvidence } from "../domain/evidenceRules";
import { CV_QID, defaultOptionCode, documentLabel, optionsFor, question } from "../domain/catalogue";
import { displaySection } from "../domain/sectionLabels";
import { APPLICANT_FIELDS, incompleteApplicantFields } from "../domain/applicantDetails";
import { routes } from "../routes";
import type { EditableApplicantField } from "../domain/applicantDetails";
import type { Answer, EvidenceRole } from "../domain/types";

type RefusedDetails = Partial<Record<EditableApplicantField, { value: string; message: string }>>;

/** The server's reason for refusing one applicant detail, if it named that detail. */
function detailRefusal(error: unknown, field: EditableApplicantField): string | undefined {
  return error instanceof ApiError && error.status === 400
    ? error.field(`applicant.${APPLICANT_API_FIELD[field]}`)
    : undefined;
}

/** What the banner says about a refused save. */
function refusalText(refusal: SaveRefusal): string {
  const { error, changes } = refusal;
  if (!(error instanceof ApiError) || error.status >= 500) return "Check your connection and make the change again.";
  if (error.status === 400) {
    // A detail the server would not accept: its reason is also shown under the field.
    for (const def of APPLICANT_FIELDS) {
      const message = def.readOnly ? undefined : detailRefusal(error, def.key as EditableApplicantField);
      if (message) return `${def.label}: ${message}`;
    }
    if (Object.keys(changes.answers ?? {}).some((qid) => error.field(`answers.${qid}`))) {
      return "The question's options have changed; the form now shows the current ones. Make the change again.";
    }
  }
  return error.message;
}

export default function ApplyPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const data = useApplication(id);
  const { save, refusal } = useSaveForm(id);
  const upload = useUploadEvidence(id);
  const remove = useRemoveEvidence(id);
  // Only sections the filer has explicitly toggled appear here; the rest fall back to the
  // default of opening the first section and leaving the others collapsed.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [refusedDetails, setRefusedDetails] = useState<RefusedDetails>({});
  // Data collection is two steps: the applicant details, then the questions. Null until the form
  // has loaded; then a filer whose details are already complete starts at the questions.
  const [detailsDone, setDetailsDone] = useState<boolean | null>(null);

  if (data.status === "loading") return <Loading />;
  if (data.status === "error") return <LoadError error={data.error} onRetry={data.retry} />;
  const { assessment, catalogue, raw, form } = data;

  // Once submitted, the form is locked: the reviewer's work is against what was submitted, and
  // the browser's Back button must not be a way to edit or resubmit underneath it.
  if (raw.locked) return <Navigate to={routes.applyStatus(assessment.id)} replace />;

  // Complete as saved, and nothing refused. The questions only show while this holds, so a detail
  // the server refuses after the filer moved on brings the details card back, with the reason
  // under the field (the server keeps the previous value, which may itself be complete).
  const detailsComplete = incompleteApplicantFields(form.applicant).length === 0;
  const detailRefused = Object.values(refusedDetails).some(Boolean);
  if (detailsDone === null) setDetailsDone(detailsComplete);
  const showQuestions = (detailsDone ?? detailsComplete) && detailsComplete && !detailRefused;
  // Continue is only usable once no box still holds a refused value, so any refusal left is one
  // the filer has typed over.
  const continueToQuestions = () => {
    setRefusedDetails({});
    setDetailsDone(true);
  };

  const sections = Array.from(new Set(form.responses.map((r) => r.section)));
  // The question's text and options come from the catalogue; the rules it is checked against
  // come from the form, which is always current (the catalogue may be a few minutes old).
  // The form only lists questions both have (see toApplicationForm), so neither lookup misses;
  // a question that somehow did is left out rather than taking the page down.
  const rules = new Map(raw.answers.map((a) => [a.qid, a]));
  const questionFor = (qid: string) => {
    const rule = rules.get(qid);
    const text = question(catalogue, qid);
    if (!rule || !text) return undefined;
    return { ...text, allowedAnswers: rule.allowedAnswers, fileTypes: rule.fileTypes, maxFiles: rule.maxFiles };
  };

  const saveDetail = (field: EditableApplicantField, value: string) => {
    setRefusedDetails((prev) => ({ ...prev, [field]: undefined }));
    save({ applicant: { [APPLICANT_API_FIELD[field]]: value } }).catch((error: unknown) => {
      const message = detailRefusal(error, field);
      if (message) setRefusedDetails((prev) => ({ ...prev, [field]: { value, message } }));
    });
  };
  // The banner reports a refused answer; useSaveForm already reloads the form after it.
  const saveAnswer = (qid: string, answer: Answer) => save({ answers: { [qid]: answer } }).catch(() => {});
  const cv = form.cv_verification;
  const { cvMissing, requiredTotal, missingTotal, missingIds } = evidenceGaps(form);
  const ruleBreaks = documentRuleBreaks(raw, catalogue.cvFileTypes);

  const toggleSection = (section: string, isOpen: boolean) =>
    setOpenSections((prev) => ({ ...prev, [section]: !isOpen }));

  const attach = (qid: string) => (optionCode: string, role: EvidenceRole, file: File, description?: string) =>
    upload.mutateAsync({ qid, optionCode, role, file, description });

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
        <AssignmentMeta assignment={assessment} showDepartment />
      </PageHeader>

      {/* Kept mounted while the questions show, so anything typed into it survives an Edit. */}
      <div hidden={showQuestions}>
        <ApplicantDetailsSection
          applicant={form.applicant}
          email={assessment.applicantEmail}
          refused={refusedDetails}
          onSave={saveDetail}
          onContinue={continueToQuestions}
        />
      </div>
      {showQuestions && <ApplicantDetailsDone applicant={form.applicant} onEdit={() => setDetailsDone(false)} />}

      {refusal && (
        <div className="notice notice-critical" role="alert">
          <AlertTriangleIcon size={17} />
          <div>
            <strong>Your last change was not saved.</strong> {refusalText(refusal)}
          </div>
        </div>
      )}

      {/* Step 2: the questions, once the details are complete. */}
      {showQuestions && (
        <>
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
                  {items.map((r) => {
                    const q = questionFor(r.qid);
                    return (
                      q && (
                        <QuestionCard
                          key={r.qid}
                          response={r}
                          question={q}
                          options={optionsFor(catalogue, r.qid)}
                          defaultCode={defaultOptionCode(catalogue, r.qid)}
                          labelFor={(file) => documentLabel(catalogue, file, r.qid)}
                          onAnswerChange={(answer) => saveAnswer(r.qid, answer)}
                          onAttach={attach(r.qid)}
                          onRemove={remove.mutateAsync}
                        />
                      )
                    );
                  })}
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
                  options={optionsFor(catalogue, CV_QID)}
                  defaultCode={defaultOptionCode(catalogue, CV_QID)}
                  fileTypes={catalogue.cvFileTypes}
                  allowSupporting={false}
                  labelFor={(file) => documentLabel(catalogue, file, CV_QID)}
                  onAttach={attach(CV_QID)}
                  onRemove={remove.mutateAsync}
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
              ({missingIds.join(", ")}). Attach{" "}
              {missingTotal > 1 ? "them" : "it"} before submitting.
            </div>
          </div>
        )}

        {ruleBreaks.length > 0 && (
          <div className="notice notice-warning">
            <AlertTriangleIcon size={17} />
            <div>
              <strong>Replace documents that no longer meet the question settings</strong> (
              {ruleBreaks.join("; ")}). The settings changed after they were attached; remove each
              and attach it again in an accepted format.
            </div>
          </div>
        )}

        <footer className="actionbar">
          <span className="actionbar-note">
            {requiredTotal - missingTotal} of {requiredTotal} required documents attached
          </span>
          <button
            className="btn btn-primary"
            onClick={() => navigate(routes.applyReview(assessment.id))}
          >
            Continue to review
            <ArrowRightIcon size={15} />
          </button>
        </footer>
        </>
      )}
    </div>
  );
}
