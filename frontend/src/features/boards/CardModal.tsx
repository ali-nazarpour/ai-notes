/**
 * Card details: title, list, labels, dates, rich description, checklists, attachments,
 * cover and comments, plus move / copy / archive / delete. Every change is saved at once
 * (the description after a short pause) and mirrored on the board.
 */
import { useQueryClient } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import { boardsApi, filesApi } from "../../api/endpoints";
import { queryKeys, useCard } from "../../api/queries";
import { DatePicker } from "../../components/DatePicker";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  ArchiveIcon,
  AttachmentIcon,
  BoardIcon,
  CheckIcon,
  ChecklistIcon,
  ClockIcon,
  CloseIcon,
  CommentIcon,
  CopyIcon,
  DescriptionIcon,
  ImageIcon,
  PlusIcon,
  RefreshIcon,
  TagIcon,
  TrashIcon,
  FileIcon,
  MusicIcon,
  SparkleIcon,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { COLORS, paletteColor } from "../../lib/palette";
import { Popover, Skeleton } from "../../components/ui";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { cardCoverStyle, dueStatus, newId } from "../../lib/boards";
import type { Board, CardChanges, CardDetail, Checklist } from "../../types";
import { AiSuggestDialog } from "../ai/AiSuggestDialog";
import { NoteEditor } from "../editor/NoteEditor";
import { useBoardActions } from "./useBoardActions";

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

