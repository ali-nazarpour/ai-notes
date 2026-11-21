/** One list (column): header with menu, sortable cards and the "add a card" composer. */
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

import { useConfirm } from "../../components/Feedback";
import {
  ArchiveIcon,
  CloseIcon,
  MoreIcon,
  PlusIcon,
  SortIcon,
  SparkleIcon,
  TrashIcon,
} from "../../components/Icons";
import { AiSuggestDialog } from "../ai/AiSuggestDialog";
import { ColorPicker, Popover } from "../../components/ui";
import { useI18n } from "../../i18n";
import { paletteColor } from "../../lib/palette";
import type { BoardLabel, BoardListData, CardSummary, ListSortBy } from "../../types";
import { cardDndId, SortableCard } from "./BoardCardView";

export const listDndId = (id: number) => `list-${id}`;

interface Props {
  list: BoardListData;
  cards: CardSummary[];
  labels: BoardLabel[];
  dragDisabled: boolean;
  onOpenCard: (cardId: number) => void;
  onAddCard: (title: string) => void;
  onRename: (title: string) => void;
  onChange: (changes: { color?: BoardListData["color"]; wip_limit?: number | null }) => void;
  onSort: (by: ListSortBy) => void;
  onArchiveCards: () => void;
  onDelete: () => void;
}

function Composer({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (title.trim()) onAdd(title.trim());
    setTitle("");
    ref.current?.focus();
  };

  return (
    <form className="kanban-composer" onSubmit={submit}>
      <textarea
        ref={ref}
        rows={2}
        maxLength={300}
        placeholder={t("boards.cardPlaceholder")}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") onClose();
        }}
        onBlur={() => !title.trim() && onClose()}
      />
      <div className="kanban-composer-actions">
        <button type="submit" className="primary small" onMouseDown={(event) => event.preventDefault()}>
          {t("boards.addCard")}
        </button>
        <button type="button" className="icon-button small" onClick={onClose} aria-label={t("common.close")}>
          <CloseIcon />
        </button>
      </div>
    </form>
  );
}

