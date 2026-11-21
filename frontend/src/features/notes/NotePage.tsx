/**
 * A note, Notion-style: cover, title and the rich editor on one page.
 *
 * The "⋯" menu (PageMenu) offers copy link/contents, duplicate, move (category or
 * workspace), version history, share, appearance (font, small text, full width, outline),
 * AI, lock, import/export and "move to trash". Viewers and locked pages are read-only.
 *
 * Saving: edits are collected and sent ~0.7 s after typing stops (PATCH with only the
 * changed fields). Pending edits are also saved when leaving the page or hiding the tab,
 * and the browser warns before closing with unsaved changes. A brand-new note that is
 * left completely empty is deleted automatically.
 */
import { useQueryClient } from "@tanstack/react-query";
import type { Editor, JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";

import { notesApi } from "../../api/endpoints";
import { notesExtraApi } from "../../api/v4";
import { Outline } from "../../components/Outline";
import { DEFAULT_SETTINGS, PageMenu, type ExportFormat } from "../../components/PageMenu";
import {
  docToMarkdown,
  downloadText,
  printHtml,
  readImport,
  safeFilename,
  standaloneHtml,
} from "../../lib/exporters";
import { RevisionDialog } from "../sharing/RevisionDialog";
import { ShareDialog } from "../sharing/ShareDialog";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { queryKeys, useCategories, useNote } from "../../api/queries";
import { CategorySelect } from "../../components/CategoryBits";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  BackIcon,
  CheckIcon,
  EyeIcon,
  InboxIcon,
  LockIcon,
  ShareIcon,
  SparkleIcon,
} from "../../components/Icons";
import { EmptyState, FavoriteButton, Skeleton } from "../../components/ui";
import { plainText, useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { coverStyle } from "../../lib/covers";
import { markdownToContent, plainTextToDoc } from "../../lib/markdown";
import type { Note, NoteChanges, NoteSettings } from "../../types";
import { NoteEditor } from "../editor/NoteEditor";
import { CoverPicker } from "./CoverPicker";
import { NoteAiPanel } from "./NoteAiPanel";

type SaveState = "saved" | "pending" | "saving" | "error";

export function NotePage() {
  const { id } = useParams();
  const noteId = Number(id);
  const { t } = useI18n();
  const { data: note, isLoading, error } = useNote(noteId);

  if (isLoading) return <Skeleton rows={6} height={48} />;
  if (error || !note) {
    return (
      <EmptyState
        icon={InboxIcon}
        title={t("errors.note_not_found")}
        action={
          <Link to="/notes" className="button">
            {t("notes.backToNotes")}
          </Link>
        }
      />
    );
  }
  return <NoteDocument key={note.id} note={note} />;
}

function NoteDocument({ note }: { note: Note }) {
  const i18n = useI18n();
  const { t, calendar, plural, dir } = i18n;
  const { workspaces, workspace } = useWorkspace();
  const [settings, setSettings] = useState<NoteSettings>({ ...DEFAULT_SETTINGS, ...note.settings });
  const [dialog, setDialog] = useState<"history" | "share" | null>(null);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const viewer = note.role === "viewer";
  const readOnly = viewer || settings.locked;
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: categories = [] } = useCategories();

  const [title, setTitle] = useState(note.title);
  const [meta, setMeta] = useState({
    cover: note.cover,
    category_id: note.category_id,
    is_favorite: note.is_favorite,
    updated_at: note.updated_at,
  });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [words, setWords] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const pending = useRef<NoteChanges>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ title: note.title, content: note.content, cover: note.cover });
  const deleted = useRef(false);

  const initialContent = useMemo<JSONContent>(
    () => (note.body as JSONContent | null) ?? plainTextToDoc(note.content),
    [note.body, note.content],
  );

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const changes = pending.current;
    if (!Object.keys(changes).length || deleted.current) return;
    pending.current = {};
    setSaveState("saving");
    try {
      const saved = await notesApi.update(note.id, changes);
      client.setQueryData(queryKeys.note(note.id), saved);
      client.invalidateQueries({ queryKey: queryKeys.allNotes });
      setMeta((current) => ({ ...current, updated_at: saved.updated_at }));
      setSaveState(Object.keys(pending.current).length ? "pending" : "saved");
    } catch (err) {
      pending.current = { ...changes, ...pending.current };
      setSaveState("error");
      toast(errorMessage(err, i18n), "error");
    }
  }, [client, i18n, note.id, toast]);

  const schedule = useCallback(
    (changes: NoteChanges, delay = 700) => {
      pending.current = { ...pending.current, ...changes };
      setSaveState("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [flush],
  );

  // Save when the tab is hidden; warn before closing with unsaved changes.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) event.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flush]);

  // On leaving: save, or delete a new note that stayed empty. The work is deferred one
  // tick and skipped if the component mounted again (React StrictMode remounts in dev).
  const isNew = Boolean((location.state as { isNew?: boolean } | null)?.isNew);
  const leaveRef = useRef(() => {});
  leaveRef.current = () => {
    const { title: lastTitle, content, cover } = latest.current;
    if (isNew && !lastTitle.trim() && !content.trim() && !cover) {
      deleted.current = true;
      if (timer.current) clearTimeout(timer.current);
      void notesApi
        .remove(note.id)
        .then(() => client.invalidateQueries({ queryKey: queryKeys.allNotes }))
        .catch(() => undefined);
      return;
    }
    void flush();
  };
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current) leaveRef.current();
      }, 0);
    };
  }, []);

  useEffect(() => {
    const element = titleRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [title]);

  useEffect(() => {
    if (isNew) titleRef.current?.focus();
  }, [isNew]);

  const onEditorChange = useCallback(
    (body: JSONContent, content: string) => {
      latest.current.content = content;
      schedule({ body, content });
    },
    [schedule],
  );

  const onStats = useCallback((stats: { words: number }) => setWords(stats.words), []);
  const onReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
    setEditorInstance(editor);
  }, []);

  function changeSettings(next: NoteSettings) {
    setSettings(next);
    schedule({ settings: next }, 0);
  }

  async function moveToTrash() {
    try {
      await flush();
      deleted.current = true;
      await notesExtraApi.moveToTrash(note.id);
      client.invalidateQueries({ queryKey: queryKeys.allNotes });
      client.invalidateQueries({ queryKey: queryKeys.categories });
      toast(t("trash.moved"), "info", {
        label: t("common.undo"),
        run: () => {
          void notesExtraApi.restore(note.id).then(() => {
            client.invalidateQueries({ queryKey: queryKeys.allNotes });
            navigate(`/notes/${note.id}`);
          });
        },
      });
      navigate("/notes");
    } catch (err) {
      deleted.current = false;
      toast(errorMessage(err, i18n), "error");
    }
  }

  async function moveToWorkspace(workspaceId: number) {
    try {
      await flush();
      await notesApi.update(note.id, { workspace_id: workspaceId });
      client.invalidateQueries({ queryKey: queryKeys.allNotes });
      toast(t("page.moved"), "success");
      navigate("/notes");
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  function exportAs(format: ExportFormat) {
    const editor = editorRef.current;
    const name = safeFilename(title, t("notes.untitled"));
    if (format === "markdown") {
      downloadText(`${name}.md`, docToMarkdown(editor?.getJSON() ?? initialContent, title), "text/markdown");
    } else if (format === "text") {
      download();
    } else {
      const html = standaloneHtml(title || t("notes.untitled"), editor?.getHTML() ?? "", dir);
      if (format === "html") downloadText(`${name}.html`, html, "text/html");
      else printHtml(html);
    }
  }

  async function importFile(file: File) {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const { content, title: importedTitle } = await readImport(file);
      editor.chain().focus("end").insertContent(content).run();
      if (!title.trim() && importedTitle) {
        setTitle(importedTitle);
        latest.current.title = importedTitle;
        schedule({ title: importedTitle });
      }
      toast(t("page.imported"), "success");
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  function changeMeta(changes: Pick<NoteChanges, "cover" | "category_id" | "is_favorite">) {
    setMeta((current) => ({ ...current, ...changes }));
    if ("cover" in changes) latest.current.cover = changes.cover ?? null;
    schedule(changes, 0);
  }

  async function remove() {
    const ok = await confirm({
      title: t("notes.deleteTitle"),
      message: t("notes.deleteMessage", { title: title || t("notes.untitled") }),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      deleted.current = true;
      await notesApi.remove(note.id);
      client.removeQueries({ queryKey: queryKeys.note(note.id) });
      client.invalidateQueries({ queryKey: queryKeys.allNotes });
      client.invalidateQueries({ queryKey: queryKeys.categories });
      toast(t("notes.deleted"));
      navigate("/notes");
    } catch (err) {
      deleted.current = false;
      toast(errorMessage(err, i18n), "error");
    }
  }

  async function duplicate() {
    await flush();
    try {
      const editor = editorRef.current;
      const copy = await notesApi.create({
        title: title.trim() ? plainText(t("notes.copyOf", { title: title.trim() })) : "",
        content: latest.current.content,
        body: editor?.getJSON() ?? initialContent,
        cover: meta.cover,
        category_id: meta.category_id,
      });
      client.invalidateQueries({ queryKey: queryKeys.allNotes });
      toast(t("notes.duplicated"), "success");
      navigate(`/notes/${copy.id}`);
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(`${title}\n\n${latest.current.content}`.trim());
      toast(t("common.copied"), "success");
    } catch {
      toast(t("errors.unknown"), "error");
    }
  }

  function download() {
    const blob = new Blob([`${title}\n\n${latest.current.content}`.trim()], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(title.trim() || t("notes.untitled")).replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80)}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function insertFromAi(markdown: string) {
    const editor = editorRef.current;
    if (!editor) return;
    editor
      .chain()
      .focus("end")
      .insertContent([{ type: "horizontalRule" }, ...markdownToContent(markdown)])
      .run();
  }

  const status: Record<SaveState, string> = {
    saved: t("notes.saved"),
    pending: t("notes.unsaved"),
    saving: t("notes.saving"),
    error: t("notes.saveFailed"),
  };

  const category = categories.find((item) => item.id === meta.category_id);

  return (
    <div className="note-page" data-ai-open={aiOpen}>
      <div className="note-main">
        <div className="note-toolbar">
          <div className="note-toolbar-start">
            <button
              type="button"
              className="icon-button"
              onClick={() => navigate(-1)}
              aria-label={t("common.back")}
              title={t("common.back")}
            >
              <BackIcon />
            </button>
            <nav className="note-breadcrumb hide-on-phone" aria-label={t("notes.location")}>
              <Link to="/notes">{t("nav.notes")}</Link>
              {category && (
                <>
                  <span aria-hidden="true">/</span>
                  <Link to={`/notes?category=${category.id}`} dir="auto">
                    {category.icon} {category.name}
                  </Link>
                </>
              )}
            </nav>
            <span className="save-state" data-state={saveState} role="status">
              <span className="save-dot" aria-hidden="true" />
              {status[saveState]}
            </span>
          </div>

          <div className="note-toolbar-end">
            <CategorySelect
              categories={categories}
              value={meta.category_id}
              onChange={(category_id) => changeMeta({ category_id })}
              canCreate={!viewer}
            />
            <span className="toolbar-divider" aria-hidden="true" />
            <div className="note-icon-actions">
              <button
                type="button"
                className={aiOpen ? "icon-button ai-icon active" : "icon-button ai-icon"}
                aria-pressed={aiOpen}
                aria-label={t("ai.title")}
                onClick={() => setAiOpen(!aiOpen)}
                title={t("ai.title")}
              >
                <SparkleIcon />
              </button>
              {!viewer && (
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setDialog("share")}
                  aria-label={t("page.share")}
                  title={t("page.share")}
                >
                  <ShareIcon />
                </button>
              )}
              <FavoriteButton
                active={meta.is_favorite}
                onToggle={() => changeMeta({ is_favorite: !meta.is_favorite })}
              />
            </div>
            <PageMenu
              settings={settings}
              onSettings={viewer ? undefined : changeSettings}
              readOnly={viewer}
              onCopyLink={() => {
                void navigator.clipboard
                  .writeText(window.location.href)
                  .then(() => toast(t("common.copied"), "success"));
              }}
              onCopyContents={() => void copyText()}
              onDuplicate={() => void duplicate()}
              onHistory={() => setDialog("history")}
              onShare={viewer ? undefined : () => setDialog("share")}
              onAi={() => setAiOpen(true)}
              onExport={exportAs}
              onImport={(file) => void importFile(file)}
              onTrash={() => void moveToTrash()}
              onDelete={() => void remove()}
              moveMenu={(close) => (
                <>
                  <p className="menu-heading">{t("common.category")}</p>
                  {[{ id: null, name: t("common.noCategory"), icon: "" }, ...categories].map((item) => (
                    <button
                      key={item.id ?? "none"}
                      type="button"
                      className="menu-item"
                      onClick={() => {
                        close();
                        changeMeta({ category_id: item.id });
                      }}
                    >
                      <span aria-hidden="true">{item.icon || "•"}</span>
                      <span className="menu-item-text" dir="auto">
                        {item.name}
                      </span>
                      {meta.category_id === item.id && <CheckIcon />}
                    </button>
                  ))}
                  {workspaces.filter((w) => w.id !== workspace?.id && w.role !== "viewer").length > 0 && (
                    <>
                      <div className="menu-separator" />
                      <p className="menu-heading">{t("page.otherWorkspace")}</p>
                      {workspaces
                        .filter((w) => w.id !== workspace?.id && w.role !== "viewer")
                        .map((w) => (
                          <button
                            key={w.id}
                            type="button"
                            className="menu-item"
                            onClick={() => {
                              close();
                              void moveToWorkspace(w.id);
                            }}
                          >
                            <span aria-hidden="true">{w.icon || "🗂️"}</span>
                            <span className="menu-item-text">{w.name}</span>
                          </button>
                        ))}
                    </>
                  )}
                </>
              )}
              lastEdited={{ name: note.updated_by_name, at: meta.updated_at }}
              words={words}
            />
          </div>
        </div>

        {meta.cover && (
          <div className="note-cover-banner" style={coverStyle(meta.cover)}>
            <div className="cover-actions" hidden={readOnly}>
              <CoverPicker
                cover={meta.cover}
                onChange={(cover) => changeMeta({ cover })}
                triggerLabel={t("notes.changeCover")}
                triggerClassName="small cover-button"
              />
            </div>
          </div>
        )}

        {readOnly && (
          <div className="readonly-banner" role="status">
            {viewer ? <EyeIcon /> : <LockIcon />}
            <span>{viewer ? t("page.viewOnly") : t("page.lockedHint")}</span>
            {!viewer && (
              <button
                type="button"
                className="ghost small"
                onClick={() => changeSettings({ ...settings, locked: false })}
              >
                {t("page.unlock")}
              </button>
            )}
          </div>
        )}
        <article
          className="note-doc"
          data-font={settings.font}
          data-small={settings.small_text}
          data-full={settings.full_width}
        >
          {!meta.cover && !readOnly && (
            <div className="note-doc-actions">
              <CoverPicker
                cover={meta.cover}
                onChange={(cover) => changeMeta({ cover })}
                triggerLabel={t("notes.addCover")}
                triggerClassName="ghost small doc-action"
                align="start"
              />
            </div>
          )}
          <textarea
            ref={titleRef}
            className="note-title-input"
            rows={1}
            placeholder={t("notes.untitled")}
            aria-label={t("notes.title")}
            maxLength={200}
            readOnly={readOnly}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              latest.current.title = event.target.value;
              schedule({ title: event.target.value });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                editorRef.current?.commands.focus("start");
              }
            }}
          />
          <p className="note-meta">
            {t("notes.updatedAt", { date: calendar.dateTime(meta.updated_at) })} ·{" "}
            {plural("notes.words", words)}
          </p>
          <NoteEditor
            initialContent={initialContent}
            onChange={onEditorChange}
            onStats={onStats}
            onReady={onReady}
            editable={!readOnly}
          />
        </article>
        {settings.toc && <Outline editor={editorInstance} className="note-outline" />}
      </div>

      {dialog === "share" && (
        <ShareDialog kind="note" itemId={note.id} title={title} onClose={() => setDialog(null)} />
      )}
      {dialog === "history" && (
        <RevisionDialog
          queryKey={["note-revisions", note.id]}
          load={() => notesExtraApi.revisions(note.id)}
          loadOne={(id) => notesExtraApi.revision(note.id, id)}
          restore={(id) => notesExtraApi.restoreRevision(note.id, id)}
          onClose={() => setDialog(null)}
          onRestored={() => {
            client.invalidateQueries({ queryKey: queryKeys.note(note.id) });
            window.location.reload();
          }}
        />
      )}
      {aiOpen && (
        <aside className="note-ai">
          <NoteAiPanel
            noteId={note.id}
            beforeRun={flush}
            onInsert={insertFromAi}
            onClose={() => setAiOpen(false)}
          />
        </aside>
      )}
    </div>
  );
}
