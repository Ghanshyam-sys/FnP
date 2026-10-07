import { describe, expect, it } from "vitest";
import { BUILT_IN_ASSIGNMENTS, DEMO_ASSIGNMENTS } from "../data/assignments";
import {
  assignmentsForEmail,
  createAssignment,
  getAssignment,
  isCreatedAssignment,
  removeAssignment,
  reviewableAssignments,
  takenReferences,
} from "./assignmentStore";
import { readCase, recordSubmission } from "./caseStore";
import { getDraft, hasDraft, saveDraft } from "./draftStore";

const input = {
  applicantName: "Anna M. Nghipandulwa",
  email: " A.Nghipandulwa@Example.NA ",
  entity: "Namib Trust Bank Limited",
  position: "Non-Executive Director",
  reference: "BL-2026-0510",
  initiatedOn: "2026-10-01",
};

describe("assignment store", () => {
  it("returns exactly the built-in demo lists when nothing has been created", () => {
    expect(reviewableAssignments()).toBe(DEMO_ASSIGNMENTS);
    expect(getAssignment("FNP-2026-0412")?.applicantName).toBe("Johanna N. Amutenya");
    expect(assignmentsForEmail("j.amutenya@example.na")).toHaveLength(3);
  });

  it("creates an assessment every lookup can see", () => {
    const created = createAssignment(input)!;
    expect(created).toMatchObject({
      id: "FNP-2026-0642",
      email: "a.nghipandulwa@example.na",
      departmentKey: "banking",
      applicantId: "FNP-2026-0642",
      seededDraft: false,
    });
    expect(created.isDummy).toBeUndefined();
    expect(getAssignment(created.id)).toEqual(created);
    expect(assignmentsForEmail("a.nghipandulwa@example.na")).toEqual([created]);
    expect(reviewableAssignments()).toEqual([...DEMO_ASSIGNMENTS, created]);
    expect(takenReferences()).toContain("BL-2026-0510");
    expect(isCreatedAssignment(created.id)).toBe(true);
    expect(isCreatedAssignment("FNP-2026-0412")).toBe(false);
  });

  it("gives a created applicant a blank form with their name filled in", () => {
    const created = createAssignment(input)!;
    expect(hasDraft(created)).toBe(false);
    const { applicant } = getDraft(created);
    expect(applicant.full_name).toBe("Anna M. Nghipandulwa");
    expect([applicant.date_of_birth, applicant.town, applicant.nationality ?? ""]).toEqual(["", "", ""]);
  });

  it("removes a created assessment with its draft and case, and never reuses its id", () => {
    const created = createAssignment(input)!;
    saveDraft(created.id, getDraft(created));
    expect(removeAssignment(created.id)).toBe(true);
    expect(getAssignment(created.id)).toBeUndefined();
    expect(hasDraft(created)).toBe(false);
    expect(readCase(created.id).submittedAt).toBeNull();
    expect(createAssignment({ ...input, reference: "BL-2026-0511" })!.id).toBe("FNP-2026-0643");
  });

  it("refuses to remove a built-in or a submitted assessment", () => {
    expect(removeAssignment("FNP-2026-0412")).toBe(false);
    const created = createAssignment(input)!;
    recordSubmission(created.id);
    expect(removeAssignment(created.id)).toBe(false);
    expect(getAssignment(created.id)).toBeDefined();
  });

  it("leaves the built-in list untouched", () => {
    createAssignment(input);
    expect(BUILT_IN_ASSIGNMENTS.some((a) => a.reference === "BL-2026-0510")).toBe(false);
  });
});
