/**
 * A board: header (title, star, filters, labels, background, archive, menu) and the canvas
 * of lists with drag and drop.
 *
 * Drag and drop (dnd-kit): cards move between lists live while dragging (a local copy of
 * the board is updated on every "drag over"), lists reorder horizontally. When the drag
 * ends, the cache is updated at once and one request saves the new place; if it fails the
 * board is reloaded. Works with mouse, touch (long press) and keyboard (Space, arrows).
 */
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { boardsApi, filesApi } from "../../api/endpoints";
import { queryKeys, useBoard } from "../../api/queries";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  ArchiveIcon,
  BackIcon,
  BoardIcon,
  CloseIcon,
  FilterIcon,
  ImageIcon,
  InboxIcon,
  MoreIcon,
  PlusIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
  UploadIcon,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { EmptyState, Popover, Skeleton } from "../../components/ui";
import { matchesQuery, usePageQuery } from "../../hooks/usePageQuery";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { addDays, today } from "../../lib/calendar";
import {
  boardBackgroundStyle,
  dueStatus,
  isLightBackground,
  moveCardLocally,
  moveListLocally,
} from "../../lib/boards";
import { paletteColor } from "../../lib/palette";
import type { Board, BoardListData, CardSummary } from "../../types";
import { BackgroundPicker } from "./BoardsPage";
import { CardFace } from "./BoardCardView";
import { CardModal } from "./CardModal";
import { KanbanList, listDndId } from "./KanbanList";
import { LabelsManager } from "./LabelsManager";
import { useBoardActions } from "./useBoardActions";

type DueFilter = "any" | "overdue" | "week" | "none" | "done";

interface Filters {
  text: string;
  labels: string[];
  due: DueFilter;
}

const NO_FILTERS: Filters = { text: "", labels: [], due: "any" };

function matches(card: CardSummary, filters: Filters): boolean {
  if (filters.text && !matchesQuery(filters.text, card.title)) return false;
  if (filters.labels.length && !filters.labels.some((id) => card.label_ids.includes(id))) return false;
  const status = dueStatus(card);
  switch (filters.due) {
    case "overdue":
      return status === "overdue";
    case "week":
      return !!card.due_date && !card.due_done && card.due_date <= addDays(today(), 7);
    case "none":
      return !card.due_date;
    case "done":
      return status === "done";
    default:
      return true;
  }
}

/** Lists collide by center (they are wide); cards by the pointer, then corners. */
const collision: CollisionDetection = (args) => {
  if (args.active.data.current?.type === "list") {
    return closestCorners({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === "list"),
    });
  }
  const within = pointerWithin(args);
  return within.length ? within : closestCorners(args);
};

