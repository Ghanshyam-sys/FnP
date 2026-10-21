/**
 * The question configuration as the editor holds it, and the rules for its weights. Weights and
 * percentages are kept in hundredths, so 0.1 + 0.2 adds up to exactly 0.3.
 *
 * A section's weight is its share of 100; each question gets a percentage of its section's weight,
 * and its weight follows from that. The percentages in a section add up to 100%, and the section
 * weights to 100, so the question weights always add up to 100 too.
 */
import type { AnswerType, CatalogueQuestion, EvidenceRule, QuestionnaireVersion } from "../api/types";
import { DEFAULT_CHECKS, checkLabel } from "./checks";
import type { SectionEdit } from "../api/queries";
import { displaySection } from "./sectionLabels";
import type { Answer } from "./types";

export const ANSWERS: Answer[] = ["Yes", "No", "N/A"];
/** 100.00 in hundredths: the section weights' total, and each section's percentages' total. */
export const TOTAL = 10000;

/** The settings of a question that the reviewer edits (what "Edited" and "Undo changes" compare). */
export interface QuestionSettingsDraft {
  text: string;
  polarity: "Positive" | "Negative";
  answerType: AnswerType;
  /** Its share of the section's weight, as typed. */
  pct: string;
  allowedAnswers: Answer[];
  fileTypes: string[];
  maxFiles: 1 | 2;
  evidenceRequired: EvidenceRule;
  evidenceOptions: string[];
  /** The checks the AI engine runs on its documents, in the engine's form. */
  checks: string[];
}

/** A question as the editor holds it. */
export interface EditQuestion extends QuestionSettingsDraft {
  key: string;
  /** Its code; null for a question added in this edit (the server gives it one). */
  qid: string | null;
  /** Whether the reviewer chooses its document types (one added here); otherwise the engine's apply. */
  ownOptions: boolean;
  /** As published (null for one added now): its weight is kept exactly while nothing it depends on changes. */
  baseWeight: number | null;
  basePct: string;
  /** As published (null for one added now), to say what changing them does. */
  basePolarity: EditQuestion["polarity"] | null;
  baseAnswerType: AnswerType | null;
  /** Its settings as published, to tell an edited question and to undo the edit (null: added now). */
  original: QuestionSettingsDraft | null;
}

export interface EditSection {
  key: string;
  /** The name as shown and edited (the display name of a published section). */
  name: string;
  /** As published: the stored name, sent back unless it is renamed. */
  baseName: string | null;
  weight: string;
  baseWeight: number | null;
  baseCount: number;
  questions: EditQuestion[];
}

let nextKey = 1;
export const newKey = () => `k${nextKey++}`;

/** A number from 0 to 100 with at most two decimals, in hundredths; null otherwise. */
export function hundredths(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Math.round(Number(trimmed) * 100);
  return value <= TOTAL ? value : null;
}

/** Hundredths as the number shown and typed ("33.33", "6", "0.5"). */
export const show = (h: number) => String(h / 100);

/** A question's editable settings, on their own. */
export const settingsOf = (q: QuestionSettingsDraft): QuestionSettingsDraft => ({
  text: q.text,
  polarity: q.polarity,
  answerType: q.answerType,
  pct: q.pct,
  allowedAnswers: q.allowedAnswers,
  fileTypes: q.fileTypes,
  maxFiles: q.maxFiles,
  evidenceRequired: q.evidenceRequired,
  evidenceOptions: q.evidenceOptions,
  checks: q.checks,
});

export function fromVersion(version: QuestionnaireVersion): EditSection[] {
  return version.sections.map((s) => {
    const questions = version.questions.filter((q) => q.section === s.name);
    return {
      key: newKey(),
      name: displaySection(s.name),
      baseName: s.name,
      weight: String(s.weight),
      baseWeight: s.weight,
      baseCount: questions.length,
      questions: withWholePercentages(questions.map((q) => fromQuestion(q, s.weight))),
    };
  });
}

/**
 * Percentages rounded one by one need not add up to 100 (6, 6 and 6 of 18 read 33.33 each, 99.99
 * in all): the last question takes what is left, so a published section always reads 100%.
 */
