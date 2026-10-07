import type { ApplicantDetails } from "../../domain/types";

type DemoDetails = Pick<ApplicantDetails, "nationality" | "national_id_number" | "phone">;

/**
 * Synthetic details for the five demo applicants, whose test-set payloads predate the
 * nationality, ID and phone fields. Fabricated for the demo: the ID numbers follow the
 * date-of-birth-first Namibian layout and every phone number sits in an unused 000 block.
 * Applied only where a draft has no value of its own.
 */
export const DEMO_APPLICANT_DETAILS: Record<string, DemoDetails> = {
  APP001: { nationality: "Namibian", national_id_number: "74061800117", phone: "+264 81 000 0101" },
  APP002: { nationality: "Namibian", national_id_number: "64031200241", phone: "+264 81 000 0102" },
  APP003: { nationality: "Namibian", national_id_number: "69110500358", phone: "+264 81 000 0103" },
  APP004: { nationality: "Namibian", national_id_number: "72012700462", phone: "+264 81 000 0104" },
  APP005: { nationality: "Namibian", national_id_number: "62093000529", phone: "+264 81 000 0105" },
};
