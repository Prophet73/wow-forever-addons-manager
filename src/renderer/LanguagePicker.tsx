import type { Language } from "../shared/i18n";
import { api, type Run } from "./util";

const NAMES: Record<Language, string> = { ru: "Русский", en: "English" };

/** Switches the language at once, without the settings page's Save button. Labelled in both languages on purpose. */
export function LanguagePicker({ value, run }: { value: Language; run: Run }) {
  return (
    <select className="language-picker" aria-label="Язык / Language" value={value} onChange={(e) => run(() => api.saveSettings({ language: e.target.value as Language }))}>
      {(Object.keys(NAMES) as Language[]).map((l) => (
        <option key={l} value={l}>
          {NAMES[l]}
        </option>
      ))}
    </select>
  );
}
