/**
 * Month view of tasks by due date, plus project start/end dates and milestones, board
 * cards with a due date and one-time alarms (read-only events that link to their page). In Persian the grid is the Solar Hijri (Jalali) month
 * starting on Saturday; in English the Gregorian month starting on Monday.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router";

import { calendarApi } from "../../api/v5";

import { useCategories, useTaskActions, useTasks } from "../../api/queries";
import { ChevronLeftIcon, ChevronRightIcon } from "../../components/Icons";
import { PageHeader } from "../../components/ui";
import { useI18n, type TranslationKey } from "../../i18n";
import { today, type YearMonth } from "../../lib/calendar";
import { categoryStyle } from "../../lib/palette";
import type { Task } from "../../types";
import type { CalendarEvent } from "../../types5";
import { TaskComposer } from "../tasks/TaskComposer";
import { TaskItem } from "../tasks/TaskItem";

export function CalendarPage() {
  const { t, calendar, plural } = useI18n();
  const now = today();
  const [selected, setSelected] = useState(now);
  const [month, setMonth] = useState<YearMonth>(() => calendar.parts(now));
  const { data: tasks = [] } = useTasks();
  const { data: categories = [] } = useCategories();
  const actions = useTaskActions();

  const grid = calendar.monthGrid(month);
  const { data: events = [] } = useQuery({
    queryKey: ["calendar-events", grid[0], grid[grid.length - 1]],
    queryFn: () => calendarApi.events(grid[0], grid[grid.length - 1]),
  });
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) map.set(event.date, [...(map.get(event.date) ?? []), event]);
    return map;
  }, [events]);
  const selectedEvents = eventsByDay.get(selected) ?? [];
  const byDay = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.due_date) byDay.set(task.due_date, [...(byDay.get(task.due_date) ?? []), task]);
  }
  const colorOf = (task: Task) => categories.find((c) => c.id === task.category_id)?.color ?? "slate";
  const selectedTasks = byDay.get(selected) ?? [];
  const openOnSelected = selectedTasks.filter((task) => !task.is_done).length;

  return (
    <section aria-labelledby="page-title" className="calendar-page">
      <PageHeader
        title={<span id="page-title">{calendar.monthTitle(month)}</span>}
        subtitle={t("calendar.subtitle")}
        actions={
          <>
            <button
              type="button"
              onClick={() => {
                setMonth(calendar.parts(now));
                setSelected(now);
              }}
            >
              {t("date.today")}
            </button>
            <div className="segmented">
              <button
                type="button"
                onClick={() => setMonth(calendar.addMonths(month, -1))}
                aria-label={t("calendar.previousMonth")}
              >
                <ChevronLeftIcon />
              </button>
              <button
                type="button"
                onClick={() => setMonth(calendar.addMonths(month, 1))}
                aria-label={t("calendar.nextMonth")}
              >
                <ChevronRightIcon />
              </button>
            </div>
          </>
        }
      />

      <div className="calendar-layout">
        <div className="card calendar">
          <div className="calendar-weekdays" aria-hidden="true">
            {calendar.weekdayLabels("short").map((label, index) => (
              <span key={index}>
                <span className="weekday-short">{label}</span>
                <span className="weekday-narrow">{calendar.weekdayLabels("narrow")[index]}</span>
              </span>
            ))}
          </div>
          <div className="calendar-grid" role="grid" aria-label={calendar.monthTitle(month)}>
            {grid.map((day) => {
              const dayTasks = byDay.get(day) ?? [];
              const dayEvents = eventsByDay.get(day) ?? [];
              const inMonth = calendar.parts(day).month === month.month;
              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  className="day"
                  data-outside={!inMonth}
                  data-today={day === now}
                  aria-selected={day === selected}
                  aria-label={t("calendar.dayLabel", {
                    day: calendar.longDay(day),
                    tasks: plural("tasks.count", dayTasks.length),
                  })}
                  onClick={() => setSelected(day)}
                >
                  <span className="day-number">{calendar.dayNumber(day)}</span>
                  <span className="day-pills">
                    {dayEvents.slice(0, 2).map((event) => (
                      <span
                        key={event.id}
                        className="day-pill day-event"
                        data-kind={event.kind}
                        data-done={event.done}
                        style={categoryStyle(event.color)}
                        dir="auto"
                      >
                        {event.title}
                      </span>
                    ))}
                    {dayTasks.slice(0, Math.max(0, 3 - dayEvents.length)).map((task) => (
                      <span
                        key={task.id}
                        className="day-pill"
                        data-done={task.is_done}
                        style={categoryStyle(colorOf(task))}
                        dir="auto"
                      >
                        {task.title}
                      </span>
                    ))}
                    {dayTasks.length + Math.min(2, dayEvents.length) > 3 && (
                      <span className="day-more">
                        {t("calendar.more", {
                          count:
                            dayTasks.length +
                            dayEvents.length -
                            Math.min(3, dayTasks.length + Math.min(2, dayEvents.length)),
                        })}
                      </span>
                    )}
                  </span>
                  <span className="day-dots" aria-hidden="true">
                    {dayTasks.slice(0, 4).map((task) => (
                      <span
                        key={task.id}
                        className="cat-dot"
                        data-done={task.is_done}
                        style={categoryStyle(colorOf(task))}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="card day-panel" aria-labelledby="day-title">
          <h2 id="day-title">{calendar.longDay(selected)}</h2>
          <p className="muted small">
            {selectedTasks.length
              ? t("calendar.openOf", { open: openOnSelected, total: selectedTasks.length })
              : t("calendar.noTasks")}
          </p>
          {selectedEvents.length > 0 && (
            <ul className="day-events">
              {selectedEvents.map((event) => (
                <li key={event.id}>
                  <Link
                    to={event.url}
                    className="day-event-row"
                    style={categoryStyle(event.color)}
                    data-done={event.done}
                  >
                    <span className="day-event-kind">
                      {t(`calendar.event.${event.kind}` as TranslationKey)}
                    </span>
                    <strong dir="auto">{event.title}</strong>
                    {event.subtitle && (
                      <span className="muted small" dir="auto">
                        {event.subtitle}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <TaskComposer
            key={selected}
            categories={categories}
            onAdd={actions.add}
            defaultDate={selected}
            placeholder={t("calendar.addPlaceholder")}
          />
          {selectedTasks.length > 0 && (
            <ul className="task-list">
              {selectedTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  categories={categories}
                  onToggle={actions.toggle}
                  onChange={actions.update}
                  onDelete={actions.remove}
                  showDate={false}
                />
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}
