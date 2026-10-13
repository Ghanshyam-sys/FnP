import { useRef, useState } from "react";
import { ApiError } from "../api/client";
import { acceptAttribute, formatHint, OTHER_CODE } from "../domain/catalogue";
import { FileTextIcon, UploadIcon, XIcon } from "./icons";
import type { EvidenceOption } from "../domain/catalogue";
import type { EvidenceRef, EvidenceRole } from "../domain/types";

export type AttachHandler = (
  optionCode: string,
  role: EvidenceRole,
  file: File,
  description?: string
) => Promise<unknown>;

/** The upload's error in words the filer can act on; the backend already words its own. */
function uploadMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Too many uploads at once. Wait a moment and try again.";
    for (const field of ["file", "optionCode", "role", "qid", "description"]) {
      const message = error.field(field);
      if (message) return message;
    }
  }
  return "The document could not be uploaded. Try again.";
}

/** Why a document was not removed, in words the filer can act on. */
function removeMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return "The document was not removed: the assessment has changed in the meantime. The page now shows where it stands.";
  }
  if (error instanceof ApiError && error.status === 404) return "This document had already been removed.";
  return "The document was not removed. Check your connection and try again.";
}

/** One attached document, with its role when the question distinguishes the two. */
function AttachedRow({
  file,
  label,
  showRole,
  onRemove,
}: {
  file: EvidenceRef;
  label: string;
  showRole: boolean;
  onRemove: () => Promise<unknown>;
}) {
  const isSupporting = file.role === "supporting";
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const errorId = `evidence-remove-error-${file.id}`;

  const remove = async () => {
    setRemoving(true);
    setError("");
    try {
      await onRemove();
    } catch (err) {
      setError(removeMessage(err));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="evidence">
      <span className="evidence-icon">
        <FileTextIcon size={17} />
      </span>
      <span className="evidence-meta">
        <span className="evidence-name">
          {file.fileName}
          {showRole && (
            <span className={`evidence-role${isSupporting ? " is-supporting" : ""}`}>
              {isSupporting ? "Supporting" : "Primary"}
            </span>
          )}
        </span>
        <span className="evidence-sub">{label} · attached</span>
        {error && (
          <span className="field-error" id={errorId} role="alert">
            {error}
          </span>
        )}
      </span>
      <button
        type="button"
        className="btn-remove"
        onClick={() => void remove()}
        disabled={removing}
        aria-describedby={error ? errorId : undefined}
        aria-label={`Remove ${file.fileName}`}
        title={
          isSupporting
            ? "Remove supporting document"
            : showRole
              ? "Remove the primary document and its supporting document"
              : "Remove attachment"
        }
      >
        <XIcon size={14} />
      </button>
    </div>
  );
}

/** The document-type picker plus the attach button, used for both roles. */
function Picker({
  qid,
  role,
  options,
  defaultCode,
  fileTypes,
  onAttach,
}: {
  qid: string;
  role: EvidenceRole;
  options: EvidenceOption[];
  defaultCode: string;
  fileTypes: string[];
  onAttach: AttachHandler;
}) {
  const isSupporting = role === "supporting";
  const [optionCode, setOptionCode] = useState(() => (isSupporting ? "" : defaultCode));
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const chooser = useRef<HTMLInputElement>(null);

  const isOther = optionCode === OTHER_CODE;
  const canAttach = optionCode !== "" && (!isOther || description.trim() !== "") && !uploading;
  const selectId = `evidence-type-${role}-${qid}`;
  const describeId = `evidence-describe-${role}-${qid}`;
  const errorId = `evidence-error-${role}-${qid}`;

  const upload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      await onAttach(optionCode, role, file, isOther ? description.trim() : undefined);
      setOptionCode(isSupporting ? "" : defaultCode);
      setDescription("");
    } catch (err) {
      setError(uploadMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`evidence evidence-pending${isSupporting ? " is-supporting" : ""}`}>
      <span className="evidence-icon is-pending">
        <UploadIcon size={17} />
      </span>

      <div className="evidence-picker">
        <label className="field-label" htmlFor={selectId}>
          {isSupporting ? "Supporting document (optional)" : "Document type"}
        </label>
        <select
          id={selectId}
          className="input"
          value={optionCode}
          onChange={(e) => setOptionCode(e.target.value)}
          aria-describedby={error ? errorId : undefined}
        >
          <option value="" disabled>
            {isSupporting
              ? "Add a second document to cross-check…"
              : "Select the document you are attaching…"}
          </option>
          {options.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>

        {isOther && (
          <input
            id={describeId}
            className="input"
            type="text"
            placeholder="Describe the document you are attaching"
            aria-label="Describe the document you are attaching"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}

        {optionCode && <span className="evidence-formats">Accepts {formatHint(fileTypes)}</span>}
        {error && (
          <p className="field-error" id={errorId} role="alert">
            {error}
          </p>
        )}
      </div>

      <input
        ref={chooser}
        type="file"
        hidden
        accept={acceptAttribute(fileTypes)}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // choosing the same file again still triggers an upload
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={!canAttach}
        onClick={() => chooser.current?.click()}
      >
        {uploading ? "Uploading…" : isSupporting ? "Attach supporting" : "Attach document"}
      </button>
    </div>
  );
}

export default function EvidenceBlock({
  qid,
  evidence,
  options,
  defaultCode,
  fileTypes,
  allowSupporting,
  labelFor,
  onAttach,
  onRemove,
}: {
  qid: string;
  evidence: EvidenceRef[];
  /** The document types this question accepts, from the catalogue. */
  options: EvidenceOption[];
  /** The type to pre-select when the question has only one. */
  defaultCode: string;
  /** Formats the question accepts. */
  fileTypes: string[];
  /** Whether a second, supporting document may be added. */
  allowSupporting: boolean;
  labelFor: (file: EvidenceRef) => string;
  onAttach: AttachHandler;
  /** Settles once the document is removed; rejects if it was not, and the row says why. */
  onRemove: (evidenceId: string) => Promise<unknown>;
}) {
  const primary = evidence.filter((e) => e.role !== "supporting");
  const supporting = evidence.filter((e) => e.role === "supporting");

  if (primary.length === 0) {
    return (
      <Picker qid={qid} role="primary" options={options} defaultCode={defaultCode} fileTypes={fileTypes} onAttach={onAttach} />
    );
  }

  const remaining = allowSupporting
    ? options.filter((o) => o.code === OTHER_CODE || !evidence.some((e) => e.doc_type === o.docType))
    : [];

  return (
    <div className="evidence-list">
      {[...primary, ...supporting].map((file) => (
        <AttachedRow
          key={file.id}
          file={file}
          label={labelFor(file)}
          showRole={allowSupporting}
          onRemove={() => onRemove(file.id)}
        />
      ))}

      {allowSupporting && supporting.length === 0 && remaining.length > 0 && (
        <Picker qid={qid} role="supporting" options={remaining} defaultCode="" fileTypes={fileTypes} onAttach={onAttach} />
      )}
    </div>
  );
}
