/**
 * Calendar systems.
 *
 * Dates are always stored as Gregorian "YYYY-MM-DD" strings. What changes with the
 * language is how they are shown and navigated: English uses the Gregorian calendar
 * (weeks start on Monday), Persian uses the Solar Hijri (Jalali) calendar (weeks start
 * on Saturday, Persian digits). Month arithmetic for Jalali uses jalaali-js; names and
 * digits come from Intl.
 *
 * ISO strings are never parsed with `new Date(string)` (that is UTC midnight and can
 * land on the previous day); they are split into numbers and built in local time.
 */
import { jalaaliMonthLength, toGregorian, toJalaali } from "jalaali-js";

import type { Language } from "../types";

export interface YearMonth {
  year: number;
  month: number; // 1-12 in the calendar's own system
}

export interface DayParts extends YearMonth {
  day: number;
}

export interface CalendarApi {
  system: "gregorian" | "jalali";
  locale: string;
  /** JS weekday (0 = Sunday) that starts the week. */
  weekStart: number;
  weekdayLabels(width: "narrow" | "short"): string[];
  parts(iso: string): DayParts;
  fromParts(year: number, month: number, day: number): string;
  daysInMonth(year: number, month: number): number;
  addMonths(value: YearMonth, delta: number): YearMonth;
  monthTitle(value: YearMonth): string;
  /** Month name alone ("March" / "فروردین"), month 1-12. */
  monthName(month: number): string;
  /** 42 ISO dates (6 weeks) covering the month, starting on weekStart. */
  monthGrid(value: YearMonth): string[];
  dayNumber(iso: string): string;
  /** "Mon, Nov 17" / "دوشنبه ۲۶ آبان" */
  shortDay(iso: string): string;
  /** "Monday, November 17" / "دوشنبه ۲۶ آبان ۱۴۰۵" */
  longDay(iso: string): string;
  /** For timestamps from the API ("2026-11-12T08:33:17Z"). */
  dateTime(timestamp: string): string;
  shortDate(timestamp: string): string;
  formatNumber(value: number): string;
}

export function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function today(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

function weekdayLabels(locale: string, weekStart: number, width: "narrow" | "short"): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: width });
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(2023, 0, 1 + ((weekStart + i) % 7))));
}

function buildGrid(firstDay: string, weekStart: number): string[] {
  const offset = (parseISODate(firstDay).getDay() - weekStart + 7) % 7;
  const start = addDays(firstDay, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function common(locale: string, calendarLocale: string) {
  const number = new Intl.NumberFormat(locale);
  const shortDay = new Intl.DateTimeFormat(calendarLocale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const longDay = new Intl.DateTimeFormat(calendarLocale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const dateTime = new Intl.DateTimeFormat(calendarLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const shortDate = new Intl.DateTimeFormat(calendarLocale, {
    month: "short",
    day: "numeric",
  });
  const month = new Intl.DateTimeFormat(calendarLocale, { month: "long", year: "numeric" });
  return {
    formatNumber: (value: number) => number.format(value),
    shortDay: (iso: string) => shortDay.format(parseISODate(iso)),
    longDay: (iso: string) => longDay.format(parseISODate(iso)),
    dateTime: (timestamp: string) => dateTime.format(new Date(timestamp)),
    shortDate: (timestamp: string) => shortDate.format(new Date(timestamp)),
    monthOf: (date: Date) => month.format(date),
  };
}

function gregorian(): CalendarApi {
  const locale = "en-US";
  const shared = common(locale, locale);
  const weekStart = 1;
  return {
    system: "gregorian",
    locale,
    weekStart,
    weekdayLabels: (width) => weekdayLabels(locale, weekStart, width),
    parts(iso) {
      const [year, month, day] = iso.split("-").map(Number);
      return { year, month, day };
    },
    fromParts: (year, month, day) => toISODate(new Date(year, month - 1, day)),
    daysInMonth: (year, month) => new Date(year, month, 0).getDate(),
    addMonths({ year, month }, delta) {
      const date = new Date(year, month - 1 + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() + 1 };
    },
    monthTitle: ({ year, month }) => shared.monthOf(new Date(year, month - 1, 1)),
    monthName: (month) =>
      new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2000, month - 1, 1)),
    monthGrid: ({ year, month }) => buildGrid(toISODate(new Date(year, month - 1, 1)), weekStart),
    dayNumber: (iso) => shared.formatNumber(Number(iso.slice(8, 10))),
    ...shared,
  };
}

const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];
// Indexed by JS weekday (0 = Sunday).
const PERSIAN_WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
const PERSIAN_WEEKDAYS_NARROW = ["ی", "د", "س", "چ", "پ", "ج", "ش"];

/**
 * Persian names are built from fixed tables rather than Intl date formatting, because
 * engines order the parts of Solar Hijri dates differently. Intl is only used for digits.
 */
function jalali(): CalendarApi {
  const locale = "fa-IR";
  const number = new Intl.NumberFormat(locale, { useGrouping: false });
  const digits = (value: number) => number.format(value);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const weekStart = 6;

  const toParts = (date: Date): DayParts => {
    const j = toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return { year: j.jy, month: j.jm, day: j.jd };
  };
  const fromParts = (year: number, month: number, day: number) => {
    const g = toGregorian(year, month, day);
    return toISODate(new Date(g.gy, g.gm - 1, g.gd));
  };
  const short = (date: Date) => {
    const p = toParts(date);
    return `${PERSIAN_WEEKDAYS[date.getDay()]} ${digits(p.day)} ${JALALI_MONTHS[p.month - 1]}`;
  };
  const dayMonthYear = (date: Date) => {
    const p = toParts(date);
    return `${digits(p.day)} ${JALALI_MONTHS[p.month - 1]} ${digits(p.year)}`;
  };

  return {
    system: "jalali",
    locale,
    weekStart,
    weekdayLabels: (width) =>
      Array.from(
        { length: 7 },
        (_, i) => (width === "narrow" ? PERSIAN_WEEKDAYS_NARROW : PERSIAN_WEEKDAYS)[(weekStart + i) % 7],
      ),
    parts: (iso) => toParts(parseISODate(iso)),
    fromParts,
    daysInMonth: (year, month) => jalaaliMonthLength(year, month),
    addMonths({ year, month }, delta) {
      const index = year * 12 + (month - 1) + delta;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    },
    monthTitle: ({ year, month }) => `${JALALI_MONTHS[month - 1]} ${digits(year)}`,
    monthName: (month) => JALALI_MONTHS[month - 1],
    monthGrid: ({ year, month }) => buildGrid(fromParts(year, month, 1), weekStart),
    dayNumber: (iso) => digits(toParts(parseISODate(iso)).day),
    shortDay: (iso) => short(parseISODate(iso)),
    longDay(iso) {
      const date = parseISODate(iso);
      return `${PERSIAN_WEEKDAYS[date.getDay()]} ${dayMonthYear(date)}`;
    },
    dateTime(timestamp) {
      const date = new Date(timestamp);
      return `${dayMonthYear(date)}، ${time.format(date)}`;
    },
    shortDate(timestamp) {
      const p = toParts(new Date(timestamp));
      return `${digits(p.day)} ${JALALI_MONTHS[p.month - 1]}`;
    },
    formatNumber: (value) => new Intl.NumberFormat(locale).format(value),
  };
}

const cache = new Map<Language, CalendarApi>();

export function calendarFor(language: Language): CalendarApi {
  let api = cache.get(language);
  if (!api) {
    api = language === "fa" ? jalali() : gregorian();
    cache.set(language, api);
  }
  return api;
}
