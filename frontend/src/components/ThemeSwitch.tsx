import { useState } from "react";
import { readTheme, saveTheme, type ThemeChoice } from "../state/theme";
import { MoonIcon, SunIcon } from "./icons";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light theme", Icon: SunIcon },
  { value: "dark", label: "Dark theme", Icon: MoonIcon },
];

/** Light / Dark: two small buttons, the theme in use pressed (dark until someone picks light). */
export default function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);

  return (
    <div className="theme-switch" role="group" aria-label="Colour theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          className={`theme-option${choice === value ? " is-on" : ""}`}
          aria-pressed={choice === value}
          aria-label={label}
          title={label}
          onClick={() => {
            saveTheme(value);
            setChoice(value);
          }}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
