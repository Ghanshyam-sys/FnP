/** What is attached to a question: a new file (which also goes into "Your documents"), or one already there. */
export type AttachSource = File | { documentId: string };

/** The drag data a document from "Your documents" carries: its id. */
export const DOCUMENT_DRAG = "application/x-fnp-document";

/** The upload's fields for a source: the file, or the library document's id. */
export function sourceFields(source: AttachSource): { file: File } | { documentId: string } {
  return source instanceof File ? { file: source } : { documentId: source.documentId };
}
