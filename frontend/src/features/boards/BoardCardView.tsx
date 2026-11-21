/** The front of a card on the board: cover, labels, title and badges. */
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";

import {
  AttachmentIcon,
  ChecklistIcon,
  ClockIcon,
  CommentIcon,
  DescriptionIcon,
} from "../../components/Icons";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useI18n } from "../../i18n";
import { cardCoverStyle, dueStatus } from "../../lib/boards";
import { paletteColor } from "../../lib/palette";
import type { BoardLabel, CardSummary } from "../../types";

export const cardDndId = (id: number) => `card-${id}`;

export function CardFace({
  card,
  labels,
  overlay = false,
}: {
  card: CardSummary;
  labels: BoardLabel[];
  overlay?: boolean;
}) {
  const { t, calendar } = useI18n();
  const [expanded, setExpanded] = useLocalStorage("notes.boardLabelsExpanded", false);
  const cardLabels = card.label_ids
    .map((id) => labels.find((label) => label.id === id))
    .filter((label): label is BoardLabel => Boolean(label));
  const status = dueStatus(card);
  const image = card.cover?.startsWith("/api/files/");
  const checklistDone = card.checklist_total > 0 && card.checklist_done === card.checklist_total;

  return (
    <div className="kanban-card-inner" data-overlay={overlay}>
      {card.cover && (
        <div
          className={image ? "kanban-cover kanban-cover-image" : "kanban-cover"}
          style={cardCoverStyle(card.cover)}
          aria-hidden="true"
        />
      )}
      <div className="kanban-card-body">
        {cardLabels.length > 0 && (
          <div className="kanban-labels" data-expanded={expanded}>
            {cardLabels.map((label) => (
              <button
                key={label.id}
                type="button"
                className="kanban-label"
                style={{ "--cat": paletteColor(label.color).hex } as CSSProperties}
                title={label.name || t(`color.${label.color}`)}
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded(!expanded);
                }}
              >
                {expanded && <span dir="auto">{label.name}</span>}
              </button>
            ))}
          </div>
        )}
        <span className="kanban-card-title" dir="auto">
          {card.title}
        </span>
        {(status ||
          card.has_description ||
          card.comment_count > 0 ||
          card.checklist_total > 0 ||
          card.attachment_count > 0) && (
          <div className="kanban-badges">
            {status && card.due_date && (
              <span className="kanban-badge due" data-status={status} title={t(`boards.due.${status}`)}>
                <ClockIcon />
                {card.start_date && `${calendar.shortDate(card.start_date)} – `}
                {calendar.shortDate(card.due_date)}
              </span>
            )}
            {card.has_description && (
              <span className="kanban-badge" title={t("boards.hasDescription")}>
                <DescriptionIcon />
              </span>
            )}
            {card.comment_count > 0 && (
              <span className="kanban-badge" title={t("boards.comments")}>
                <CommentIcon /> {calendar.formatNumber(card.comment_count)}
              </span>
            )}
            {card.attachment_count > 0 && (
              <span className="kanban-badge" title={t("boards.attachments")}>
                <AttachmentIcon /> {calendar.formatNumber(card.attachment_count)}
              </span>
            )}
            {card.checklist_total > 0 && (
              <span
                className="kanban-badge checklist"
                data-done={checklistDone}
                title={t("boards.checklist")}
              >
                <ChecklistIcon /> {calendar.formatNumber(card.checklist_done)}/
                {calendar.formatNumber(card.checklist_total)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function SortableCard({
  card,
  labels,
  onOpen,
  disabled,
}: {
  card: CardSummary;
  labels: BoardLabel[];
  onOpen: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardDndId(card.id),
    data: { type: "card", card },
    disabled: disabled || card.id < 0,
  });
  return (
    <li
      ref={setNodeRef}
      className="kanban-card"
      data-dragging={isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={card.title}
      onClick={() => card.id > 0 && onOpen()}
      onKeyDown={(event) => {
        // Enter opens the card; Space starts a keyboard drag (dnd-kit).
        if (event.key === "Enter" && event.target === event.currentTarget && card.id > 0) onOpen();
        else listeners?.onKeyDown?.(event);
      }}
    >
      <CardFace card={card} labels={labels} />
    </li>
  );
}
