/**
 * The checks the AI engine runs on a question's documents ("Document_Check", "Age_Check" ...). A
 * check typed in the question editor takes the engine's form, as the server stores it
 * (cases/catalogue.py check_name), so the editor shows and compares it as it will be saved.
 */

/** What a new question that takes documents starts with: every question with documents has them. */
export const DEFAULT_CHECKS = ["Document_Check", "Name_Check"];

/** The longest check name the server stores. */
export const CHECK_MAX = 60;

/**
 * A check as the engine names them: words capitalised and joined by underscores, ending in
 * "_Check" ("licence validity" gives "Licence_Validity_Check"). Null for text with no letters or digits.
 */
export function checkName(text: string): string | null {
  let words = text.split(/[^0-9A-Za-z]+/).filter(Boolean);
  if (words.length === 0) return null;
  if (words[words.length - 1].toLowerCase() === "check") words = words.slice(0, -1);
  return [...words.map((w) => w[0].toUpperCase() + w.slice(1)), "Check"].join("_");
}

/** A check's name in words: "Licence_Validity_Check" reads "Licence validity check" (ID stays ID). */
export function checkLabel(name: string): string {
  const [first, ...rest] = name.split("_");
  return [first, ...rest.map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase()))].join(" ");
}
