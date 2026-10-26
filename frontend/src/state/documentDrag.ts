/**
 * What is being dragged across the form, so every question can say at once whether it takes it:
 * a document from "Your documents", or files from the computer. A page with questions to drop on
 * provides it with `useDocumentDragState`; a question outside one sees nothing dragged and still
 * takes a drop.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type React from "react";
import type { LibraryDocument } from "../api/types";

export interface DocumentDrag {
  /** The document from "Your documents" being dragged, if one is. */
  doc: LibraryDocument | null;
  /** Files from the computer are being dragged over the page. */
  files: boolean;
  /**
   * Counts the drags that have ended (dropped, let go, or the files taken out of the window). A
   * question marks itself as under the pointer for the current one only, so a drag ending anywhere
   * clears it without each question listening to the window itself.
   */
  session: number;
  setDoc: (doc: LibraryDocument | null) => void;
}

export const DocumentDragContext = createContext<DocumentDrag>({ doc: null, files: false, session: 0, setDoc: () => {} });

export function useDocumentDrag(): DocumentDrag {
  return useContext(DocumentDragContext);
}

/**
 * Whether a drag has really left an element: for somewhere outside it. Moving between its own parts
 * is not leaving, and nor is content changing under the pointer (a leave for nowhere); the drop, or
 * the drag ending, closes things then.
 */
export function leftFor(e: React.DragEvent): boolean {
  const to = e.relatedTarget as Node | null;
  return to !== null && !e.currentTarget.contains(to);
}

/**
 * "Under the pointer" for the current drag only: [over, setOver]. It reads false again as soon as
 * the drag ends, wherever that happens.
 */
export function useDragOver(): [boolean, (over: boolean) => void] {
  const { session } = useDocumentDrag();
  const [overIn, setOverIn] = useState<number | null>(null);
  return [overIn === session, (over) => setOverIn(over ? session : null)];
}

/** The drag state a page provides: the dragged library document, and files dragged in from the computer. */
export function useDocumentDragState(): DocumentDrag {
  const [doc, setDoc] = useState<LibraryDocument | null>(null);
  const [files, setFiles] = useState(false);
  const [session, setSession] = useState(0);
  useEffect(() => {
    // Files from the computer: dragenter and dragleave come for every element passed over, so a
    // count tells when the files have left the window.
    let depth = 0;
    const isFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes("Files"));
    const enter = (e: DragEvent) => {
      if (!isFiles(e)) return;
      depth += 1;
      setFiles(true);
    };
    const leave = (e: DragEvent) => {
      if (!isFiles(e)) return;
      depth = Math.max(0, depth - 1);
      // The count can miss a leave (one from an element removed mid-drag never reaches the
      // window), so a leave at the window's edge (the browser reports 0, 0 there) also ends it.
      const atEdge = e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight;
      if (depth === 0 || atEdge) {
        depth = 0;
        setFiles(false);
        setSession((n) => n + 1);
      }
    };
    const end = () => {
      depth = 0;
      setFiles(false);
      setDoc(null);
      setSession((n) => n + 1);
    };
    // Files let go where nothing takes them (between questions, on a question that refuses them):
    // the browser would open the file in place of the application. Places that take a drop handle
    // it first; anywhere else it is refused, and the pointer shows so.
    const over = (e: DragEvent) => {
      if (!isFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    };
    const drop = (e: DragEvent) => {
      if (isFiles(e)) e.preventDefault();
      end();
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    window.addEventListener("dragend", end);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      window.removeEventListener("dragend", end);
    };
  }, []);
  // The same value until the drag changes, so the questions reading it re-render only then.
  return useMemo(() => ({ doc, files, session, setDoc }), [doc, files, session]);
}
