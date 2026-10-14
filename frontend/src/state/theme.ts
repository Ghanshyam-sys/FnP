/**
 * The colour theme: dark for everyone by default, or light for someone who chose it. The
 * stylesheet does the rest through <html data-theme>. Remembered per browser; storage that is
 * blocked just means the default.
 */
export type ThemeChoice = "light" | "dark";

export const DEFAULT_THEME: ThemeChoice = "dark";

const KEY = "fnpTheme";

export function readTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage blocked: the default.
  }
  return DEFAULT_THEME;
}

export function applyTheme(choice: ThemeChoice): void {
  document.documentElement.setAttribute("data-theme", choice);
}

export function saveTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Storage blocked: it still applies for this visit.
  }
  applyTheme(choice);
}
