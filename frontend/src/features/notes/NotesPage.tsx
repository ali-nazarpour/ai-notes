/**
 * Notes list. Filters live in the URL (?q=, ?category=, ?favorites=1), so they survive a
 * reload, work with the back button and can be linked to (PWA shortcuts, sidebar).
 */
import { Link, useSearchParams } from "react-router";

import { useCategories, useNoteActions, useNotes, useTaskActions, useTasks } from "../../api/queries";
import { CategoryBadge, FilterChips } from "../../components/CategoryBits";
import { GridIcon, InboxIcon, ListIcon, PlusIcon } from "../../components/Icons";
import { EmptyState, FavoriteButton, PageHeader, Skeleton } from "../../components/ui";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { coverStyle } from "../../lib/covers";
import { categoryStyle } from "../../lib/palette";
import type { Category, NoteSummary, ViewMode } from "../../types";
import { TaskItem } from "../tasks/TaskItem";
import { useCreateNote } from "./useCreateNote";

type SortKey = "updated" | "created" | "title";

function sortNotes(notes: NoteSummary[], key: SortKey): NoteSummary[] {
  if (key === "updated") return notes;
  return [...notes].sort((a, b) =>
    key === "title" ? a.title.localeCompare(b.title) : b.created_at.localeCompare(a.created_at),
  );
}

function NoteCard({ note, category }: { note: NoteSummary; category: Category | undefined }) {
  const { t, calendar } = useI18n();
  const { toggleFavorite } = useNoteActions();
  return (
    <li className="note-card" style={categoryStyle(category?.color)} data-has-category={!!category}>
      <Link to={`/notes/${note.id}`} className="note-open">
        {note.cover && <span className="note-cover" style={coverStyle(note.cover)} aria-hidden="true" />}
        <span className="note-body">
          <span className="note-title" dir="auto">
            {note.title || t("notes.untitled")}
          </span>
          <span className="note-preview" dir="auto">
            {note.excerpt || t("notes.empty")}
          </span>
          <span className="note-footer">
            <CategoryBadge category={category} />
            <span className="note-date">{calendar.shortDate(note.updated_at)}</span>
          </span>
        </span>
      </Link>
      <FavoriteButton active={note.is_favorite} onToggle={() => toggleFavorite(note)} />
    </li>
  );
}

export function NotesPage() {
  const i18n = useI18n();
  const { t, plural } = i18n;
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const categoryId = params.get("category") ? Number(params.get("category")) : null;
  const favoritesOnly = params.get("favorites") === "1";
  const [storedView, setView] = useLocalStorage<ViewMode>("notes.viewMode", "grid");
  const view: ViewMode = storedView === "list" ? "list" : "grid";
  const [sort, setSort] = useLocalStorage<SortKey>("notes.sort", "updated");

  const { data: categories = [] } = useCategories();
  const {
    data: notes = [],
    isLoading,
    error,
    refetch,
  } = useNotes({
    search,
    favoritesOnly,
    categoryId,
  });
  const { data: tasks = [] } = useTasks();
  const taskActions = useTaskActions();
  const { createNote, creating } = useCreateNote();

  const activeCategory = categories.find((category) => category.id === categoryId);
  const q = search.trim().toLowerCase();
  const matchingTasks = q ? tasks.filter((task) => task.title.toLowerCase().includes(q)) : [];
  const sorted = sortNotes(notes, sort);

  let title = t("nav.notes");
  if (q) title = t("notes.resultsFor", { query: search.trim() });
  else if (favoritesOnly) title = t("notes.favorites");
  else if (activeCategory)
    title = `${activeCategory.icon ? `${activeCategory.icon} ` : ""}${activeCategory.name}`;

  const setFilter = (filter: { categoryId: number | null; favoritesOnly: boolean }) => {
    const next = new URLSearchParams(params);
    if (filter.categoryId === null) next.delete("category");
    else next.set("category", String(filter.categoryId));
    if (filter.favoritesOnly) next.set("favorites", "1");
    else next.delete("favorites");
    setParams(next, { replace: true });
  };

  let emptyTitle = t("notes.emptyTitle");
  let emptyHint = t("notes.emptyHint");
  if (q) {
    emptyTitle = t("notes.noResults");
    emptyHint = t("notes.noResultsHint");
  } else if (favoritesOnly) {
    emptyTitle = t("notes.noFavorites");
    emptyHint = t("notes.noFavoritesHint");
  } else if (activeCategory) {
    emptyTitle = t("notes.emptyCategory");
  }

  return (
    <section aria-labelledby="page-title">
      <PageHeader
        title={<span id="page-title">{title}</span>}
        subtitle={!isLoading && !error ? plural("notes.count", notes.length) : undefined}
        actions={
          <>
            <select
              className="compact-select"
              aria-label={t("notes.sortBy")}
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
            >
              <option value="updated">{t("notes.sort.updated")}</option>
              <option value="created">{t("notes.sort.created")}</option>
              <option value="title">{t("notes.sort.title")}</option>
            </select>
            <div className="segmented" role="group" aria-label={t("notes.layout")}>
              <button
                type="button"
                aria-pressed={view === "grid"}
                aria-label={t("notes.grid")}
                title={t("notes.grid")}
                onClick={() => setView("grid")}
              >
                <GridIcon />
              </button>
              <button
                type="button"
                aria-pressed={view === "list"}
                aria-label={t("notes.list")}
                title={t("notes.list")}
                onClick={() => setView("list")}
              >
                <ListIcon />
              </button>
            </div>
            <button
              type="button"
              className="primary"
              onClick={() => createNote(categoryId)}
              disabled={creating}
              aria-label={t("notes.new")}
            >
              <PlusIcon />
              <span className="hide-on-phone">{t("notes.new")}</span>
            </button>
          </>
        }
      />

      <FilterChips
        categories={categories}
        categoryId={categoryId}
        favoritesOnly={favoritesOnly}
        showFavorites
        onChange={setFilter}
        countOf={(category) => category.note_count}
      />

      {matchingTasks.length > 0 && (
        <div className="card">
          <h2 className="card-title-sm">{t("notes.matchingTasks")}</h2>
          <ul className="task-list">
            {matchingTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                categories={categories}
                onToggle={taskActions.toggle}
                onChange={taskActions.update}
                onDelete={taskActions.remove}
              />
            ))}
          </ul>
        </div>
      )}

      {isLoading && <Skeleton rows={4} height={120} />}

      {error && (
        <div className="empty-state">
          <p className="error-text" role="alert">
            {errorMessage(error, i18n)}
          </p>
          <button type="button" onClick={() => void refetch()}>
            {t("common.retry")}
          </button>
        </div>
      )}

      {!isLoading && !error && notes.length === 0 && (
        <EmptyState
          icon={InboxIcon}
          title={emptyTitle}
          hint={emptyHint}
          action={
            !q && !favoritesOnly ? (
              <button type="button" className="primary" onClick={() => createNote(categoryId)}>
                <PlusIcon />
                {t("notes.create")}
              </button>
            ) : undefined
          }
        />
      )}

      {!isLoading && !error && notes.length > 0 && (
        <ul className={view === "grid" ? "notes notes-grid" : "notes notes-list"}>
          {sorted.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              category={categories.find((category) => category.id === note.category_id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
