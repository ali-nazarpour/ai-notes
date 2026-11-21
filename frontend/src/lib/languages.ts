/** Languages for AI translation. Must match SUPPORTED_LANGUAGES in backend/app/schemas/ai.py. */
export interface TranslationLanguage {
  code: string;
  /** Name in English and in the language itself. */
  name: string;
  native: string;
}

export const TRANSLATION_LANGUAGES: TranslationLanguage[] = [
  { code: "en", name: "English", native: "English" },
  { code: "fa", name: "Persian", native: "فارسی" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "fr", name: "French", native: "Français" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "zh", name: "Chinese (Simplified)", native: "中文" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
];

export const QUICK_LANGUAGES = ["en", "fa", "ar", "de", "fr", "es"];
export const LANGUAGE_KEY = "notes.translateLanguage";

export function translationLanguage(code: string): TranslationLanguage {
  return TRANSLATION_LANGUAGES.find((item) => item.code === code) ?? TRANSLATION_LANGUAGES[0];
}
