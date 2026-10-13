/**
 * The question catalogue as the backend serves it (the active questionnaire version and the
 * engine's evidence options). Helpers here read it; nothing about the questions is hard-coded in
 * the frontend any more.
 */
import type { Catalogue, CatalogueQuestion } from "../api/types";
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
