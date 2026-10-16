/**
 * The question catalogue as the backend serves it (the active questionnaire version and the
 * engine's evidence options). Helpers here read it; nothing about the questions is hard-coded in
 * the frontend any more.
 */
import type { Catalogue, CatalogueQuestion, Form } from "../api/types";
import type { Answer, EvidenceRef } from "./types";

/** The CV is attached like a question but sits outside the 15. */
export const CV_QID = "CV";
export const OTHER_CODE = "OTHER";

export interface EvidenceOption {
  code: string;
  label: string;
  docType: string;
}

export function question(catalogue: Catalogue, qid: string): CatalogueQuestion | undefined {
  return catalogue.questions.find((q) => q.qid === qid);
}

export function optionsFor(catalogue: Catalogue, qid: string): EvidenceOption[] {
  return (catalogue.evidenceOptions[qid] ?? []).map((o) => ({ code: o.code, label: o.label, docType: o.doc_type }));
}

/**
 * The catalogue as one form sees it: a question added here takes the document types its own
 * version gives it (the catalogue lists the latest version's), so the picker offers what an upload
 * is checked against.
 */
export function withFormOptions(catalogue: Catalogue, form: Form): Catalogue {
  const own = form.answers.filter((a) => a.evidenceOptions && a.evidenceOptions.length > 0);
  if (own.length === 0) return catalogue;
  return {
    ...catalogue,
    evidenceOptions: {
      ...catalogue.evidenceOptions,
      ...Object.fromEntries(own.map((a) => [a.qid, a.evidenceOptions ?? []])),
    },
  };
}

/** A question with a single real document type pre-selects it; otherwise the filer chooses. */
export function defaultOptionCode(catalogue: Catalogue, qid: string): string {
  const real = optionsFor(catalogue, qid).filter((o) => o.code !== OTHER_CODE);
  return real.length === 1 ? real[0].code : "";
}

/**
 * Label for an attached document. Resolved within the question's own options first, because a
 * document type can be worded differently under different questions.
 */
function labelForDocType(catalogue: Catalogue, docType: string, qid?: string): string {
  const own = qid ? optionsFor(catalogue, qid).find((o) => o.docType === docType) : undefined;
  if (own) return own.label;
  for (const options of Object.values(catalogue.evidenceOptions)) {
    const found = options.find((o) => o.doc_type === docType);
    if (found) return found.label;
  }
  return docType.replaceAll("_", " ");
}

/** "PDF", or "XLSX, CSV or PDF" — shown next to the picker so the filer knows what is allowed. */
export function formatHint(fileTypes: string[]): string {
  const formats = fileTypes.map((f) => f.toUpperCase());
  if (formats.length <= 1) return formats[0] ?? "";
  return `${formats.slice(0, -1).join(", ")} or ${formats[formats.length - 1]}`;
}

/** The upload limit when the server does not say (it always does; this is its default). */
export const DEFAULT_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const SAME_FORMAT: Record<string, string> = { jpeg: "jpg", tiff: "tif", heif: "heic" };

/**
 * Why a chosen file cannot be uploaded, before sending it: the same format and size rules the
 * server applies (and words them the same way), or null if it may be sent. The server still
 * checks everything, including what the file really contains.
 */
export function fileProblem(file: File, fileTypes: string[], maxBytes: number): string | null {
  const name = file.name.toLowerCase();
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  const allowed = new Set(fileTypes.map((f) => SAME_FORMAT[f] ?? f));
  if (!allowed.has(SAME_FORMAT[extension] ?? extension)) {
    return `This question accepts ${fileTypes.map((f) => f.toUpperCase()).join(", ")} files.`;
  }
  if (file.size > maxBytes) return `Files must be ${Math.floor(maxBytes / (1024 * 1024))} MB or smaller.`;
  if (file.size === 0) return "The file is empty.";
  return null;
}

/** "up to 15 MB" for the picker's hint. */
export function sizeHint(maxBytes: number): string {
  return `up to ${Math.floor(maxBytes / (1024 * 1024))} MB`;
}

/** The file chooser's accept list for the allowed formats. */
export function acceptAttribute(fileTypes: string[]): string {
  const extensions = new Set(fileTypes.flatMap((f) => (f === "jpg" ? ["jpg", "jpeg"] : [f])));
  return [...extensions].map((f) => `.${f}`).join(",");
}

/**
 * The answers the form offers. An answer already saved is kept selectable, so a settings change
 * can never leave a form showing an answer the filer cannot choose again.
 */
export function answerOptions(q: CatalogueQuestion, current?: Answer): Answer[] {
  const options = [...q.allowedAnswers];
  if (current && !options.includes(current)) options.push(current);
  return options;
}

/** How an attached document is described under its file name. */
export function documentLabel(catalogue: Catalogue, file: EvidenceRef, qid: string): string {
  if (file.option_code === OTHER_CODE) {
    return file.description ? `Other — ${file.description}` : "Other — please specify";
  }
  return labelForDocType(catalogue, file.doc_type, qid);
}
