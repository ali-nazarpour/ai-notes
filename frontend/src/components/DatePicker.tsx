/**
 * Date pickers that follow the language: a Jalali (Solar Hijri) calendar in Persian and a
 * Gregorian one in English. They replace the browser's <input type="date">, which is
 * always Gregorian. Values are always Gregorian "YYYY-MM-DD" strings (or null).
 *
 * - MonthGrid: the calendar itself. Clicking the title switches to a month list, then to
 *   a year list, so far-away dates (e.g. a birth date) are a few clicks away.
 * - DatePicker: a small chip with quick choices (today, tomorrow, next week).
 * - DateInput: a form field (like an input) for dates such as a birth date.
 */
import { useRef, useState } from "react";

import { useDismiss } from "../hooks/useDismiss";
import { useI18n } from "../i18n";
import { addDays, today, type YearMonth } from "../lib/calendar";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "./Icons";

type View = "days" | "months" | "years";
const YEARS_PER_PAGE = 12;

export function MonthGrid({
  value,
  onSelect,
  month,
  onMonthChange,
  marks,
  min,
  max,
  initialView = "days",
}: {
  value: string | null;
  onSelect: (iso: string) => void;
  month: YearMonth;
  onMonthChange: (month: YearMonth) => void;
  marks?: (iso: string) => number;
  /** Earliest / latest selectable day ("YYYY-MM-DD"). */
  min?: string;
  max?: string;
  initialView?: View;
}) {
  const { calendar, t } = useI18n();
  const now = today();
  const [view, setView] = useState<View>(initialView);
  const [pageStart, setPageStart] = useState(() => month.year - (month.year % YEARS_PER_PAGE));
  const minYear = min ? calendar.parts(min).year : -Infinity;
  const maxYear = max ? calendar.parts(max).year : Infinity;
  const outOfRange = (iso: string) => Boolean((min && iso < min) || (max && iso > max));

  const step = (delta: number) => {
    if (view === "days") onMonthChange(calendar.addMonths(month, delta));
    else if (view === "months") onMonthChange({ ...month, year: month.year + delta });
    else setPageStart(pageStart + delta * YEARS_PER_PAGE);
  };
  const title =
    view === "days"
      ? calendar.monthTitle(month)
      : view === "months"
        ? calendar.formatNumber(month.year).replace(/[٬,]/g, "")
        : `${calendar.formatNumber(pageStart).replace(/[٬,]/g, "")} – ${calendar
            .formatNumber(pageStart + YEARS_PER_PAGE - 1)
            .replace(/[٬,]/g, "")}`;

  return (
    <div className="month-grid">
      <div className="month-grid-header">
        <button
          type="button"
          className="icon-button small"
          onClick={() => step(-1)}
          aria-label={t("calendar.previousMonth")}
        >
          <ChevronLeftIcon />
        </button>
        <button
          type="button"
          className="month-grid-title"
          aria-label={t("date.chooseMonthYear")}
          onClick={() => {
            if (view === "days") setView("months");
            else if (view === "months") {
              setPageStart(month.year - (month.year % YEARS_PER_PAGE));
              setView("years");
            } else setView("days");
          }}
        >
          {title}
        </button>
        <button
          type="button"
          className="icon-button small"
          onClick={() => step(1)}
          aria-label={t("calendar.nextMonth")}
        >
          <ChevronRightIcon />
        </button>
      </div>

      {view === "years" && (
        <div className="month-grid-choices">
          {Array.from({ length: YEARS_PER_PAGE }, (_, i) => pageStart + i).map((year) => (
            <button
              key={year}
              type="button"
              className="mini-day"
              disabled={year < minYear || year > maxYear}
              aria-pressed={year === month.year}
              onClick={() => {
                onMonthChange({ ...month, year });
                setView("months");
              }}
            >
              {calendar.formatNumber(year).replace(/[٬,]/g, "")}
            </button>
          ))}
        </div>
      )}

      {view === "months" && (
        <div className="month-grid-choices">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <button
              key={m}
              type="button"
              className="mini-day"
              aria-pressed={m === month.month}
              onClick={() => {
                onMonthChange({ ...month, month: m });
                setView("days");
              }}
            >
              {calendar.monthName(m)}
            </button>
          ))}
        </div>
      )}

      {view === "days" && (
        <div className="month-grid-days">
          {calendar.weekdayLabels("narrow").map((label, index) => (
            <span key={index} className="month-grid-weekday" aria-hidden="true">
              {label}
            </span>
          ))}
          {calendar.monthGrid(month).map((iso) => {
            const inMonth = calendar.parts(iso).month === month.month;
            const count = marks?.(iso) ?? 0;
            return (
              <button
                key={iso}
                type="button"
                className="mini-day"
                data-outside={!inMonth}
                data-today={iso === now}
                disabled={outOfRange(iso)}
                aria-pressed={iso === value}
                aria-label={calendar.longDay(iso)}
                onClick={() => onSelect(iso)}
              >
                {calendar.dayNumber(iso)}
                {count > 0 && <span className="mini-day-mark" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DatePicker({
  value,
  onChange,
  compact = false,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  compact?: boolean;
}) {
  const { t, calendar, relativeDay } = useI18n();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<YearMonth>(() => calendar.parts(value ?? today()));
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  const choose = (iso: string | null) => {
    onChange(iso);
    setOpen(false);
  };

  return (
    <div className="popover-anchor" ref={ref}>
      <button
        type="button"
        className={`mini-chip date-chip${value ? " is-set" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("tasks.dueDate")}
        onClick={() => {
          setMonth(calendar.parts(value ?? today()));
          setOpen(!open);
        }}
      >
        <CalendarIcon />
        {value ? relativeDay(value) : compact ? null : t("tasks.pickDate")}
      </button>
      {open && (
        <div className="popover popover-start date-popover" role="dialog" aria-label={t("tasks.dueDate")}>
          <div className="date-quick">
            <button type="button" className="mini-chip" onClick={() => choose(today())}>
              {t("date.today")}
            </button>
            <button type="button" className="mini-chip" onClick={() => choose(addDays(today(), 1))}>
              {t("date.tomorrow")}
            </button>
            <button type="button" className="mini-chip" onClick={() => choose(addDays(today(), 7))}>
              {t("date.nextWeek")}
            </button>
            {value && (
              <button type="button" className="mini-chip" onClick={() => choose(null)}>
                {t("tasks.noDate")}
              </button>
            )}
          </div>
          <MonthGrid value={value} onSelect={choose} month={month} onMonthChange={setMonth} />
        </div>
      )}
    </div>
  );
}

/** A date field that looks like an input and opens the calendar (with year / month lists). */
export function DateInput({
  value,
  onChange,
  min,
  max,
  placeholder,
  label,
  startYear,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  label: string;
  /** Year to show first when there is no value (e.g. 25 years ago for a birth date). */
  startYear?: number;
}) {
  const { t, calendar } = useI18n();
  const [open, setOpen] = useState(false);
  const initialMonth = (): YearMonth => {
    if (value) return calendar.parts(value);
    const parts = calendar.parts(today());
    return startYear ? { year: startYear, month: 1 } : parts;
  };
  const [month, setMonth] = useState<YearMonth>(initialMonth);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  return (
    <div className="popover-anchor date-input-anchor" ref={ref}>
      <div className="date-input" data-empty={!value}>
        <button
          type="button"
          className="date-input-button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={label}
          onClick={() => {
            setMonth(initialMonth());
            setOpen(!open);
          }}
        >
          <CalendarIcon />
          <span>{value ? calendar.longDay(value) : (placeholder ?? t("tasks.pickDate"))}</span>
        </button>
        {value && (
          <button
            type="button"
            className="icon-button small"
            aria-label={t("date.clear")}
            title={t("date.clear")}
            onClick={() => onChange(null)}
          >
            <CloseIcon />
          </button>
        )}
      </div>
      {open && (
        <div className="popover popover-start date-popover" role="dialog" aria-label={label}>
          <MonthGrid
            value={value}
            month={month}
            onMonthChange={setMonth}
            min={min}
            max={max}
            initialView={value ? "days" : "years"}
            onSelect={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