export function KanbanList({
  list,
  cards,
  labels,
  dragDisabled,
  onOpenCard,
  onAddCard,
  onRename,
  onChange,
  onSort,
  onArchiveCards,
  onDelete,
}: Props) {
  const { t, calendar } = useI18n();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(list.title);
  const [wip, setWip] = useState(list.wip_limit ? String(list.wip_limit) : "");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: listDndId(list.id),
    data: { type: "list", list },
    disabled: dragDisabled,
  });
  const { setNodeRef: setBodyRef } = useDroppable({
    id: `body-${list.id}`,
    data: { type: "list-body", listId: list.id },
  });

  useEffect(() => setTitle(list.title), [list.title]);

  const saveTitle = () => {
    setEditing(false);
    const next = title.trim();
    if (next && next !== list.title) onRename(next);
    else setTitle(list.title);
  };

  const over = list.wip_limit ? cards.length > list.wip_limit : false;
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    ...(list.color ? ({ "--list-color": paletteColor(list.color).hex } as CSSProperties) : {}),
  };

  return (
    <section
      ref={setNodeRef}
      className="kanban-list"
      data-dragging={isDragging}
      data-colored={Boolean(list.color)}
      style={style}
      aria-label={list.title}
    >
      <header className="kanban-list-header" {...attributes} {...listeners}>
        {editing ? (
          <input
            className="kanban-list-title-input"
            // The header is the drag handle; typing must not start a drag.
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") saveTitle();
              if (event.key === "Escape") {
                setTitle(list.title);
                setEditing(false);
              }
            }}
            maxLength={100}
            value={title}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            onBlur={saveTitle}
          />
        ) : (
          <h3
            className="kanban-list-title"
            dir="auto"
            onClick={() => setEditing(true)}
            title={t("boards.renameList")}
          >
            {list.title}
          </h3>
        )}
        <span
          className="kanban-count"
          data-over={over}
          title={list.wip_limit ? t("boards.wipLimit") : undefined}
        >
          {calendar.formatNumber(cards.length)}
          {list.wip_limit ? ` / ${calendar.formatNumber(list.wip_limit)}` : ""}
        </span>
        <Popover
          label={t("boards.listActions")}
          align="end"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className="icon-button small"
              aria-expanded={open}
              aria-label={t("boards.listActions")}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={toggle}
            >
              <MoreIcon />
            </button>
          )}
        >
          {(close) => (
            <div
              className="menu-list list-menu"
              role="menu"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  close();
                  setAdding(true);
                }}
              >
                <PlusIcon /> {t("boards.addCard")}
              </button>
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  close();
                  setSuggesting(true);
                }}
              >
                <SparkleIcon /> {t("boards.aiCards")}
              </button>
              <div className="menu-separator" />
              <p className="menu-heading with-icon">
                <SortIcon /> {t("boards.sortBy")}
              </p>
              {(["due", "title", "newest", "oldest"] as const).map((by) => (
                <button
                  key={by}
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    close();
                    onSort(by);
                  }}
                >
                  {t(`boards.sort.${by}`)}
                </button>
              ))}
              <div className="menu-separator" />
              <p className="menu-heading">{t("boards.listColor")}</p>
              <div className="menu-chips">
                <ColorPicker
                  label={t("boards.listColor")}
                  size="sm"
                  value={list.color ?? "slate"}
                  onChange={(color) => onChange({ color })}
                />
                {list.color && (
                  <button type="button" className="mini-chip" onClick={() => onChange({ color: null })}>
                    {t("boards.noColor")}
                  </button>
                )}
              </div>
              <label className="menu-field">
                <span>{t("boards.wipLimit")}</span>
                <input
                  type="number"
                  min={0}
                  max={999}
                  placeholder="–"
                  value={wip}
                  onChange={(event) => setWip(event.target.value)}
                  onBlur={() => onChange({ wip_limit: wip ? Number(wip) : null })}
                />
              </label>
              <div className="menu-separator" />
              <button
                type="button"
                className="menu-item"
                disabled={!cards.length}
                onClick={() => {
                  close();
                  onArchiveCards();
                }}
              >
                <ArchiveIcon /> {t("boards.archiveAll")}
              </button>
              <button
                type="button"
                className="menu-item danger"
                onClick={async () => {
                  close();
                  const ok = await confirm({
                    title: t("boards.deleteListTitle", { title: list.title }),
                    message: t("boards.deleteListMessage"),
                    confirmLabel: t("common.delete"),
                    danger: true,
                  });
                  if (ok) onDelete();
                }}
              >
                <TrashIcon /> {t("boards.deleteList")}
              </button>
            </div>
          )}
        </Popover>
      </header>

      <SortableContext items={cards.map((card) => cardDndId(card.id))} strategy={verticalListSortingStrategy}>
        <ol ref={setBodyRef} className="kanban-cards" data-empty={cards.length === 0}>
          {cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              labels={labels}
              disabled={dragDisabled}
              onOpen={() => onOpenCard(card.id)}
            />
          ))}
        </ol>
      </SortableContext>

      {suggesting && (
        <AiSuggestDialog
          kind="cards"
          title={t("boards.aiCardsTitle", { list: list.title })}
          hint={t("boards.aiCardsHint")}
          placeholder={t("boards.aiCardsPlaceholder")}
          count={6}
          onClose={() => setSuggesting(false)}
          onAccept={async (items) => {
            for (const item of items) onAddCard(item.title.slice(0, 300));
          }}
        />
      )}
      {adding ? (
        <Composer onAdd={onAddCard} onClose={() => setAdding(false)} />
      ) : (
        <button type="button" className="kanban-add-card" onClick={() => setAdding(true)}>
          <PlusIcon /> {t("boards.addCard")}
        </button>
      )}
    </section>
  );
}
