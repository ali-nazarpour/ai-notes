/**
 * When alarms ring. Everything is computed in the browser's local time:
 * - once: on its date at its time;
 * - daily: every day;
 * - weekdays: working days (Saturday–Wednesday in Persian, Monday–Friday in English);
 * - weekly: on the chosen days of the week (0 = Sunday … 6 = Saturday);
 * - monthly: on the same day of the month as its date, in the user's calendar.
 */
import type { Alarm } from "../../types5";

export interface ScheduleOptions {
  /** Day of the month of a date in the user's calendar (Jalali in Persian). */
  dayOfMonth: (date: Date) => number;
  /** Working days, 0 = Sunday … 6 = Saturday. */
  workdays: number[];
}

export const WORKDAYS_FA = [6, 0, 1, 2, 3];
export const WORKDAYS_EN = [1, 2, 3, 4, 5];

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function at(day: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
}

/** A one-time alarm rings on its date; without a date, the first time it comes after it was made. */
function onceDay(alarm: Alarm): Date {
  if (alarm.date) return parseDate(alarm.date);
  const created = new Date(alarm.created_at);
  const day = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  if (at(day, alarm.time) <= created) day.setDate(day.getDate() + 1);
  return day;
}

function ringsOn(alarm: Alarm, day: Date, options: ScheduleOptions): boolean {
  switch (alarm.repeat) {
    case "once":
      return onceDay(alarm).toDateString() === day.toDateString();
    case "daily":
      return true;
    case "weekdays":
      return options.workdays.includes(day.getDay());
    case "weekly": {
      const days = alarm.weekdays.length ? alarm.weekdays : [new Date(alarm.created_at).getDay()];
      return days.includes(day.getDay());
    }
    case "monthly": {
      const reference = alarm.date ? parseDate(alarm.date) : new Date(alarm.created_at);
      return options.dayOfMonth(day) === options.dayOfMonth(reference);
    }
  }
}

/** The next time the alarm rings after `now` (or a pending snooze), or null. */
export function nextRing(alarm: Alarm, now: Date, options: ScheduleOptions): Date | null {
  if (!alarm.enabled) return null;
  const snooze = alarm.snoozed_until ? new Date(alarm.snoozed_until) : null;
  let best: Date | null = snooze && snooze > now ? snooze : null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < 400; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (!ringsOn(alarm, day, options)) continue;
    const time = at(day, alarm.time);
    if (time > now) {
      if (!best || time < best) best = time;
      break;
    }
  }
  return best;
}

/**
 * The ring that is due now and has not been handled yet: the latest scheduled time (or
 * snooze) that has passed, after the alarm was created or last rang, at most `window`
 * milliseconds ago (older ones were missed while the app was closed).
 */
export function dueRing(
  alarm: Alarm,
  now: Date,
  options: ScheduleOptions,
  window = 2 * 3600_000,
): Date | null {
  if (!alarm.enabled) return null;
  const handled = Math.max(
    alarm.last_fired_at ? Date.parse(alarm.last_fired_at) : 0,
    Date.parse(alarm.created_at),
  );
  const candidates: Date[] = [];
  if (alarm.snoozed_until) candidates.push(new Date(alarm.snoozed_until));
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i <= 1; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() - i);
    if (ringsOn(alarm, day, options)) candidates.push(at(day, alarm.time));
  }
  const due = candidates
    .filter(
      (c) => c.getTime() <= now.getTime() && c.getTime() > handled && now.getTime() - c.getTime() < window,
    )
    .sort((a, b) => b.getTime() - a.getTime());
  return due[0] ?? null;
}

/** "in 2 h 15 min" style countdown parts. */
export function untilParts(target: Date, now: Date): { days: number; hours: number; minutes: number } {
  const total = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60_000));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}
