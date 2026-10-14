import type { FinalAssessment } from "../api/types";

/** One concern from the AI engine's written assessment. */
export type Concern = NonNullable<FinalAssessment["concerns"]>[number];

/** A key for a concern: its condition's id, or failing that its question and place in the list. */
export const concernKey = (c: Concern, index: number) => c.condition_id ?? `${c.qid}-${index}`;