function ArchivedDialog({ boardId, onClose }: { boardId: number; onClose: () => void }) {
  const { t, calendar } = useI18n();
  const actions = useBoardActions(boardId);
  const [cards, setCards] = useState<CardSummary[] | null>(null);
  useEffect(() => {
    void boardsApi.archived(boardId).then(setCards);
  }, [boardId]);

  const drop = (id: number) => setCards((current) => current?.filter((card) => card.id !== id) ?? null);

  return (
    <Modal title={t("boards.archived")} icon={ArchiveIcon} onClose={onClose} size="md">
      {!cards ? (
        <Skeleton rows={3} />
      ) : !cards.length ? (
        <p className="empty-inline">{t("boards.noArchived")}</p>
      ) : (
        <ul className="archived-list">
          {cards.map((card) => (
            <li key={card.id}>
              <span className="menu-item-text">
                <strong dir="auto">{card.title}</strong>
                <span className="muted small">{calendar.dateTime(card.updated_at)}</span>
              </span>
              <button
                type="button"
                className="small"
                onClick={() => {
                  drop(card.id);
                  void actions.updateCard(card.id, { archived: false });
                }}
              >
                {t("boards.restore")}
              </button>
              <button
                type="button"
                className="icon-button small danger"
                aria-label={t("common.delete")}
                onClick={() => {
                  drop(card.id);
                  void actions.removeCard(card.id);
                }}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function AddList({ onAdd }: { onAdd: (title: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim());
    setTitle("");
  };
  if (!open) {
    return (
      <button type="button" className="kanban-add-list" onClick={() => setOpen(true)}>
        <PlusIcon /> {t("boards.addList")}
      </button>
    );
  }
  return (
    <form className="kanban-add-list-form" onSubmit={submit}>
      <input
        autoFocus
        maxLength={100}
        placeholder={t("boards.listPlaceholder")}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
      />
      <div className="kanban-composer-actions">
        <button type="submit" className="primary small">
          {t("boards.addList")}
        </button>
        <button
          type="button"
          className="icon-button small"
          onClick={() => setOpen(false)}
          aria-label={t("common.close")}
        >
          <CloseIcon />
        </button>
      </div>
    </form>
  );
}

function BoardTitle({ board, onSave }: { board: Board; onSave: (title: string) => void }) {
  const [value, setValue] = useState(board.title);
  useEffect(() => setValue(board.title), [board.title]);
  return (
    <input
      className="board-title-input"
      aria-label={board.title}
      maxLength={100}
      value={value}
      size={Math.max(4, value.length)}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
      onBlur={() => {
        const next = value.trim();
        if (next && next !== board.title) onSave(next);
        else setValue(board.title);
      }}
    />
  );
}

function BoardCanvas({ board }: { board: Board }) {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const actions = useBoardActions(board.id);
  const [params, setParams] = useSearchParams();
  const openCardId = Number(params.get("card")) || null;
  const [filterState, setFilters] = useState<Filters>(NO_FILTERS);
  const pageQuery = usePageQuery();
  const filters = useMemo(() => ({ ...filterState, text: pageQuery }), [filterState, pageQuery]);
  const [dialog, setDialog] = useState<"labels" | "archived" | null>(null);
  const [draft, setDraft] = useState<Board | null>(null);
  const [active, setActive] = useState<
    { type: "card"; card: CardSummary } | { type: "list"; list: BoardListData } | null
  >(null);
  const startList = useRef<number | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const view = draft ?? board;
  const filtering = filters.text !== "" || filters.labels.length > 0 || filters.due !== "any";
  const visibleCards = useMemo(() => {
    const map = new Map<number, CardSummary[]>();
    for (const list of view.lists)
      map.set(list.id, filtering ? list.cards.filter((c) => matches(c, filters)) : list.cards);
    return map;
  }, [view, filters, filtering]);
  const total = view.lists.reduce((sum, list) => sum + list.cards.length, 0);
  const shown = [...visibleCards.values()].reduce((sum, cards) => sum + cards.length, 0);

  const findList = (b: Board, id: string | number | undefined): BoardListData | undefined => {
    if (id === undefined) return undefined;
    const key = String(id);
    if (key.startsWith("list-")) return b.lists.find((l) => listDndId(l.id) === key);
    if (key.startsWith("body-")) return b.lists.find((l) => `body-${l.id}` === key);
    if (key.startsWith("card-")) return b.lists.find((l) => l.cards.some((c) => `card-${c.id}` === key));
    return undefined;
  };

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === "card") {
      setActive({ type: "card", card: data.card as CardSummary });
      startList.current = (data.card as CardSummary).list_id;
    } else if (data?.type === "list") {
      setActive({ type: "list", list: data.list as BoardListData });
    }
    setDraft(board);
  }

  function onDragOver(event: DragOverEvent) {
    const { active: dragged, over } = event;
    if (!over || dragged.data.current?.type !== "card" || !draft) return;
    const from = findList(draft, dragged.id);
    const to = findList(draft, over.id);
    if (!from || !to || from.id === to.id) return;
    // Entering another list: insert above the hovered card, or at the end.
    const overIndex = to.cards.findIndex((c) => `card-${c.id}` === String(over.id));
    const below =
      over.rect && dragged.rect.current.translated
        ? dragged.rect.current.translated.top > over.rect.top + over.rect.height / 2
        : false;
    const index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : to.cards.length;
    const cardId = Number(String(dragged.id).slice(5));
    setDraft(moveCardLocally(draft, cardId, to.id, index));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active: dragged, over } = event;
    const current = draft ?? board;
    setActive(null);
    setDraft(null);
    if (!over) return;

    if (dragged.data.current?.type === "list") {
      const fromIndex = current.lists.findIndex((l) => listDndId(l.id) === String(dragged.id));
      const toIndex = current.lists.findIndex((l) => listDndId(l.id) === String(over.id));
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      const listId = current.lists[fromIndex].id;
      actions.setBoard(() => moveListLocally(current, listId, toIndex));
      void actions.moveList(listId, toIndex);
      return;
    }

    const cardId = Number(String(dragged.id).slice(5));
    const list = findList(current, dragged.id);
    if (!list) return;
    const fromIndex = list.cards.findIndex((c) => c.id === cardId);
    let toIndex = list.cards.findIndex((c) => `card-${c.id}` === String(over.id));
    if (toIndex < 0) toIndex = fromIndex;
    const final = moveCardLocally(current, cardId, list.id, toIndex);
    const moved = list.id !== startList.current || fromIndex !== toIndex;
    actions.setBoard(() => final);
    if (moved) void actions.moveCard(cardId, list.id, toIndex);
  }

  const openCard = (cardId: number) => {
    const next = new URLSearchParams(params);
    next.set("card", String(cardId));
    setParams(next);
  };
  const closeCard = () => {
    const next = new URLSearchParams(params);
    next.delete("card");
    setParams(next, { replace: true });
  };

  async function uploadBackground(file: File) {
    try {
      const stored = await filesApi.upload(file);
      if (stored.kind !== "image") throw new Error("image");
      await actions.updateBoard({ background: stored.url });
    } catch (error) {
      toast(
        error instanceof Error && error.message === "image"
          ? t("notes.coverImageOnly")
          : errorMessage(error, i18n),
        "error",
      );
    }
  }

  async function deleteBoard() {
    const ok = await confirm({
      title: t("boards.deleteTitle", { title: board.title }),
      message: t("boards.deleteMessage"),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await boardsApi.remove(board.id);
      client.removeQueries({ queryKey: queryKeys.board(board.id) });
      await client.invalidateQueries({ queryKey: queryKeys.boards });
      navigate("/boards");
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
    }
  }

  const light = isLightBackground(board.background);

  return (
    <div className="board-page" style={boardBackgroundStyle(board.background)} data-light={light}>
      <header className="board-header">
        <Link
          to="/boards"
          className="board-header-button icon-only"
          aria-label={t("nav.boards")}
          title={t("nav.boards")}
        >
          <BackIcon />
        </Link>
        <BoardTitle board={board} onSave={(title) => void actions.updateBoard({ title })} />
        <button
          type="button"
          className="board-header-button icon-only"
          aria-pressed={board.starred}
          aria-label={board.starred ? t("boards.unstar") : t("boards.star")}
          title={board.starred ? t("boards.unstar") : t("boards.star")}
          onClick={() => void actions.updateBoard({ starred: !board.starred })}
        >
          <StarIcon filled={board.starred} />
        </button>
        <span className="board-header-spacer" />

        <Popover
          label={t("boards.filter")}
          align="end"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className="board-header-button"
              aria-expanded={open}
              data-active={filtering}
              onClick={toggle}
            >
              <FilterIcon />
              <span className="hide-on-phone">{t("boards.filter")}</span>
              {filtering && <span className="board-filter-count">{calendar.formatNumber(shown)}</span>}
            </button>
          )}
        >
          {() => (
            <div className="board-filter">
              <p className="menu-heading">{t("boards.labels")}</p>
              <div className="filter-labels">
                {board.labels.map((label) => (
                  <label key={label.id} className="check-row">
                    <input
                      type="checkbox"
                      checked={filters.labels.includes(label.id)}
                      onChange={(event) =>
                        setFilters({
                          ...filters,
                          labels: event.target.checked
                            ? [...filters.labels, label.id]
                            : filters.labels.filter((id) => id !== label.id),
                        })
                      }
                    />
                    <span className="label-swatch" style={{ background: paletteColor(label.color).hex }}>
                      {label.name}
                    </span>
                  </label>
                ))}
              </div>
              <p className="menu-heading">{t("boards.dueDate")}</p>
              <div className="menu-chips">
                {(["any", "overdue", "week", "none", "done"] as const).map((due) => (
                  <button
                    key={due}
                    type="button"
                    className="mini-chip"
                    aria-pressed={filters.due === due}
                    onClick={() => setFilters({ ...filters, due })}
                  >
                    {t(`boards.filterDue.${due}`)}
                  </button>
                ))}
              </div>
              {filtering && (
                <button type="button" className="ghost small block" onClick={() => setFilters(NO_FILTERS)}>
                  {t("boards.clearFilters")}
                </button>
              )}
            </div>
          )}
        </Popover>

        <Popover
          label={t("boards.background")}
          align="end"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className="board-header-button"
              aria-expanded={open}
              onClick={toggle}
              title={t("boards.background")}
            >
              <ImageIcon />
              <span className="hide-on-phone">{t("boards.background")}</span>
            </button>
          )}
        >
          {(close) => (
            <div className="board-background-menu">
              <BackgroundPicker
                value={board.background}
                onChange={(background) => {
                  void actions.updateBoard({ background });
                }}
              />
              <button
                type="button"
                className="small block"
                onClick={() => {
                  close();
                  uploadInput.current?.click();
                }}
              >
                <UploadIcon /> {t("boards.uploadBackground")}
              </button>
            </div>
          )}
        </Popover>
        <input
          ref={uploadInput}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp,image/avif"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void uploadBackground(file);
          }}
        />

        <Popover
          label={t("common.more")}
          align="end"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className="board-header-button icon-only"
              aria-expanded={open}
              onClick={toggle}
              aria-label={t("common.more")}
            >
              <MoreIcon />
            </button>
          )}
        >
          {(close) => (
            <div className="menu-list" role="menu">
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  close();
                  setDialog("labels");
                }}
              >
                <TagIcon /> {t("boards.manageLabels")}
              </button>
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  close();
                  setDialog("archived");
                }}
              >
                <ArchiveIcon /> {t("boards.archived")}
              </button>
              <div className="menu-separator" />
              <button
                type="button"
                className="menu-item danger"
                onClick={() => {
                  close();
                  void deleteBoard();
                }}
              >
                <TrashIcon /> {t("boards.delete")}
              </button>
            </div>
          )}
        </Popover>
      </header>

      {filtering && (
        <div className="board-filter-bar">
          <FilterIcon /> {t("boards.filtered", { shown, total })}
          <button type="button" className="link-button" onClick={() => setFilters(NO_FILTERS)}>
            {t("boards.clearFilters")}
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActive(null);
          setDraft(null);
        }}
      >
        <div className="board-canvas">
          <SortableContext
            items={view.lists.map((list) => listDndId(list.id))}
            strategy={horizontalListSortingStrategy}
          >
            {view.lists.map((list) => (
              <KanbanList
                key={list.id}
                list={list}
                cards={visibleCards.get(list.id) ?? []}
                labels={board.labels}
                dragDisabled={filtering}
                onOpenCard={openCard}
                onAddCard={(title) => void actions.addCard(list.id, title)}
                onRename={(title) => void actions.updateList(list.id, { title })}
                onChange={(changes) => void actions.updateList(list.id, changes)}
                onSort={async (by) => {
                  await boardsApi.sortList(board.id, list.id, by).catch(() => undefined);
                  void actions.reload();
                }}
                onArchiveCards={async () => {
                  await boardsApi.archiveListCards(board.id, list.id).catch(() => undefined);
                  void actions.reload();
                }}
                onDelete={() => void actions.removeList(list.id)}
              />
            ))}
          </SortableContext>
          <AddList onAdd={(title) => void actions.addList(title)} />
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.2)" }}>
          {active?.type === "card" ? (
            <div className="kanban-card drag-overlay">
              <CardFace card={active.card} labels={board.labels} overlay />
            </div>
          ) : active?.type === "list" ? (
            <div className="kanban-list drag-overlay">
              <header className="kanban-list-header">
                <h3 className="kanban-list-title" dir="auto">
                  {active.list.title}
                </h3>
              </header>
              <ol className="kanban-cards">
                {active.list.cards.slice(0, 6).map((card) => (
                  <li key={card.id} className="kanban-card">
                    <CardFace card={card} labels={board.labels} />
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {openCardId && <CardModal board={board} cardId={openCardId} onClose={closeCard} />}
      {dialog === "labels" && <LabelsManager board={board} onClose={() => setDialog(null)} />}
      {dialog === "archived" && <ArchivedDialog boardId={board.id} onClose={() => setDialog(null)} />}
    </div>
  );
}

export function BoardPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const { data: board, isLoading, error } = useBoard(Number(id));
  if (isLoading) return <Skeleton rows={4} height={80} />;
  if (error || !board) {
    return (
      <EmptyState
        icon={InboxIcon}
        title={t("errors.board_not_found")}
        action={
          <Link to="/boards" className="button">
            <BoardIcon /> {t("nav.boards")}
          </Link>
        }
      />
    );
  }
  return <BoardCanvas board={board} />;
}
