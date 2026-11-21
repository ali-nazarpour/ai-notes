import { describe, expect, it } from "vitest";

import { addDays, calendarFor, parseISODate, toISODate } from "./calendar";

describe("Jalali calendar (Persian)", () => {
  const fa = calendarFor("fa");

  it("converts Nowruz 1404 to 2025-03-21 and back", () => {
    expect(fa.fromParts(1404, 1, 1)).toBe("2025-03-21");
    expect(fa.parts("2025-03-21")).toMatchObject({ year: 1404, month: 1, day: 1 });
  });

  it("starts weeks on Saturday", () => {
    expect(fa.weekStart).toBe(6);
    const grid = fa.monthGrid({ year: 1404, month: 1 });
    expect(grid).toHaveLength(42);
    expect(parseISODate(grid[0]).getDay()).toBe(6);
    expect(grid).toContain("2025-03-21");
  });

  it("uses Persian digits and month names", () => {
    expect(fa.dayNumber("2025-03-21")).toBe("۱");
    expect(fa.monthTitle({ year: 1404, month: 1 })).toBe("فروردین ۱۴۰۴");
    expect(fa.formatNumber(1234)).toMatch(/^[۰-۹٬,]+$/);
  });

  it("knows month lengths, including Esfand in leap years", () => {
    expect(fa.daysInMonth(1404, 1)).toBe(31);
    expect(fa.daysInMonth(1404, 7)).toBe(30);
    expect(fa.daysInMonth(1403, 12)).toBe(30); // 1403 is a leap year
    expect(fa.daysInMonth(1404, 12)).toBe(29);
  });

  it("moves across years with addMonths", () => {
    expect(fa.addMonths({ year: 1404, month: 12 }, 1)).toEqual({ year: 1405, month: 1 });
    expect(fa.addMonths({ year: 1404, month: 1 }, -1)).toEqual({ year: 1403, month: 12 });
  });
});

describe("Gregorian calendar (English)", () => {
  const en = calendarFor("en");

  it("starts weeks on Monday and has a 6-week grid", () => {
    expect(en.weekStart).toBe(1);
    const grid = en.monthGrid({ year: 2026, month: 11 });
    expect(grid).toHaveLength(42);
    expect(parseISODate(grid[0]).getDay()).toBe(1);
  });

  it("formats month titles", () => {
    expect(en.monthTitle({ year: 2026, month: 11 })).toBe("November 2026");
  });
});

describe("ISO date helpers", () => {
  it("round-trips local dates and adds days across months", () => {
    expect(toISODate(parseISODate("2026-02-28"))).toBe("2026-02-28");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});