function withWholePercentages(questions: EditQuestion[]): EditQuestion[] {
  if (questions.length === 0) return questions;
  const others = questions.slice(0, -1).reduce((sum, q) => sum + (hundredths(q.pct) ?? 0), 0);
  const rest = TOTAL - others;
  if (rest < 0) return questions;
  const last = questions[questions.length - 1];
  const fixed = {
    ...last,
    pct: show(rest),
    basePct: show(rest),
    original: last.original && { ...last.original, pct: show(rest) },
  };
  return [...questions.slice(0, -1), fixed];
}

function fromQuestion(q: CatalogueQuestion, sectionWeight: number): EditQuestion {
  const pct = sectionWeight > 0 ? String(Math.round((q.weight / sectionWeight) * 10000) / 100) : "0";
  const question: EditQuestion = {
    key: newKey(),
    qid: q.qid,
    text: q.text,
    polarity: q.polarity,
    answerType: q.answerType ?? "choice",
    pct,
    allowedAnswers: q.allowedAnswers,
    fileTypes: q.fileTypes,
    maxFiles: q.maxFiles,
    evidenceRequired: q.evidenceRequired,
    evidenceOptions: q.evidenceOptions ?? [],
    checks: q.checks ?? [],
    // A question added here names its document types (the engine has no list of its own for it).
    ownOptions: q.addedHere ?? false,
    baseWeight: q.weight,
    basePct: pct,
    basePolarity: q.polarity,
    baseAnswerType: q.answerType ?? "choice",
    original: null,
  };
  question.original = settingsOf(question);
  return question;
}

export function blankQuestion(pct = "0"): EditQuestion {
  return {
    key: newKey(),
    qid: null,
    text: "",
    polarity: "Positive",
    answerType: "choice",
    pct,
    allowedAnswers: ["Yes", "No"],
    fileTypes: ["pdf"],
    maxFiles: 1,
    evidenceRequired: "if_yes",
    evidenceOptions: [],
    checks: [...DEFAULT_CHECKS],
    ownOptions: true,
    baseWeight: null,
    basePct: pct,
    basePolarity: null,
    baseAnswerType: null,
    original: null,
  };
}

/**
 * Whether a published question's settings differ from what was published. Its share of the section
 * is not counted: the row shows it, and the section's status says whether the shares add up.
 */
export function isEdited(q: EditQuestion): boolean {
  if (!q.original) return false;
  const now = settingsOf(q);
  const was = q.original;
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  return (
    now.text.trim() !== was.text.trim() ||
    now.polarity !== was.polarity ||
    now.answerType !== was.answerType ||
    now.maxFiles !== was.maxFiles ||
    now.evidenceRequired !== was.evidenceRequired ||
    !sameSet(now.allowedAnswers, was.allowedAnswers) ||
    !sameSet(now.fileTypes, was.fileTypes) ||
    !sameSet(now.evidenceOptions, was.evidenceOptions) ||
    !sameSet(now.checks, was.checks)
  );
}

/**
 * The question's settings put back as published (its place in the editor kept). Its share of the
 * section stays as it is now, so the section's percentages still add up.
 */
export function undoEdits(q: EditQuestion): EditQuestion {
  return q.original ? { ...q, ...q.original, pct: q.pct } : q;
}

/**
 * Each question's weight, in hundredths, from the section's weight and the percentages. While
 * nothing they depend on has changed, the published weights stand as they are. Null while a number
 * is not valid.
 */
export function weightsOf(section: EditSection): number[] | null {
  const sw = hundredths(section.weight);
  const pcts = section.questions.map((q) => hundredths(q.pct));
  if (sw === null || pcts.some((p) => p === null)) return null;
  const untouched =
    section.baseWeight !== null &&
    sw === Math.round(section.baseWeight * 100) &&
    section.questions.length === section.baseCount &&
    section.questions.every((q) => q.baseWeight !== null && q.pct === q.basePct);
  if (untouched) return section.questions.map((q) => Math.round((q.baseWeight ?? 0) * 100));
  if (pctTotal(section) !== TOTAL) return pcts.map((p) => Math.round((sw * (p ?? 0)) / TOTAL));
  return shareOut(sw, pcts.map((p) => p ?? 0));
}

