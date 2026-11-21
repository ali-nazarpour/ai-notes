/**
 * Dashboard. Layout (desktop): a hero, four equal stat tiles, then two rows of two equal
 * cards (Today | Next 7 days, Favorites | Recent notes) and categories across the full
 * width. Cards in a row always have the same height.
 */
import { Link } from "react-router";

import { useCategories, useNotes, useTaskActions, useTasks } from "../../api/queries";
import { CategoryBadge } from "../../components/CategoryBits";
import { ChevronRightIcon, StarIcon } from "../../components/Icons";
import { displayName, Skeleton } from "../../components/ui";
import { useI18n } from "../../i18n";
import { addDays, today } from "../../lib/calendar";
import { coverStyle } from "../../lib/covers";
import { categoryStyle } from "../../lib/palette";
import { isOverdue } from "../../lib/tasks";
import type { Category, NoteSummary, User } from "../../types";
import { AiBriefing } from "../ai/AiBriefing";
import { TaskComposer } from "../tasks/TaskComposer";
import { TaskItem } from "../tasks/TaskItem";

function greetingKey(): "home.morning" | "home.afternoon" | "home.evening" | "home.night" {
  const hour = new Date().getHours();
  if (hour < 5) return "home.night";
  if (hour < 12) return "home.morning";
  if (hour < 18) return "home.afternoon";
  return "home.evening";
}

function CardHeader({ title, to, linkLabel }: { title: React.ReactNode; to: string; linkLabel: string }) {
  return (
    <div className="card-header">
      <h2>{title}</h2>
      <Link to={to} className="link-button">
        {linkLabel} <ChevronRightIcon />
      </Link>
    </div>
  );
}

