import { describe, expect, it } from "vitest";
import { DEMO_ASSIGNMENTS } from "../data/assignments";
import { getDraft, resetDraft, saveDraft } from "./draftStore";

const assignment = DEMO_ASSIGNMENTS.find((a) => a.applicantId === "APP001")!;

describe("applicant details on drafts", () => {
  it("fills the demo details into a seeded draft", () => {
    const { applicant } = getDraft(assignment);
    expect(applicant.full_name).toBe(assignment.applicantName);
    expect(applicant.date_of_birth).toBe("1974-06-18");
    expect(applicant.nationality).toBe("Namibian");
    expect(applicant.national_id_number).toBe("74061800117");
  });

  it("fills them into a draft saved before the section existed", () => {
    const older = getDraft(assignment);
    const { nationality: _n, national_id_number: _i, phone: _p, ...withoutNew } = older.applicant;
    saveDraft(assignment.id, { ...older, applicant: withoutNew });
    expect(getDraft(assignment).applicant.phone).toBe("+264 81 000 0101");
  });

  it("keeps what the filer typed, including a field they emptied", () => {
    const draft = getDraft(assignment);
    saveDraft(assignment.id, {
      ...draft,
      applicant: { ...draft.applicant, town: "Swakopmund", nationality: "" },
    });
    const { applicant } = getDraft(assignment);
    expect(applicant.town).toBe("Swakopmund");
    expect(applicant.nationality).toBe("");
  });

  it("always takes the name and role from the assessment record", () => {
    const draft = getDraft(assignment);
    saveDraft(assignment.id, {
      ...draft,
      applicant: { ...draft.applicant, full_name: "Someone Else", proposed_role: "Chair" },
    });
    const { applicant } = getDraft(assignment);
    expect(applicant.full_name).toBe(assignment.applicantName);
    expect(applicant.proposed_role).toBe(assignment.position);
  });

  it("starts a new application with the new details empty", () => {
    const { applicant } = resetDraft(assignment);
    expect([applicant.nationality, applicant.national_id_number, applicant.phone]).toEqual(["", "", ""]);
    expect(getDraft(assignment).applicant.nationality).toBe("");
  });
});
