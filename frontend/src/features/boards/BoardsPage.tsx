/** All boards: starred first, then recent; plus "create board" with background and template. */
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { boardsApi } from "../../api/endpoints";
import { queryKeys, useBoards } from "../../api/queries";
import { BackgroundGrid } from "../../components/BackgroundGrid";
import { useToast } from "../../components/Feedback";
import { BoardIcon, PlusIcon, StarIcon } from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { EmptyState, PageHeader, Skeleton } from "../../components/ui";
import { matchesQuery, usePageQuery } from "../../hooks/usePageQuery";
import { useI18n, type TranslationKey } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { BOARD_GRADIENTS, boardBackgroundStyle, isLightBackground } from "../../lib/boards";
import { COLORS } from "../../lib/palette";
import type { BoardSummary, BoardTemplate } from "../../types";

const TEMPLATES: { id: BoardTemplate; label: TranslationKey; hint: TranslationKey }[] = [
  { id: "kanban", label: "boards.template.kanban", hint: "boards.template.kanbanHint" },
  { id: "project", label: "boards.template.project", hint: "boards.template.projectHint" },
  { id: "weekly", label: "boards.template.weekly", hint: "boards.template.weeklyHint" },
  { id: "personal", label: "boards.template.personal", hint: "boards.template.personalHint" },
  { id: "blank", label: "boards.template.blank", hint: "boards.template.blankHint" },
];

export function BackgroundPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  const option = (background: string) => ({
    value: background,
    style: boardBackgroundStyle(background),
    label: background.startsWith("color:")
      ? t(`color.${background.slice(6)}` as TranslationKey)
      : background.slice(9).replace(/^./, (c) => c.toUpperCase()),
  });
  return (
    <BackgroundGrid
      label={t("boards.background")}
      value={value}
      onChange={onChange}
      groups={[
        {
          id: "gradients",
          label: t("bg.gradients"),
          options: Object.keys(BOARD_GRADIENTS).map((n) => option(`gradient:${n}`)),
        },
        { id: "colors", label: t("bg.colors"), options: COLORS.map((c) => option(`color:${c.name}`)) },
      ]}
    />
  );
}

export function CreateBoardDialog({ onClose }: { onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [background, setBackground] = useState(
    () => `gradient:${Object.keys(BOARD_GRADIENTS)[Math.floor(Math.random() * 12)]}`,
  );
  const [template, setTemplate] = useState<BoardTemplate>("kanban");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const board = await boardsApi.create(title.trim(), background, template);
      client.setQueryData(queryKeys.board(board.id), board);
      client.invalidateQueries({ queryKey: queryKeys.boards });
      onClose();
      navigate(`/boards/${board.id}`);
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("boards.create")}
      icon={BoardIcon}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" form="board-form" className="primary" disabled={busy || !title.trim()}>
            {busy ? t("common.saving") : t("common.create")}
          </button>
        </>
      }
    >
      <form id="board-form" className="modal-split board-form" onSubmit={submit}>
        <aside className="modal-split-aside">
          <div
            className="board-preview"
            style={boardBackgroundStyle(background)}
            data-light={isLightBackground(background)}
            aria-hidden="true"
          >
            <span className="board-preview-title">{title.trim() || t("boards.titlePlaceholder")}</span>
            <span className="board-preview-lists">
              <span />
              <span />
              <span />
            </span>
          </div>
          <label className="form-field">
            <span className="field-label">{t("boards.title")}</span>
            <input
              type="text"
              data-autofocus
              required
              maxLength={100}
              placeholder={t("boards.titlePlaceholder")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <div className="form-field">
            <span className="field-label">{t("boards.background")}</span>
            <BackgroundPicker value={background} onChange={setBackground} />
          </div>
        </aside>
        <div className="stack">
          <div className="form-field">
            <span className="field-label">{t("boards.template")}</span>
            <div className="template-options" role="radiogroup" aria-label={t("boards.template")}>
              {TEMPLATES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={template === item.id}
                  className="template-option"
                  onClick={() => setTemplate(item.id)}
                >
                  <strong>{t(item.label)}</strong>
                  <span className="muted small">{t(item.hint)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function BoardTile({ board }: { board: BoardSummary }) {
  const { t, plural } = useI18n();
  const client = useQueryClient();

  async function toggleStar(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    client.setQueryData<BoardSummary[]>(queryKeys.boards, (old) =>
      old?.map((b) => (b.id === board.id ? { ...b, starred: !b.starred } : b)),
    );
    await boardsApi.update(board.id, { starred: !board.starred }).catch(() => undefined);
    client.invalidateQueries({ queryKey: queryKeys.boards });
    client.invalidateQueries({ queryKey: queryKeys.board(board.id) });
  }

  return (
    <Link
      to={`/boards/${board.id}`}
      className="board-tile"
      style={boardBackgroundStyle(board.background)}
      data-light={isLightBackground(board.background)}
    >
      <span className="board-tile-title" dir="auto">
        {board.title}
      </span>
      <span className="board-tile-meta">
        {plural("boards.lists", board.list_count)} · {plural("boards.cards", board.card_count)}
      </span>
      <button
        type="button"
        className="board-star"
        aria-pressed={board.starred}
        aria-label={board.starred ? t("boards.unstar") : t("boards.star")}
        title={board.starred ? t("boards.unstar") : t("boards.star")}
        onClick={(event) => void toggleStar(event)}
      >
        <StarIcon filled={board.starred} />
      </button>
    </Link>
  );
}

export function BoardsPage() {
  const { t } = useI18n();
  const { data: allBoards = [], isLoading } = useBoards();
  const query = usePageQuery();
  const boards = allBoards.filter((board) => matchesQuery(query, board.title, board.description));
  const [creating, setCreating] = useState(false);
  const starred = boards.filter((board) => board.starred);

  return (
    <section className="boards-page" aria-labelledby="page-title">
      <PageHeader
        title={<span id="page-title">{t("nav.boards")}</span>}
        subtitle={t("boards.subtitle")}
        actions={
          <button type="button" className="primary" onClick={() => setCreating(true)}>
            <PlusIcon /> {t("boards.create")}
          </button>
        }
      />

      {isLoading ? (
        <Skeleton rows={3} height={110} />
      ) : !boards.length ? (
        <EmptyState
          icon={BoardIcon}
          title={t("boards.emptyTitle")}
          hint={t("boards.emptyHint")}
          action={
            <button type="button" className="primary" onClick={() => setCreating(true)}>
              <PlusIcon /> {t("boards.create")}
            </button>
          }
        />
      ) : (
        <>
          {starred.length > 0 && (
            <>
              <h2 className="section-title with-icon">
                <StarIcon filled /> {t("boards.starred")}
              </h2>
              <div className="board-grid">
                {starred.map((board) => (
                  <BoardTile key={board.id} board={board} />
                ))}
              </div>
            </>
          )}
          <h2 className="section-title">{t("boards.all")}</h2>
          <div className="board-grid">
            {boards.map((board) => (
              <BoardTile key={board.id} board={board} />
            ))}
            <button type="button" className="board-tile board-tile-new" onClick={() => setCreating(true)}>
              <PlusIcon />
              <span>{t("boards.create")}</span>
            </button>
          </div>
        </>
      )}

      {creating && <CreateBoardDialog onClose={() => setCreating(false)} />}
    </section>
  );
}
