import { describe, expect, it } from "vitest";
import { documentRuleBreaks } from "./evidenceRules";
import type { Form } from "../api/types";

const evidence = (qid: string, fileName: string) => ({
  id: `${qid}-${fileName}`,
  qid,
  optionCode: "X",
  docType: "document",
  role: "primary" as const,
  description: "",
  fileName,
  sizeBytes: 1,
  uploadedAt: "2026-10-12T10:00:00Z",
  url: "#",
});

const form = (answers: Form["answers"], files: Form["evidence"]): Form => ({
  locked: false,
  applicant: {} as Form["applicant"],
  answers,
  evidence: files,
});

const answer = (qid: string, fileTypes: string[], maxFiles: 1 | 2) => ({
  qid,
  value: "Yes" as const,
  evidenceRequired: true,
  evidenceRule: "always" as const,
  allowedAnswers: ["Yes" as const, "No" as const],
  fileTypes,
  maxFiles,
});

describe("documentRuleBreaks", () => {
  it("passes documents within the question settings, counting .jpeg as jpg", () => {
    const f = form([answer("A1", ["pdf", "jpg"], 2)], [evidence("A1", "id.PDF"), evidence("A1", "scan.jpeg")]);
    expect(documentRuleBreaks(f, ["pdf", "docx"])).toEqual([]);
  });

  it("names a withdrawn format and a question now taking fewer files", () => {
    const f = form(
      [answer("PC1", ["png"], 1)],
      [evidence("PC1", "clearance.pdf"), evidence("PC1", "court-order.pdf")]
    );
    expect(documentRuleBreaks(f, ["pdf"])).toEqual(["PC1 (only 1 document allowed)", "PC1 (.pdf no longer accepted)"]);
  });

  it("checks the CV against the CV formats", () => {
    expect(documentRuleBreaks(form([], [evidence("CV", "cv.txt")]), ["pdf", "docx"])).toEqual(["CV (.txt no longer accepted)"]);
  });
});
