// Translation. The Russian text is its own key: code reads as before, and a phrase with no
// translation shows in Russian instead of breaking. Each process (main, renderer) keeps its
// current language and switches it when the setting changes.

import { EN, EN_PLURALS } from "./i18n.en";

export type Language = "ru" | "en";

let current: Language = "ru";

export function setLanguage(language: Language): void {
  current = language;
}

export function language(): Language {
  return current;
}

/** The phrase in the current language; "{name}" placeholders are filled from `params`. */
export function t(ru: string, params?: Record<string, string | number>): string {
  const text = current === "en" ? (EN[ru] ?? ru) : ru;
  return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : text;
}

/** Noun form for `n`: Russian has three forms, English two (looked up by the Russian `one`). */
export function plural(n: number, one: string, few: string, many: string): string {
  if (current === "en") {
    const forms = EN_PLURALS[one];
    if (forms) return n === 1 ? forms[0] : forms[1];
  }
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** BCP 47 tag for dates and numbers. */
export function locale(): string {
  return current === "en" ? "en-GB" : "ru-RU";
}
