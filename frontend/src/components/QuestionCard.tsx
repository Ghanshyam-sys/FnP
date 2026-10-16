import AnswerToggle from "./AnswerToggle";
import TextAnswer from "./TextAnswer";
import EvidenceBlock from "./EvidenceBlock";
import { answerOptions } from "../domain/catalogue";
import type { AttachHandler } from "./EvidenceBlock";
import type { CatalogueQuestion } from "../api/types";
import type { EvidenceOption } from "../domain/catalogue";
import type { Answer, EvidenceRef, ResponseItem } from "../domain/types";

export default function QuestionCard({
  response,
  question,
  options,
  defaultCode,
  labelFor,
  onAnswerChange,
  onAttach,
  onRemove,
}: {
  response: ResponseItem;
  /** The question's rules from the catalogue: answers offered, formats, supporting slot. */
  question: CatalogueQuestion;
  options: EvidenceOption[];
  defaultCode: string;
  labelFor: (file: EvidenceRef) => string;
  onAnswerChange: (answer: string) => void;
  onAttach: AttachHandler;
  onRemove: (evidenceId: string) => Promise<unknown>;
}) {
  const labelId = `q-${response.qid}-label`;

  return (
    <article className="qcard">
      <div className="qcard-main">
        <div className="qcard-prompt">
          <span className="qid">{response.qid}</span>
          <p className="qtext" id={labelId}>
            {response.question}
            <span className="required-mark" aria-hidden="true">
              *
            </span>
          </p>
        </div>
        {response.answerType !== "text" && (
          <AnswerToggle
            value={response.answer as Answer}
            options={answerOptions(question, response.answer as Answer)}
            labelledBy={labelId}
            onChange={onAnswerChange}
          />
        )}
      </div>
      {response.answerType === "text" && (
        <TextAnswer value={response.answer} labelledBy={labelId} onSave={onAnswerChange} />
      )}

      {response.evidence_required && (
        <EvidenceBlock
          qid={response.qid}
          evidence={response.evidence}
          options={options}
          defaultCode={defaultCode}
          fileTypes={question.fileTypes}
          allowSupporting={question.maxFiles > 1}
          labelFor={labelFor}
          onAttach={onAttach}
          onRemove={onRemove}
        />
      )}
    </article>
  );
}
