import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAssessment } from "../state/useAssessment";
import { getAssignment } from "../state/assignmentStore";
import AssessmentNotFound from "../components/AssessmentNotFound";
import AnswerTag from "../components/AnswerTag";
import PageHeader, { AssignmentMeta } from "../components/PageHeader";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ExternalLinkIcon,
  FileTextIcon,
} from "../components/icons";
import { evidenceUrl, hasEvidenceFile } from "../data/fixtures";
import { evidenceGaps } from "../domain/evidenceRules";
import { incompleteApplicantFields } from "../domain/applicantDetails";
import { ApplicantDetailsSummary } from "../components/ApplicantDetails";
import { evidenceFileName } from "../domain/evidenceOptions";
import { isSubmitted, recordSubmission } from "../state/caseStore";
import { routes } from "../routes";
import { readConfig } from "../state/questionConfigStore";
import { displaySection } from "../domain/sectionLabels";

export default function ReviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { getForm } = useAssessment();
  const assignment = getAssignment(id);

  if (!assignment) return <AssessmentNotFound />;

  // Submitting again would reset the case and wipe the reviewer's rulings and decision, so a
  // submitted assessment never shows this page — see the matching lock on the form.
  if (isSubmitted(assignment.id)) {
    return <Navigate to={routes.applyStatus(assignment.id)} replace />;
  }

  const form = getForm(assignment);
  const sections = Array.from(new Set(form.responses.map((r) => r.section)));
  const cv = form.cv_verification;
  const cvFile = cv?.evidence[0];
  const { missingTotal, missingIds } = evidenceGaps(form);
  const incompleteDetails = incompleteApplicantFields(form.applicant);

  return (
    <div className="page">
      <PageHeader
        title="Review and submit"
        sub={
          <>
            Check your answers before submitting. Nothing is scored until every value has been
            authenticated against your documents.
          </>
        }
      >
        <AssignmentMeta assignment={assignment} showDepartment />
      </PageHeader>

      <ApplicantDetailsSummary
        applicant={form.applicant}
        email={assignment.email}
        sub="Check these before submitting. Go back to edit to change them."
      />

      <section className="card">
        <div className="table-wrap">
          <table className="data-table review-table">
            <thead>
              <tr>
                <th scope="col">Question</th>
                <th scope="col" className="col-answer">
                  Answer
                </th>
                <th scope="col" className="col-attachment">
                  Evidence
                </th>
              </tr>
            </thead>

            {sections.map((section) => (
              <tbody key={section}>
                <tr className="review-group-row">
                  <th colSpan={3} scope="colgroup">
                    {displaySection(section)}
                  </th>
                </tr>
                {form.responses
                  .filter((r) => r.section === section)
                  .map((r) => (
                    <tr key={r.qid}>
                      <td>
                        <div className="review-question-cell">
                          <span className="qid">{r.qid}</span>
                          <p className="review-question">{r.question}</p>
                        </div>
                      </td>
                      <td>
                        <AnswerTag answer={r.answer} />
                      </td>
                      <td>
                        {!r.evidence_required ? (
                          <span className="review-evidence-none">Not required</span>
                        ) : r.evidence.length > 0 ? (
                          <span className="review-evidence-cell">
                            {r.evidence.map((file) => {
                              const fileName = evidenceFileName(file);
                              const label =
                                file.role === "supporting" ? "Supporting" : "Attached";
                              // The test pack ships a document only for each question's primary
                              // option, so anything else has nothing to open.
                              if (!hasEvidenceFile(assignment.applicantId, file.doc_type)) {
                                return (
                                  <span
                                    className="review-evidence-none"
                                    key={file.doc_type}
                                    title={fileName}
                                  >
                                    <FileTextIcon size={13} />
                                    {label}
                                  </span>
                                );
                              }
                              return (
                                <a
                                  className="review-evidence-link"
                                  key={file.doc_type}
                                  href={evidenceUrl(assignment.applicantId, fileName)}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={fileName}
                                  aria-label={`View ${fileName}`}
                                >
                                  <FileTextIcon size={13} />
                                  {label}
                                  <ExternalLinkIcon size={11} />
                                </a>
                              );
                            })}
                          </span>
                        ) : (
                          <span className="review-evidence-missing">
                            <AlertTriangleIcon size={13} />
                            Missing
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      {cv && (
        <section className="card">
          <div className="section-head section-head-static">
            <span className="section-title">Curriculum vitae</span>
            <span className="section-count">Supplementary</span>
          </div>
          <div className="review-cv">
            <span className="qid">CV</span>
            <span className="review-cv-text">Curriculum vitae</span>
            {cvFile ? (
              hasEvidenceFile(assignment.applicantId, cvFile.doc_type) ? (
                <a
                  className="review-evidence-link"
                  href={evidenceUrl(assignment.applicantId, evidenceFileName(cvFile))}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileTextIcon size={13} />
                  Attached
                  <ExternalLinkIcon size={11} />
                </a>
              ) : (
                <span className="review-evidence-none">
                  <FileTextIcon size={13} />
                  Attached
                </span>
              )
            ) : (
              <span className="review-evidence-missing">
                <AlertTriangleIcon size={13} />
                Missing
              </span>
            )}
          </div>
        </section>
      )}

      {incompleteDetails.length > 0 && (
        <div className="notice notice-warning">
          <AlertTriangleIcon size={17} />
          <div>
            <strong>
              {incompleteDetails.length} applicant detail{incompleteDetails.length > 1 ? "s" : ""}{" "}
              {incompleteDetails.length > 1 ? "need" : "needs"} attention
            </strong>{" "}
            ({incompleteDetails.join(", ")}). You can still submit — the reviewer sees what was
            provided.
          </div>
        </div>
      )}

      {missingTotal > 0 ? (
        <div className="notice notice-warning">
          <AlertTriangleIcon size={17} />
          <div>
            <strong>
              {missingTotal} mandatory document{missingTotal > 1 ? "s" : ""} not attached
            </strong>{" "}
            ({missingIds.join(", ")}). Submitting is allowed in this proof of
            concept — the engine returns an <code>EVIDENCE_MISSING</code> verdict during
            authentication.
          </div>
        </div>
      ) : (
        <div className="notice notice-good">
          <CheckCircleIcon size={17} />
          <div>
            <strong>All mandatory evidence is attached.</strong> Your submission is ready for
            authentication.
          </div>
        </div>
      )}

      <footer className="actionbar">
        <button className="btn btn-ghost" onClick={() => navigate(routes.apply(assignment.id))}>
          <ArrowLeftIcon size={15} />
          Back to edit
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            recordSubmission(
              assignment.id,
              Object.fromEntries(
                Object.entries(readConfig()).map(([qid, c]) => [qid, c.questionWeight])
              )
            );
            navigate(routes.applyStatus(assignment.id));
          }}
        >
          Submit application
          <ArrowRightIcon size={15} />
        </button>
      </footer>
    </div>
  );
}
