/** Languages for learning, text-to-speech, and small helpers for studying. */
import type { TranslationKey } from "../../i18n";
import type { LangCode } from "../../types5";

export const LANGS: { code: LangCode; label: TranslationKey; speech: string; rtl?: boolean }[] = [
  { code: "en", label: "lang.en", speech: "en-US" },
  { code: "fa", label: "lang.fa", speech: "fa-IR", rtl: true },
  { code: "de", label: "lang.de", speech: "de-DE" },
  { code: "fr", label: "lang.fr", speech: "fr-FR" },
  { code: "es", label: "lang.es", speech: "es-ES" },
  { code: "it", label: "lang.it", speech: "it-IT" },
  { code: "pt", label: "lang.pt", speech: "pt-PT" },
  { code: "ar", label: "lang.ar", speech: "ar-SA", rtl: true },
  { code: "tr", label: "lang.tr", speech: "tr-TR" },
  { code: "ru", label: "lang.ru", speech: "ru-RU" },
  { code: "zh", label: "lang.zh", speech: "zh-CN" },
  { code: "ja", label: "lang.ja", speech: "ja-JP" },
  { code: "ko", label: "lang.ko", speech: "ko-KR" },
  { code: "nl", label: "lang.nl", speech: "nl-NL" },
  { code: "hi", label: "lang.hi", speech: "hi-IN" },
];

export function lang(code: string) {
  return LANGS.find((l) => l.code === code) ?? LANGS[0];
}

export function dirOf(code: string): "rtl" | "ltr" {
  return lang(code).rtl ? "rtl" : "ltr";
}

/** Reads a text aloud with the browser's voices (works offline on most systems). */
export function speak(text: string, code: string, rate = 0.95): boolean {
  if (!("speechSynthesis" in window) || !text.trim()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const speech = lang(code).speech;
  utterance.lang = speech;
  utterance.rate = rate;
  const voice =
    synth.getVoices().find((v) => v.lang === speech) ??
    synth.getVoices().find((v) => v.lang.startsWith(speech.slice(0, 2)));
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
  return true;
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** "1m", "10m", "1d", "2.5mo" style intervals for the answer buttons. */
export function formatDelay(
  seconds: number,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  format: (n: number) => string,
): string {
  const minutes = seconds / 60;
  if (minutes < 60) return t("learn.delay.min", { n: format(Math.max(1, Math.round(minutes))) });
  const hours = minutes / 60;
  if (hours < 24) return t("learn.delay.hour", { n: format(Math.round(hours)) });
  const days = hours / 24;
  if (days < 30) return t("learn.delay.day", { n: format(Math.round(days)) });
  const months = days / 30;
  if (months < 12) return t("learn.delay.month", { n: format(Math.round(months * 10) / 10) });
  return t("learn.delay.year", { n: format(Math.round((months / 12) * 10) / 10) });
}

/** Compare a typed answer to the expected one, ignoring case, accents and punctuation. */
export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064b-\u0652]/g, "")
    .replace(/[\u064a\u0649]/g, "\u06cc")
    .replace(/\u0643/g, "\u06a9")
    .replace(/[.,!?;:"'()«»؟،؛\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein distance, to accept answers with one small typo. */
export function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

/** "exact" | "close" (a typo) | "wrong". Any of the "/" or ","-separated meanings counts. */
export function checkAnswer(typed: string, expected: string): "exact" | "close" | "wrong" {
  const answer = normalizeAnswer(typed);
  if (!answer) return "wrong";
  const options = expected
    .split(/[/,;،؛]|\bor\b|یا/)
    .map(normalizeAnswer)
    .filter(Boolean);
  if (!options.length) options.push(normalizeAnswer(expected));
  if (options.includes(answer)) return "exact";
  if (options.some((o) => distance(answer, o) <= Math.max(1, Math.floor(o.length / 6)))) return "close";
  return "wrong";
}

export function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Parses LRC lyrics ("[01:23.45] text") into timed lines; plain text gives untimed lines. */
export function parseLyrics(text: string): { time: number | null; text: string }[] {
  const lines: { time: number | null; text: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    const content = raw.replace(/\[[^\]]*\]/g, "").trim();
    if (/^\[(ar|ti|al|by|offset|length|re|ve):/i.test(raw.trim())) continue;
    if (stamps.length) {
      for (const stamp of stamps) {
        const time = Number(stamp[1]) * 60 + Number(stamp[2].replace(":", "."));
        lines.push({ time, text: content });
      }
    } else if (content) {
      lines.push({ time: null, text: content });
    }
  }
  if (lines.some((l) => l.time !== null)) lines.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  return lines.filter((l) => l.text || l.time !== null);
}

export function formatTime(seconds: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

export function youtubeId(url: string): string | null {
  const match =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url) ??
    null;
  return match ? match[1] : null;
}
