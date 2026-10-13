import { describe, expect, it } from "vitest";
import { newAssessmentFields, validateNewAssessment } from "./newAssessment";
import type { NewAssessmentInput } from "./newAssessment";

const TODAY = "2026-10-06";
const valid: NewAssessmentInput = {
  applicantName: "Anna M. Nghipandulwa",
  email: "a.nghipandulwa@example.na",
  department: "banking",
  entity: "Namib Trust Bank Limited",
  position: "Non-Executive Director",
  reference: "BL-2026-0510",
  initiatedOn: "2026-10-01",
};

describe("validateNewAssessment", () => {
  it("accepts a complete assessment", () => {
    expect(validateNewAssessment(valid, TODAY)).toEqual({});
  });

  it("requires every field, ignoring surrounding spaces", () => {
    const blank = { applicantName: " ", email: "", department: "", entity: "", position: "", reference: "", initiatedOn: "" };
    expect(Object.keys(validateNewAssessment(blank, TODAY)).sort()).toEqual(
      ["applicantName", "department", "email", "entity", "initiatedOn", "position", "reference"]
    );
  });

  it("checks the email format", () => {
    expect(validateNewAssessment({ ...valid, email: "not-an-email" }, TODAY).email).toBeDefined();
    expect(validateNewAssessment({ ...valid, email: " A.N@Example.NA " }, TODAY).email).toBeUndefined();
  });

  it("refuses an initiated date that is not real or is in the future", () => {
    const on = (initiatedOn: string) => validateNewAssessment({ ...valid, initiatedOn }, TODAY).initiatedOn;
    expect(on("2026-13-45")).toBe("Enter a valid date.");
    expect(on("2026-02-30")).toBe("Enter a valid date.");
    expect(on("2026-10-07")).toBe("Initiated on cannot be in the future.");
    expect(on(TODAY)).toBeUndefined();
  });
});

describe("an applicant starting their own application", () => {
  const fields = newAssessmentFields("applicant");

  it("is not asked for an email or a date", () => {
    expect(fields.map((f) => f.key)).toEqual(["applicantName", "department", "entity", "position", "reference"]);
    expect(validateNewAssessment({ ...valid, email: "", initiatedOn: "" }, TODAY, fields)).toEqual({});
  });

  it("must choose a department", () => {
    expect(validateNewAssessment({ ...valid, department: "" }, TODAY, fields).department).toBe("Choose a department.");
  });
});
