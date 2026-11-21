/**
 * Internationalization.
 *
 * - Dictionaries: en.ts is the source of truth; fa.ts must have exactly the same keys
 *   (enforced by its type), so a missing translation is a compile error.
 * - `t("key", { name })` replaces {name}; numbers are formatted in the active locale
 *   (Persian digits in Persian).
 * - `plural("notes.count", n)` picks the ".one" or ".other" form.
 * - The provider sets <html lang dir>, which switches the whole layout between LTR and RTL.
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { addDays, calendarFor, today, type CalendarApi } from "../lib/calendar";
import type { Language } from "../types";
import { en, type TranslationKey } from "./en";
import { fa } from "./fa";

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, fa };

export type Params = Record<string, string | number>;
export type PluralBase = {
  [K in TranslationKey]: K extends `${infer Base}.one` ? Base : never;
}[TranslationKey];

export const LANGUAGES: { code: Language; label: string; dir: "ltr" | "rtl" }[] = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "fa", label: "فارسی", dir: "rtl" },
];

export interface I18n {
  language: Language;
  dir: "ltr" | "rtl";
  calendar: CalendarApi;
  t: (key: TranslationKey, params?: Params) => string;
  plural: (base: PluralBase, count: number, params?: Params) => string;
  has: (key: string) => key is TranslationKey;
  /** "Today", "Tomorrow", "Yesterday" or a short date. */
  relativeDay: (iso: string) => string;
}

/** Letters with a direction of their own (Latin, Persian/Arabic) — not digits or symbols. */
const STRONG = /[A-Za-zÀ-ɏء-يٱ-ۓ]/;

/** Removes the direction marks `t()` puts around inserted words (for text that is saved). */
export function plainText(text: string): string {
  return text.replace(/[⁦-⁩]/g, "");
}

function createI18n(language: Language): I18n {
  const dictionary = dictionaries[language];
  const calendar = calendarFor(language);
  const t = (key: TranslationKey, params?: Params) => {
    let text = dictionary[key] ?? en[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        let formatted = typeof value === "number" ? calendar.formatNumber(value) : value;
        // Isolate inserted words (U+2068…U+2069) inside a longer sentence: a sentence then
        // keeps the direction of the language it is written in ("۸۲ KB از ۱۰ GB" stays
        // right-to-left), and an English or Persian name inside it shows in its own direction.
        if (STRONG.test(formatted) && text !== `{${name}}`) formatted = `⁨${formatted}⁩`;
        text = text.replaceAll(`{${name}}`, formatted);
      }
    }
    return text;
  };
  return {
    language,
    dir: language === "fa" ? "rtl" : "ltr",
    calendar,
    t,
    plural: (base, count, params) =>
      t(`${base}.${count === 1 ? "one" : "other"}` as TranslationKey, { count, ...params }),
    has: (key: string): key is TranslationKey => key in en,
    relativeDay(iso) {
      const now = today();
      if (iso === now) return t("date.today");
      if (iso === addDays(now, 1)) return t("date.tomorrow");
      if (iso === addDays(now, -1)) return t("date.yesterday");
      return calendar.shortDay(iso);
    },
  };
}

const I18nContext = createContext<I18n>(createI18n("en"));

export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  const value = useMemo(() => createI18n(language), [language]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = value.dir;
    try {
      localStorage.setItem("notes.language", JSON.stringify(language));
    } catch {
      // Not critical: only used before sign-in.
    }
  }, [language, value.dir]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}

/** Language before sign-in: the last one used on this device, else the browser's. */
export function initialLanguage(): Language {
  try {
    const stored = JSON.parse(localStorage.getItem("notes.language") ?? "null");
    if (stored === "en" || stored === "fa") return stored;
  } catch {
    // ignore
  }
  return typeof navigator !== "undefined" && navigator.language?.startsWith("fa") ? "fa" : "en";
}

export type { TranslationKey };