/**
 * A total shared out by percentages exactly (largest remainder): each gets its share rounded down,
 * and the hundredths left go to those with the biggest fractions, so the shares add up to the
 * total and none is ever below 0.
 */
function shareOut(total: number, pcts: number[]): number[] {
  const exact = pcts.map((p) => (total * p) / TOTAL);
  const shares = exact.map(Math.floor);
  let left = total - shares.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    shares[i] += 1;
    left -= 1;
  }
  return shares;
}

export function pctTotal(section: EditSection): number | null {
  const pcts = section.questions.map((q) => hundredths(q.pct));
  return pcts.some((p) => p === null) ? null : pcts.reduce<number>((a, b) => a + (b ?? 0), 0);
}

/** 100 split evenly into `count` parts, in hundredths: the last takes what is left (33.33, 33.33, 33.34). */
export function evenSplit(count: number): number[] {
  if (count <= 0) return [];
  const each = Math.floor(TOTAL / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? TOTAL - each * (count - 1) : each));
}

/** What is left to share (positive), or how much over (negative), in hundredths; null if a value is not valid. */
export function remainder(values: string[]): number | null {
  const parsed = values.map(hundredths);
  if (parsed.some((v) => v === null)) return null;
  return TOTAL - parsed.reduce<number>((a, b) => a + (b ?? 0), 0);
}

/** A plain account of how much of 100 is shared out. */
export function shareStatus(left: number | null, unit: string): { tone: "ok" | "short" | "over" | "invalid"; text: string } {
  if (left === null) return { tone: "invalid", text: "Enter each value as a number from 0 to 100, with at most two decimals" };
  if (left === 0) return { tone: "ok", text: "All assigned" };
  if (left > 0) return { tone: "short", text: `${show(left)}${unit} left to assign` };
  return { tone: "over", text: `${show(-left)}${unit} over — reduce one by ${show(-left)}${unit}` };
}

/** What is wrong with a question's settings, if anything. */
export function questionProblem(q: EditQuestion): string | null {
  if (!q.text.trim()) return "Enter the question.";
  if (hundredths(q.pct) === null) return "Enter a percentage from 0 to 100, with at most two decimals.";
  if (q.answerType === "choice" && q.allowedAnswers.length === 0) return "Choose at least one answer option.";
  if (q.evidenceRequired !== "never" && q.fileTypes.length === 0) return "Choose at least one accepted file type.";
  if (q.ownOptions && q.evidenceRequired !== "never" && q.evidenceOptions.length === 0) {
    return "Choose the document types this question takes.";
  }
  return null;
}

const RULES: Record<EvidenceRule, string> = {
  always: "Document always",
  if_yes: "Document if Yes",
  never: "No document",
};

/** A question's settings in a line: "Negative · Yes / No · Document if Yes · PDF, XLSX · up to 2 files". */
export function summaryLine(q: QuestionSettingsDraft): string {
  const parts: string[] = [q.polarity];
  parts.push(q.answerType === "text" ? "Text answer" : ANSWERS.filter((a) => q.allowedAnswers.includes(a)).join(" / "));
  parts.push(RULES[q.evidenceRequired]);
  if (q.evidenceRequired !== "never") {
    parts.push(q.fileTypes.map((t) => t.toUpperCase()).join(", "));
    parts.push(q.maxFiles === 2 ? "up to 2 files" : "1 file");
    if (q.checks.length > 0) parts.push(q.checks.length === 1 ? "1 check" : `${q.checks.length} checks`);
  }
  return parts.join(" · ");
}