function NoteMiniList({
  notes,
  loading,
  empty,
  categories,
}: {
  notes: NoteSummary[];
  loading: boolean;
  empty: string;
  categories: Category[];
}) {
  const { t, calendar } = useI18n();
  if (loading) return <Skeleton rows={3} height={56} />;
  if (!notes.length) return <p className="empty-inline">{empty}</p>;
  return (
    <ul className="mini-notes">
      {notes.map((note) => {
        const category = categories.find((c) => c.id === note.category_id);
        return (
          <li key={note.id}>
            <Link to={`/notes/${note.id}`} className="mini-note" style={categoryStyle(category?.color)}>
              <span className="mini-note-cover" style={coverStyle(note.cover)} aria-hidden="true" />
              <span className="mini-note-text">
                <span className="mini-note-title" dir="auto">
                  {note.title || t("notes.untitled")}
                </span>
                <span className="mini-note-preview" dir="auto">
                  {note.excerpt || t("notes.empty")}
                </span>
              </span>
              <span className="mini-note-meta">
                <CategoryBadge category={category} />
                <span className="muted small">{calendar.shortDate(note.updated_at)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function HomePage({ user }: { user: User }) {
  const { t, calendar, plural } = useI18n();
  const { data: tasks = [], isLoading: tasksLoading } = useTasks();
  const { data: categories = [] } = useCategories();
  const { data: notes = [], isLoading: notesLoading } = useNotes();
  const taskActions = useTaskActions();

  const now = today();
  const weekEnd = addDays(now, 7);
  const dueToday = tasks.filter((task) => task.due_date === now);
  const doneToday = dueToday.filter((task) => task.is_done).length;
  const overdue = tasks.filter(isOverdue);
  const upcoming = tasks.filter(
    (task) => !task.is_done && task.due_date !== null && task.due_date > now && task.due_date <= weekEnd,
  );
  const openCount = tasks.filter((task) => !task.is_done).length;
  const progress = dueToday.length ? Math.round((doneToday / dueToday.length) * 100) : 0;
  const favorites = notes.filter((note) => note.is_favorite).slice(0, 4);
  const recent = notes.slice(0, 4);

  const summary = dueToday.length
    ? t("home.progress", { done: doneToday, total: dueToday.length })
    : t("home.nothingToday");

  const itemProps = {
    categories,
    onToggle: taskActions.toggle,
    onChange: taskActions.update,
    onDelete: taskActions.remove,
  };

  const stats = [
    { value: dueToday.length - doneToday, label: t("home.stat.dueToday"), to: "/tasks" },
    { value: overdue.length, label: t("home.stat.overdue"), to: "/tasks", danger: overdue.length > 0 },
    { value: openCount, label: t("home.stat.open"), to: "/tasks" },
    { value: notes.length, label: t("home.stat.notes"), to: "/notes" },
  ];

  return (
    <div className="home">
      <header className="hero">
        <div>
          <p className="eyebrow">{calendar.longDay(now)}</p>
          <h1>{t("home.greeting", { greeting: t(greetingKey()), name: displayName(user) })}</h1>
          <p className="hero-summary">
            {summary}
            {overdue.length > 0 && ` ${plural("home.overdueCount", overdue.length)}`}
          </p>
        </div>
        {dueToday.length > 0 && (
          <div className="hero-progress">
            <span className="hero-percent">{t("home.percent", { value: progress })}</span>
            <div
              className="progress"
              role="progressbar"
              aria-label={t("home.todayProgress")}
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </header>

      <div className="stats">
        {stats.map((stat) => (
          <Link key={stat.label} to={stat.to} className="stat" data-tone={stat.danger ? "danger" : undefined}>
            <span className="stat-value">{calendar.formatNumber(stat.value)}</span>
            <span className="stat-label">{stat.label}</span>
          </Link>
        ))}
      </div>

      <AiBriefing />

      <div className="home-grid">
        <section className="card" aria-labelledby="home-today">
          <CardHeader
            title={<span id="home-today">{t("home.today")}</span>}
            to="/tasks"
            linkLabel={t("home.allTasks")}
          />
          <TaskComposer
            categories={categories}
            onAdd={taskActions.add}
            defaultDate={now}
            placeholder={t("home.addToday")}
          />
          <div className="card-scroll">
            {tasksLoading ? (
              <Skeleton rows={3} />
            ) : overdue.length + dueToday.length ? (
              <ul className="task-list">
                {[...overdue, ...dueToday].map((task) => (
                  <TaskItem key={task.id} task={task} {...itemProps} />
                ))}
              </ul>
            ) : (
              <p className="empty-inline">{t("home.nothingToday")}</p>
            )}
          </div>
        </section>

        <section className="card" aria-labelledby="home-week">
          <CardHeader
            title={<span id="home-week">{t("home.nextWeek")}</span>}
            to="/calendar"
            linkLabel={t("nav.calendar")}
          />
          <div className="card-scroll">
            {upcoming.length ? (
              <ul className="task-list">
                {upcoming.map((task) => (
                  <TaskItem key={task.id} task={task} {...itemProps} />
                ))}
              </ul>
            ) : (
              <p className="empty-inline">{t("home.nothingUpcoming")}</p>
            )}
          </div>
        </section>

        <section className="card" aria-labelledby="home-favorites">
          <CardHeader
            title={
              <span id="home-favorites" className="with-icon">
                <StarIcon filled /> {t("notes.favorites")}
              </span>
            }
            to="/notes?favorites=1"
            linkLabel={t("common.seeAll")}
          />
          <NoteMiniList
            notes={favorites}
            loading={notesLoading}
            empty={t("home.noFavorites")}
            categories={categories}
          />
        </section>

        <section className="card" aria-labelledby="home-recent">
          <CardHeader
            title={<span id="home-recent">{t("home.recent")}</span>}
            to="/notes"
            linkLabel={t("home.allNotes")}
          />
          <NoteMiniList
            notes={recent}
            loading={notesLoading}
            empty={t("home.noNotes")}
            categories={categories}
          />
        </section>

        <section className="card card-wide" aria-labelledby="home-categories">
          <CardHeader
            title={<span id="home-categories">{t("nav.categories")}</span>}
            to="/settings/categories"
            linkLabel={t("common.manage")}
          />
          <div className="category-tiles">
            {categories.map((category) => (
              <Link
                key={category.id}
                to={`/notes?category=${category.id}`}
                className="category-tile"
                style={categoryStyle(category.color)}
              >
                <span className="tile-icon" aria-hidden="true">
                  {category.icon || "•"}
                </span>
                <span className="tile-name">{category.name}</span>
                <span className="tile-meta">
                  {plural("notes.count", category.note_count)} ·{" "}
                  {plural("tasks.count", category.open_task_count)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
