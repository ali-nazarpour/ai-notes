import { describe, expect, it } from "vitest";

import type { Alarm } from "../../types5";
import { nextRing, WORKDAYS_EN } from "./schedule";

const options = { dayOfMonth: (d: Date) => d.getDate(), workdays: WORKDAYS_EN };

function alarm(overrides: Partial<Alarm>): Alarm {
  return {
    id: 1,
    title: "Wake up",
    note: "",
    time: "07:00",
    date: null,
    repeat: "once",
    weekdays: [],
    enabled: true,
    sound: "chime",
    color: "indigo",
    link: null,
    last_fired_at: null,
    snoozed_until: null,
    created_at: new Date(2026, 10, 13, 22, 30).toISOString(),
    updated_at: new Date(2026, 10, 13, 22, 30).toISOString(),
    ...overrides,
  } as Alarm;
}

describe("nextRing", () => {
  it("rings a one-time alarm without a date at the next time it comes", () => {
    const now = new Date(2026, 10, 13, 22, 31);
    expect(nextRing(alarm({}), now, options)).toEqual(new Date(2026, 10, 14, 7, 0));
    const later = alarm({ time: "23:00" });
    expect(nextRing(later, now, options)).toEqual(new Date(2026, 10, 13, 23, 0));
  });

  it("does not ring a one-time alarm again once it has passed", () => {
    expect(nextRing(alarm({}), new Date(2026, 10, 14, 7, 1), options)).toBeNull();
  });

  it("rings a one-time alarm on its date", () => {
    const dated = alarm({ date: "2026-11-20" });
    expect(nextRing(dated, new Date(2026, 10, 13, 22, 31), options)).toEqual(new Date(2026, 10, 20, 7, 0));
  });
});
