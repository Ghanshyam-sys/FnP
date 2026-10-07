import { describe, expect, it } from "vitest";
import { incompleteApplicantFields, validateApplicant } from "./applicantDetails";
import { todayIso } from "../utils/format";
import type { ApplicantDetails } from "./types";

const TODAY = "2026-10-06";

const complete: ApplicantDetails = {
  full_name: "Johanna N. Amutenya",
  proposed_role: "Non-Executive Director",
  date_of_birth: "1974-06-18",
  town: "Windhoek",
  nationality: "Namibian",
  national_id_number: "74061800117",
  phone: "+264 81 000 0101",
};

describe("validateApplicant", () => {
  it("accepts a complete, well-formed set of details", () => {
    expect(validateApplicant(complete, TODAY)).toEqual({});
  });

  it("requires every field except phone", () => {
    const empty = { ...complete, date_of_birth: "", town: " ", nationality: "", national_id_number: "", phone: "" };
    expect(Object.keys(validateApplicant(empty, TODAY)).sort()).toEqual(
      ["date_of_birth", "national_id_number", "nationality", "town"].sort()
    );
  });

  it("treats details missing from an older draft as empty", () => {
    const older: ApplicantDetails = { ...complete, nationality: undefined, national_id_number: undefined, phone: undefined };
    expect(Object.keys(validateApplicant(older, TODAY)).sort()).toEqual(["national_id_number", "nationality"]);
  });

  it("rejects dates that are not real, in the future, or implausibly old", () => {
    const dob = (date_of_birth: string) => validateApplicant({ ...complete, date_of_birth }, TODAY).date_of_birth;
    expect(dob("2026-02-30")).toBe("Enter a valid date.");
    expect(dob("18/06/1974")).toBe("Enter a valid date.");
    expect(dob(TODAY)).toBe("Date of birth must be in the past.");
    expect(dob("2030-01-01")).toBe("Date of birth must be in the past.");
    expect(dob("1899-12-31")).toBe("Enter a date after 1900.");
    expect(dob("2000-02-29")).toBeUndefined();
  });

  it("checks the ID number and phone formats", () => {
    expect(validateApplicant({ ...complete, national_id_number: "7406 1800" }, TODAY).national_id_number).toBeDefined();
    expect(validateApplicant({ ...complete, national_id_number: "AB12" }, TODAY).national_id_number).toBeUndefined();
    expect(validateApplicant({ ...complete, phone: "call me" }, TODAY).phone).toBeDefined();
    expect(validateApplicant({ ...complete, phone: "081-000-0101" }, TODAY).phone).toBeUndefined();
  });

  it("lists what still needs attention by label, in form order", () => {
    expect(incompleteApplicantFields({ ...complete, town: "", phone: "x" }, TODAY)).toEqual([
      "Town of residence",
      "Phone",
    ]);
  });
});

describe("todayIso", () => {
  it("formats the local date as YYYY-MM-DD", () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