function Section({
  icon: SectionIcon,
  title,
  actions,
  children,
}: {
  icon: () => React.JSX.Element;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card-section">
      <header className="card-section-header">
        <SectionIcon />
        <h3>{title}</h3>
        {actions && <div className="card-section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

function ChecklistView({
  checklist,
  onChange,
  onDelete,
}: {
  checklist: Checklist;
  onChange: (checklist: Checklist) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const done = checklist.items.filter((item) => item.done).length;
  const percent = checklist.items.length ? Math.round((done / checklist.items.length) * 100) : 0;
  const items = hideDone ? checklist.items.filter((item) => !item.done) : checklist.items;

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    onChange({ ...checklist, items: [...checklist.items, { id: newId(), text: draft.trim(), done: false }] });
    setDraft("");
  };

  return (
    <Section
      icon={ChecklistIcon}
      title={checklist.title}
      actions={
        <>
          {done > 0 && (
            <button type="button" className="ghost small" onClick={() => setHideDone(!hideDone)}>
              {hideDone ? t("boards.showChecked", { count: done }) : t("boards.hideChecked")}
            </button>
          )}
          <button type="button" className="ghost small" onClick={onDelete}>
            {t("common.delete")}
          </button>
        </>
      }
    >
      <div className="checklist-progress" data-complete={percent === 100}>
        <span>{t("home.percent", { value: percent })}</span>
        <span className="progress">
          <span style={{ width: `${percent}%` }} />
        </span>
      </div>
      <ul className="checklist-items">
        {items.map((item) => (
          <li key={item.id} data-done={item.done}>
            <input
              type="checkbox"
              checked={item.done}
              aria-label={item.text}
              onChange={() =>
                onChange({
                  ...checklist,
                  items: checklist.items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)),
                })
              }
            />
            <input
              type="text"
              className="checklist-text"
              maxLength={500}
              defaultValue={item.text}
              onBlur={(event) => {
                const text = event.target.value.trim();
                if (text && text !== item.text) {
                  onChange({
                    ...checklist,
                    items: checklist.items.map((i) => (i.id === item.id ? { ...i, text } : i)),
                  });
                }
              }}
            />
            <button
              type="button"
              className="icon-button small"
              aria-label={t("common.delete")}
              onClick={() =>
                onChange({ ...checklist, items: checklist.items.filter((i) => i.id !== item.id) })
              }
            >
              <CloseIcon />
            </button>
          </li>
        ))}
      </ul>
      <form className="inline-form checklist-add" onSubmit={add}>
        <input
          type="text"
          maxLength={500}
          placeholder={t("boards.addItem")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="small" disabled={!draft.trim()}>
          {t("common.add")}
        </button>
      </form>
    </Section>
  );
}

function CardBody({ board, card, onClose }: { board: Board; card: CardDetail; onClose: () => void }) {
  const i18n = useI18n();
  const { t, calendar, relativeDay } = i18n;
  const client = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const actions = useBoardActions(board.id);
  const [title, setTitle] = useState(card.title);
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState<number | null>(null);
  const [checklistTitle, setChecklistTitle] = useState("");
  const [aiChecklist, setAiChecklist] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDesc = useRef<CardChanges | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const list = board.lists.find((l) => l.id === card.list_id);
  const status = dueStatus(card);

  const cardKey = queryKeys.card(board.id, card.id);
  const patch = useCallback(
    async (changes: CardChanges) => {
      client.setQueryData<CardDetail>(cardKey, (old) => (old ? { ...old, ...changes } : old));
      await actions.updateCard(card.id, changes);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, actions, card.id],
  );

  const flushDescription = useCallback(() => {
    if (descTimer.current) clearTimeout(descTimer.current);
    descTimer.current = null;
    if (pendingDesc.current) {
      const changes = pendingDesc.current;
      pendingDesc.current = null;
      void actions.updateCard(card.id, changes);
    }
  }, [actions, card.id]);

  useEffect(() => flushDescription, [flushDescription]);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  const initialDescription = useMemo(() => (card.description as JSONContent | null) ?? EMPTY_DOC, [card.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDescription = useCallback(
    (doc: JSONContent, text: string) => {
      pendingDesc.current = { description: doc, description_text: text };
      if (descTimer.current) clearTimeout(descTimer.current);
      descTimer.current = setTimeout(flushDescription, 800);
    },
    [flushDescription],
  );

  async function upload(files: File[]) {
    for (const file of files) {
      setUploading(0);
      try {
        const stored = await filesApi.upload(file, setUploading);
        const latest = client.getQueryData<CardDetail>(cardKey) ?? card;
        const attachment = {
          id: stored.id,
          name: file.name.slice(0, 255),
          kind: stored.kind,
          url: stored.url,
        };
        await patch({
          attachments: [...latest.attachments, attachment],
          ...(latest.cover || stored.kind !== "image" ? {} : { cover: stored.url }),
        });
      } catch (error) {
        toast(errorMessage(error, i18n), "error");
      } finally {
        setUploading(null);
      }
    }
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    try {
      const created = await boardsApi.addComment(board.id, card.id, comment.trim());
      client.setQueryData<CardDetail>(cardKey, (old) =>
        old ? { ...old, comments: [created, ...old.comments], comment_count: old.comment_count + 1 } : old,
      );
      actions.setBoard((b) => ({
        ...b,
        lists: b.lists.map((l) => ({
          ...l,
          cards: l.cards.map((c) => (c.id === card.id ? { ...c, comment_count: c.comment_count + 1 } : c)),
        })),
      }));
      setComment("");
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
    }
  }

  async function removeComment(commentId: number) {
    await boardsApi.removeComment(board.id, card.id, commentId).catch(() => undefined);
    client.setQueryData<CardDetail>(cardKey, (old) =>
      old
        ? {
            ...old,
            comments: old.comments.filter((c) => c.id !== commentId),
            comment_count: old.comment_count - 1,
          }
        : old,
    );
    void actions.reload();
  }

  async function remove() {
    const ok = await confirm({
      title: t("boards.deleteCardTitle"),
      message: t("boards.deleteCardMessage", { title: card.title }),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    onClose();
    await actions.removeCard(card.id);
  }

  const toggleLabel = (id: string) =>
    void patch({
      label_ids: card.label_ids.includes(id)
        ? card.label_ids.filter((x) => x !== id)
        : [...card.label_ids, id],
    });

  const cardLabels = board.labels.filter((label) => card.label_ids.includes(label.id));
  const imageAttachments = card.attachments.filter((a) => a.kind === "image");

  const labelsPopover = (trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode) => (
    <Popover label={t("boards.labels")} align="end" trigger={trigger}>
      {() => (
        <div className="label-picker">
          {board.labels.map((label) => (
            <label key={label.id} className="check-row">
              <input
                type="checkbox"
                checked={card.label_ids.includes(label.id)}
                onChange={() => toggleLabel(label.id)}
              />
              <span className="label-swatch" style={{ background: paletteColor(label.color).hex }}>
                {label.name}
              </span>
            </label>
          ))}
        </div>
      )}
    </Popover>
  );

  return (
    <div className="card-modal-content">
      {card.cover && (
        <div
          className={card.cover.startsWith("/api/files/") ? "card-modal-cover image" : "card-modal-cover"}
          style={cardCoverStyle(card.cover)}
        />
      )}
      <div className="card-modal-head">
        <BoardIcon />
        <div className="card-modal-title">
          <textarea
            ref={titleRef}
            rows={1}
            maxLength={300}
            value={title}
            aria-label={t("boards.cardTitle")}
            onChange={(event) => setTitle(event.target.value.replace(/\n/g, " "))}
            onKeyDown={(event) =>
              event.key === "Enter" && (event.preventDefault(), event.currentTarget.blur())
            }
            onBlur={() => {
              const next = title.trim();
              if (next && next !== card.title) void patch({ title: next });
              else setTitle(card.title);
            }}
          />
          <p className="muted small">
            {t("boards.inList")}{" "}
            <select
              className="inline-select"
              value={card.list_id}
              onChange={(event) => void patch({ list_id: Number(event.target.value), index: 0 })}
              aria-label={t("boards.moveTo")}
            >
              {board.lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
            {card.archived && <span className="badge">{t("boards.archivedBadge")}</span>}
          </p>
        </div>
      </div>

      <div className="card-modal-grid">
        <div className="card-modal-main">
          {(cardLabels.length > 0 || card.due_date || card.start_date) && (
            <div className="card-meta">
              {cardLabels.length > 0 && (
                <div className="card-meta-block">
                  <span className="card-meta-label">{t("boards.labels")}</span>
                  <div className="card-label-list">
                    {cardLabels.map((label) => (
                      <span
                        key={label.id}
                        className="label-chip"
                        style={{ "--cat": paletteColor(label.color).hex } as CSSProperties}
                      >
                        {label.name || " "}
                      </span>
                    ))}
                    {labelsPopover(({ open, toggle }) => (
                      <button
                        type="button"
                        className="icon-button small"
                        aria-expanded={open}
                        onClick={toggle}
                        aria-label={t("boards.labels")}
                      >
                        <PlusIcon />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {card.due_date && (
                <div className="card-meta-block">
                  <span className="card-meta-label">{t("boards.dueDate")}</span>
                  <label className="due-chip" data-status={status}>
                    <input
                      type="checkbox"
                      checked={card.due_done}
                      onChange={() => void patch({ due_done: !card.due_done })}
                    />
                    {card.start_date && `${relativeDay(card.start_date)} – `}
                    {relativeDay(card.due_date)}
                    {status && status !== "later" && (
                      <span className="due-status">{t(`boards.due.${status}`)}</span>
                    )}
                  </label>
                </div>
              )}
            </div>
          )}

          <Section icon={DescriptionIcon} title={t("boards.description")}>
            <div className="card-description">
              <NoteEditor key={card.id} initialContent={initialDescription} onChange={onDescription} />
            </div>
          </Section>

          {card.checklists.map((checklist) => (
            <ChecklistView
              key={checklist.id}
              checklist={checklist}
              onChange={(next) =>
                void patch({ checklists: card.checklists.map((c) => (c.id === next.id ? next : c)) })
              }
              onDelete={() =>
                void patch({ checklists: card.checklists.filter((c) => c.id !== checklist.id) })
              }
            />
          ))}

          {(card.attachments.length > 0 || uploading !== null) && (
            <Section icon={AttachmentIcon} title={t("boards.attachments")}>
              {uploading !== null && (
                <div className="upload-progress" role="status">
                  <span>{t("editor.uploading")}</span>
                  <span className="upload-bar">
                    <span style={{ width: `${Math.round(uploading * 100)}%` }} />
                  </span>
                </div>
              )}
              <ul className="attachment-grid">
                {card.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <a href={attachment.url} target="_blank" rel="noreferrer" className="attachment-thumb">
                      {attachment.kind === "image" ? (
                        <img src={attachment.url} alt="" loading="lazy" />
                      ) : attachment.kind === "video" ? (
                        <video src={attachment.url} preload="metadata" muted />
                      ) : (
                        <span className="attachment-file">
                          {attachment.kind === "audio" ? <MusicIcon /> : <FileIcon />}
                        </span>
                      )}
                    </a>
                    <span className="attachment-name" dir="auto" title={attachment.name}>
                      {attachment.name || attachment.kind}
                    </span>
                    <span className="attachment-actions">
                      {attachment.kind === "image" && (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() =>
                            void patch({ cover: card.cover === attachment.url ? null : attachment.url })
                          }
                        >
                          {card.cover === attachment.url ? t("boards.removeCover") : t("boards.makeCover")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="link-button danger"
                        onClick={() =>
                          void patch({
                            attachments: card.attachments.filter((a) => a.id !== attachment.id),
                            ...(card.cover === attachment.url ? { cover: null } : {}),
                          })
                        }
                      >
                        {t("common.remove")}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section icon={CommentIcon} title={t("boards.comments")}>
            <form className="comment-form" onSubmit={addComment}>
              <textarea
                rows={2}
                maxLength={5000}
                placeholder={t("boards.commentPlaceholder")}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void addComment(event);
                }}
              />
              {comment.trim() && (
                <button type="submit" className="primary small">
                  {t("boards.saveComment")}
                </button>
              )}
            </form>
            <ul className="comment-list">
              {card.comments.map((item) => (
                <li key={item.id}>
                  <p dir="auto">{item.text}</p>
                  <span className="muted small">
                    {calendar.dateTime(item.created_at)} ·{" "}
                    <button type="button" className="link-button" onClick={() => void removeComment(item.id)}>
                      {t("common.delete")}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <aside className="card-modal-side">
          <p className="card-side-heading">{t("boards.addToCard")}</p>
          {labelsPopover(({ open, toggle }) => (
            <button type="button" className="card-side-button" aria-expanded={open} onClick={toggle}>
              <TagIcon /> {t("boards.labels")}
            </button>
          ))}
          <button type="button" className="card-side-button" onClick={() => setAiChecklist(true)}>
            <SparkleIcon /> {t("boards.aiChecklist")}
          </button>
          {aiChecklist && (
            <AiSuggestDialog
              kind="checklist"
              title={t("boards.aiChecklist")}
              initialText={`${card.title}
${card.description_text ?? ""}`.trim()}
              count={6}
              onClose={() => setAiChecklist(false)}
              onAccept={async (items) => {
                await patch({
                  checklists: [
                    ...card.checklists,
                    {
                      id: newId(),
                      title: t("boards.aiChecklistTitle"),
                      items: items.map((item) => ({
                        id: newId(),
                        text: item.title.slice(0, 500),
                        done: false,
                      })),
                    },
                  ],
                });
              }}
            />
          )}
          <Popover
            label={t("boards.checklist")}
            align="end"
            trigger={({ open, toggle }) => (
              <button type="button" className="card-side-button" aria-expanded={open} onClick={toggle}>
                <ChecklistIcon /> {t("boards.checklist")}
              </button>
            )}
          >
            {(close) => (
              <form
                className="stack popover-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void patch({
                    checklists: [
                      ...card.checklists,
                      { id: newId(), title: checklistTitle.trim() || t("boards.checklist"), items: [] },
                    ],
                  });
                  setChecklistTitle("");
                  close();
                }}
              >
                <input
                  type="text"
                  autoFocus
                  maxLength={200}
                  placeholder={t("boards.checklist")}
                  value={checklistTitle}
                  onChange={(event) => setChecklistTitle(event.target.value)}
                />
                <button type="submit" className="primary small">
                  {t("common.add")}
                </button>
              </form>
            )}
          </Popover>
          <Popover
            label={t("boards.dates")}
            align="end"
            trigger={({ open, toggle }) => (
              <button type="button" className="card-side-button" aria-expanded={open} onClick={toggle}>
                <ClockIcon /> {t("boards.dates")}
              </button>
            )}
          >
            {() => (
              <div className="dates-editor">
                <span className="field-label">{t("boards.startDate")}</span>
                <DatePicker value={card.start_date} onChange={(start_date) => void patch({ start_date })} />
                <span className="field-label">{t("boards.dueDate")}</span>
                <DatePicker value={card.due_date} onChange={(due_date) => void patch({ due_date })} />
                {(card.start_date || card.due_date) && (
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => void patch({ start_date: null, due_date: null, due_done: false })}
                  >
                    {t("boards.clearDates")}
                  </button>
                )}
              </div>
            )}
          </Popover>
          <button type="button" className="card-side-button" onClick={() => fileInput.current?.click()}>
            <AttachmentIcon /> {t("boards.attachment")}
          </button>
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            accept="image/*,video/mp4,video/webm,video/quicktime,audio/*,.pdf,.docx,.xlsx,.pptx,.zip,.txt,.md,.csv,.json"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length) void upload(files);
            }}
          />
          <Popover
            label={t("boards.cover")}
            align="end"
            trigger={({ open, toggle }) => (
              <button type="button" className="card-side-button" aria-expanded={open} onClick={toggle}>
                <ImageIcon /> {t("boards.cover")}
              </button>
            )}
          >
            {(close) => (
              <div className="cover-menu">
                <div className="swatches swatches-sm">
                  {COLORS.map((color) => (
                    <button
                      key={color.name}
                      type="button"
                      className="swatch"
                      style={{ background: color.hex, color: color.onColor }}
                      aria-pressed={card.cover === `color:${color.name}`}
                      aria-label={t(`color.${color.name}`)}
                      onClick={() => void patch({ cover: `color:${color.name}` })}
                    >
                      {card.cover === `color:${color.name}` && <CheckIcon />}
                    </button>
                  ))}
                </div>
                {imageAttachments.length > 0 && (
                  <div className="cover-images">
                    {imageAttachments.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="cover-option"
                        style={{ backgroundImage: `url("${a.url}")` }}
                        aria-pressed={card.cover === a.url}
                        aria-label={a.name}
                        onClick={() => void patch({ cover: a.url })}
                      />
                    ))}
                  </div>
                )}
                {card.cover && (
                  <button
                    type="button"
                    className="ghost small block"
                    onClick={() => {
                      void patch({ cover: null });
                      close();
                    }}
                  >
                    {t("boards.removeCover")}
                  </button>
                )}
              </div>
            )}
          </Popover>

          <p className="card-side-heading">{t("boards.actions")}</p>
          <button
            type="button"
            className="card-side-button"
            onClick={async () => {
              await actions.copyCard(card.id);
              toast(t("boards.copied"), "success");
            }}
          >
            <CopyIcon /> {t("boards.copy")}
          </button>
          {card.archived ? (
            <button
              type="button"
              className="card-side-button"
              onClick={() => void patch({ archived: false })}
            >
              <RefreshIcon /> {t("boards.restore")}
            </button>
          ) : (
            <button
              type="button"
              className="card-side-button"
              onClick={async () => {
                await patch({ archived: true });
                toast(t("boards.archivedToast"));
                onClose();
              }}
            >
              <ArchiveIcon /> {t("boards.archive")}
            </button>
          )}
          <button type="button" className="card-side-button danger" onClick={() => void remove()}>
            <TrashIcon /> {t("common.delete")}
          </button>
          {list && (
            <p className="hint card-side-info">
              {t("boards.createdAt", { date: calendar.dateTime(card.created_at) })}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

export function CardModal({ board, cardId, onClose }: { board: Board; cardId: number; onClose: () => void }) {
  const { t } = useI18n();
  const { data: card, isLoading, error } = useCard(board.id, cardId);
  return (
    <Modal title={card?.title ?? t("boards.card")} onClose={onClose} size="xl" className="card-modal" bare>
      <button
        type="button"
        className="icon-button card-modal-close"
        onClick={onClose}
        aria-label={t("common.close")}
      >
        <CloseIcon />
      </button>
      {isLoading ? (
        <Skeleton rows={5} height={40} />
      ) : error || !card ? (
        <p className="empty-inline">{t("errors.card_not_found")}</p>
      ) : (
        <CardBody board={board} card={card} onClose={onClose} />
      )}
    </Modal>
  );
}
