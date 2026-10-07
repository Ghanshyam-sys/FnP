import { describe, expect, it } from "vitest";
import { nextAssessmentId, validateNewAssessment } from "./newAssessment";
import type { NewAssessmentInput } from "./newAssessment";

const TODAY = "2026-10-06";
const valid: NewAssessmentInput = {
  applicantName: "Anna M. Nghipandulwa",
  email: "a.nghipandulwa@example.na",
  entity: "Namib Trust Bank Limited",
  position: "Non-Executive Director",
  reference: "BL-2026-0510",
  initiatedOn: "2026-10-01",
};

describe("validateNewAssessment", () => {
  it("accepts a complete assessment", () => {
    expect(validateNewAssessment(valid, ["BL-2026-0412"], TODAY)).toEqual({});
  });

  it("requires every field, ignoring surrounding spaces", () => {
    const blank = { applicantName: " ", email: "", entity: "", position: "", reference: "", initiatedOn: "" };
    expect(Object.keys(validateNewAssessment(blank, [], TODAY)).sort()).toEqual(
      ["applicantName", "email", "entity", "initiatedOn", "position", "reference"]
    );
  });

  it("checks the email format", () => {
    expect(validateNewAssessment({ ...valid, email: "not-an-email" }, [], TODAY).email).toBeDefined();
    expect(validateNewAssessment({ ...valid, email: " A.N@Example.NA " }, [], TODAY).email).toBeUndefined();
  });

  it("refuses a reference that is already assessed, whatever its case or spacing", () => {
    expect(validateNewAssessment({ ...valid, reference: " bl-2026-0412 " }, ["BL-2026-0412"], TODAY).reference)
      .toBe("An assessment already exists for this application reference.");
  });

  it("refuses an initiated date that is not real or is in the future", () => {
    const on = (initiatedOn: string) => validateNewAssessment({ ...valid, initiatedOn }, [], TODAY).initiatedOn;
    expect(on("2026-13-45")).toBe("Enter a valid date.");
    expect(on("2026-02-30")).toBe("Enter a valid date.");
    expect(on("2026-10-07")).toBe("Initiated on cannot be in the future.");
    expect(on(TODAY)).toBeUndefined();
  });
});

describe("nextAssessmentId", () => {
  it("continues past the highest serial in use", () => {
    expect(nextAssessmentId(["FNP-2026-0412", "FNP-2026-0641"], 0, "2026")).toEqual({
      id: "FNP-2026-0642",
      serial: 642,
    });
  });

  it("never reuses the serial of a removed assessment", () => {
    expect(nextAssessmentId(["FNP-2026-0412"], 650, "2026").id).toBe("FNP-2026-0651");
  });

  it("uses the year it is given", () => {
    expect(nextAssessmentId(["FNP-2026-0010"], 0, "2027").id).toBe("FNP-2027-0011");
  });
});