/** The questionnaire in the shape the server takes it. */
export function toBody(sections: EditSection[]): SectionEdit[] {
  return sections.map((s) => {
    const weights = weightsOf(s) ?? s.questions.map(() => 0);
    const takesDocs = (q: EditQuestion) => q.evidenceRequired !== "never";
    return {
      name: s.baseName !== null && s.name.trim() === displaySection(s.baseName) ? s.baseName : s.name.trim(),
      weight: (hundredths(s.weight) ?? 0) / 100,
      questions: s.questions.map((q, i) => ({
        qid: q.qid,
        text: q.text.trim(),
        polarity: q.polarity,
        answerType: q.answerType,
        weight: weights[i] / 100,
        allowedAnswers: q.answerType === "text" ? [] : ANSWERS.filter((a) => q.allowedAnswers.includes(a)),
        fileTypes: takesDocs(q) ? q.fileTypes : [],
        maxFiles: takesDocs(q) ? q.maxFiles : 1,
        evidenceRequired: q.evidenceRequired,
        evidenceOptions: q.ownOptions && takesDocs(q) ? q.evidenceOptions : [],
        // Checks are run on its documents: none for a question that takes none.
        checks: takesDocs(q) ? q.checks : [],
      })),
    };
  });
}

// ---- What an edit changes, for the summary shown before applying it ---------------------------

/** What a change reaches on the applications not yet submitted (read when about to apply). */
export interface DraftUse {
  /** How many forms not yet submitted there are. */
  drafts: number;
  /** For each question, how many of them have an answer saved for it. */
  answered: Record<string, number>;
  /** For each question, how many of them have a document attached to it. */
  documents: Record<string, number>;
}

const apps = (n: number) => `${n} unsubmitted application${n === 1 ? "" : "s"}`;

/**
 * What applying removes for a question from the applications not yet submitted, as the end of its
 * line: its saved answers, and its documents (all of them, or those not backed by a Yes when it now
 * takes one only for a Yes). Empty when it removes nothing of that kind.
 */
function loss(use: DraftUse | null, qid: string, answers: boolean, documents: "all" | "unless-yes" | "none"): string {
  if (!answers && documents === "none") return "";
  if (!use) {
    const what = [
      answers && "saved answers",
      documents === "all" && "attached documents",
      documents === "unless-yes" && "documents attached where the answer is not Yes",
    ].filter(Boolean);
    return ` — ${what.join(" and ")} on unsubmitted applications are removed`;
  }
  const a = use.answered[qid] ?? 0;
  const d = use.documents[qid] ?? 0;
  const parts: string[] = [];
  if (answers && a > 0) parts.push(`saved answers on ${apps(a)}`);
  if (documents === "all" && d > 0) parts.push(`documents attached on ${apps(d)}`);
  if (documents === "unless-yes" && d > 0) parts.push(`documents attached on up to ${apps(d)} (where the answer is not Yes)`);
  return parts.length > 0
    ? ` — ${parts.join(" and ")} are removed`
    : " — no unsubmitted application has anything saved for it";
}

const short = (text: string) => (text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text);

/**
 * The changes an edit makes to the questionnaire in force, in plain lines, most telling first:
 * sections added, deleted, renamed or reweighted, then each question added, deleted or changed.
 */
export function changeSummary(published: QuestionnaireVersion, edited: SectionEdit[], use: DraftUse | null): string[] {
  const lines: string[] = [];
  const before = new Map(published.sections.map((s) => [s.name, s]));
  const after = new Map(edited.map((s) => [s.name, s]));
  const beforeQ = new Map(published.questions.map((q) => [q.qid, q]));
  const afterQ = new Map(edited.flatMap((s) => s.questions.filter((q) => q.qid).map((q) => [q.qid as string, { ...q, section: s.name }])));

  // Sections: matched by name, or by holding the same questions when renamed.
  const sectionOf = (qid: string) => beforeQ.get(qid)?.section;
  const renamedFrom = new Map<string, string>();
  for (const s of edited) {
    if (before.has(s.name)) continue;
    const from = s.questions.map((q) => (q.qid ? sectionOf(q.qid) : undefined)).find((n) => n && !after.has(n));
    if (from) renamedFrom.set(s.name, from);
  }
  const renamedTo = new Set(renamedFrom.values());
  for (const s of edited) {
    const fromName = before.has(s.name) ? s.name : renamedFrom.get(s.name);
    const was = fromName ? before.get(fromName) : undefined;
    if (!was) {
      lines.push(`Section "${displaySection(s.name)}" added, weight ${s.weight} of 100`);
      continue;
    }
    if (fromName !== s.name) lines.push(`Section "${displaySection(fromName as string)}" renamed "${displaySection(s.name)}"`);
    if (was.weight !== s.weight) lines.push(`${displaySection(s.name)}: weight ${was.weight} → ${s.weight} of 100`);
  }
  for (const s of published.sections) {
    if (after.has(s.name) || renamedTo.has(s.name)) continue;
    const held = published.questions
      .filter((q) => q.section === s.name)
      .map((q) => {
        const a = use?.answered[q.qid] ?? 0;
        const d = use?.documents[q.qid] ?? 0;
        const what = [a > 0 && `${a} answer${a === 1 ? "" : "s"}`, d > 0 && `${d} with documents`].filter(Boolean);
        return what.length > 0 ? `${q.qid}: ${what.join(", ")}` : null;
      })
      .filter(Boolean);
    const impact = !use
      ? " — saved answers and documents for them on unsubmitted applications are removed"
      : held.length === 0
        ? " — no unsubmitted application has anything saved for them"
        : ` — removed from unsubmitted applications (${held.join("; ")})`;
    lines.push(`Section "${displaySection(s.name)}" deleted, with its questions${impact}`);
  }

  // Questions.
  for (const s of edited) {
    for (const q of s.questions) {
      if (!q.qid) lines.push(`New question in ${displaySection(s.name)}: "${short(q.text || "(no text yet)")}", ${q.weight} of 100`);
    }
  }
  for (const [qid, was] of beforeQ) {
    const now = afterQ.get(qid);
    if (!now) {
      // Deleted with its section: already said above.
      const sectionGone = !after.has(was.section) && !renamedTo.has(was.section);
      if (!sectionGone) lines.push(`${qid} deleted${loss(use, qid, true, "all")}`);
      continue;
    }
    const changes: string[] = [];
    if (now.text.trim() !== was.text.trim()) changes.push("question text edited");
    if (now.polarity !== was.polarity) changes.push(`polarity ${was.polarity} → ${now.polarity}`);
    const retyped = now.answerType !== (was.answerType ?? "choice");
    if (retyped) {
      // Its saved answers no longer fit; a document stays only where it is still always taken.
      const to = now.answerType === "text" ? "a Text question" : "a Yes / No question";
      changes.push(`now ${to}${loss(use, qid, true, now.evidenceRequired === "always" ? "none" : "all")}`);
    } else if (now.answerType === "choice" && now.allowedAnswers.join() !== ANSWERS.filter((a) => was.allowedAnswers.includes(a)).join()) {
      changes.push(`answer options ${now.allowedAnswers.join(" / ")}`);
    }
    if (now.evidenceRequired !== was.evidenceRequired) {
      // Documents a question no longer asks for come off the applications (said with the type change
      // above when it was retyped).
      const documents = retyped || now.evidenceRequired === "always" ? "none" : now.evidenceRequired === "never" ? "all" : "unless-yes";
      changes.push(`${RULES[now.evidenceRequired].toLowerCase()}${loss(use, qid, false, documents)}`);
    }
    if (now.evidenceRequired !== "never") {
      if ([...now.fileTypes].sort().join() !== [...was.fileTypes].sort().join()) changes.push(`file types ${now.fileTypes.map((t) => t.toUpperCase()).join(", ")}`);
      if (now.maxFiles !== was.maxFiles) changes.push(now.maxFiles === 2 ? "up to 2 files" : "1 file");
      if ([...now.evidenceOptions].sort().join() !== [...(was.evidenceOptions ?? [])].sort().join()) changes.push("document types changed");
      const wasChecks = was.checks ?? [];
      const added = now.checks.filter((c) => !wasChecks.includes(c));
      const dropped = wasChecks.filter((c) => !now.checks.includes(c));
      if (added.length > 0) changes.push(`checks added: ${added.map(checkLabel).join(", ")}`);
      if (dropped.length > 0) changes.push(`checks removed: ${dropped.map(checkLabel).join(", ")}`);
    }
    if (now.weight !== was.weight) changes.push(`weight ${was.weight} → ${now.weight} of 100`);
    if (changes.length > 0) lines.push(`${qid}: ${changes.join("; ")}`);
  }
  return lines;
}
