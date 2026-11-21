/**
 * A documentation space: page tree (nested, drag & drop, move/indent from a menu),
 * search, "Ask the docs" (AI with sources), and the page editor with an outline,
 * breadcrumbs, previous/next links, history, import/export and AI writing.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Editor, JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { useCategories } from "../../api/queries";
import { aiToolsApi, docsApi } from "../../api/v4";
import { CategorySelect } from "../../components/CategoryBits";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BackIcon,
  BookIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  IndentIcon,
  InboxIcon,
  MoreIcon,
  OutdentIcon,
  PlusIcon,
  SettingsIcon,
  ShareIcon,
  SparkleIcon,
  StarIcon,
  TrashIcon,
  WandIcon,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { Outline } from "../../components/Outline";
import { PageMenu, type ExportFormat } from "../../components/PageMenu";
import { ColorPicker, EmptyState, Popover, Skeleton } from "../../components/ui";
import { useAutosave } from "../../hooks/useAutosave";
import { usePageQuery } from "../../hooks/usePageQuery";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import {
  docToMarkdown,
  downloadText,
  printHtml,
  readImport,
  safeFilename,
  standaloneHtml,
} from "../../lib/exporters";
import { markdownToContent, plainTextToDoc } from "../../lib/markdown";
import { categoryStyle } from "../../lib/palette";
import type { ColorName } from "../../types";
import type { AskAnswer, DocPage, DocPageNode, DocSpace } from "../../types4";
import { AiSuggestDialog } from "../ai/AiSuggestDialog";
import { NoteEditor } from "../editor/NoteEditor";
import { RevisionDialog } from "../sharing/RevisionDialog";
import { ShareDialog } from "../sharing/ShareDialog";
import { docsKey } from "./DocsPage";

const spaceKey = (id: number) => ["doc", id] as const;
const pageKey = (spaceId: number, pageId: number) => ["doc-page", spaceId, pageId] as const;

interface TreeNode extends DocPageNode {
  children: TreeNode[];
  depth: number;
}

function buildTree(pages: DocPageNode[]): TreeNode[] {
  const byParent = new Map<number | null, DocPageNode[]>();
  for (const page of pages) {
    const list = byParent.get(page.parent_id) ?? [];
    list.push(page);
    byParent.set(page.parent_id, list);
  }
  const build = (parent: number | null, depth: number): TreeNode[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((page) => ({ ...page, depth, children: build(page.id, depth + 1) }));
  return build(null, 0);
}

/** Pages in reading order (depth-first), for previous / next. */
function flatten(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

export function DocSpacePage() {
  const params = useParams();
  const spaceId = Number(params.spaceId);
  const { t } = useI18n();
  const {
    data: space,
    isLoading,
    error,
  } = useQuery({
    queryKey: spaceKey(spaceId),
    queryFn: () => docsApi.get(spaceId),
  });
  if (isLoading) return <Skeleton rows={6} />;
  if (error || !space) {
    return (
      <EmptyState
        icon={InboxIcon}
        title={t("errors.doc_not_found")}
        action={
          <Link to="/docs" className="button">
            {t("common.back")}
          </Link>
        }
      />
    );
  }
  return <SpaceView space={space} />;
}

function SpaceView({ space }: { space: DocSpace }) {
  const i18n = useI18n();
  const { t } = i18n;
  const params = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const canEdit = space.role !== "viewer";
  const tree = useMemo(() => buildTree(space.pages), [space.pages]);
  const order = useMemo(() => flatten(tree), [tree]);
  const pageId = params.pageId ? Number(params.pageId) : (order[0]?.id ?? null);
  const [dialog, setDialog] = useState<"settings" | "share" | "ask" | "ai-pages" | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);

  const refresh = useCallback(
    () => client.invalidateQueries({ queryKey: spaceKey(space.id) }),
    [client, space.id],
  );

  async function addPage(parentId: number | null) {
    try {
      const page = await docsApi.createPage(space.id, { title: "", parent_id: parentId });
      await refresh();
      navigate(`/docs/${space.id}/${page.id}`, { state: { isNew: true } });
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  return (
    <div className="docs-layout" style={categoryStyle(space.color)} data-tree-open={treeOpen}>
      <aside className="docs-sidebar" aria-label={t("docs.pagesTree")}>
        <div className="docs-sidebar-head">
          <Link to="/docs" className="icon-button" title={t("nav.docs")} aria-label={t("nav.docs")}>
            <BackIcon />
          </Link>
          <span className="docs-space-icon" aria-hidden="true">
            {space.icon || "📘"}
          </span>
          <span className="docs-space-title" dir="auto">
            <strong>{space.title}</strong>
            {space.version && <span className="chip small">v{space.version}</span>}
          </span>
          <button
            type="button"
            className="icon-button small"
            onClick={() => setDialog("settings")}
            title={t("docs.settings")}
            aria-label={t("docs.settings")}
          >
            <SettingsIcon />
          </button>
        </div>
        <DocSearch space={space} onOpen={(id) => navigate(`/docs/${space.id}/${id}`)} />
        <div className="docs-sidebar-actions">
          <button type="button" className="ghost small" onClick={() => setDialog("ask")}>
            <SparkleIcon /> {t("docs.ask")}
          </button>
          {!space.shared && canEdit && (
            <button type="button" className="ghost small" onClick={() => setDialog("share")}>
              <ShareIcon /> {t("page.share")}
            </button>
          )}
        </div>
        <DocTree
          space={space}
          tree={tree}
          activeId={pageId}
          canEdit={canEdit}
          onAdd={(parentId) => void addPage(parentId)}
          onChanged={refresh}
          onOpen={() => setTreeOpen(false)}
        />
        {canEdit && (
          <div className="docs-sidebar-foot">
            <button type="button" className="ghost small block" onClick={() => void addPage(null)}>
              <PlusIcon /> {t("docs.newPage")}
            </button>
            <button type="button" className="ghost small block" onClick={() => setDialog("ai-pages")}>
              <WandIcon /> {t("docs.aiPages")}
            </button>
          </div>
        )}
      </aside>

      <main className="docs-main">
        <button type="button" className="ghost small docs-tree-toggle" onClick={() => setTreeOpen(!treeOpen)}>
          <BookIcon /> {t("docs.pagesTree")}
        </button>
        {pageId ? (
          <DocPageView
            key={pageId}
            space={space}
            pageId={pageId}
            order={order}
            canEdit={canEdit}
            onChanged={refresh}
          />
        ) : (
          <EmptyState
            icon={BookIcon}
            title={t("docs.noPages")}
            action={
              canEdit && (
                <button type="button" className="primary" onClick={() => void addPage(null)}>
                  <PlusIcon /> {t("docs.newPage")}
                </button>
              )
            }
          />
        )}
      </main>

      {dialog === "settings" && <SpaceSettings space={space} onClose={() => setDialog(null)} />}
      {dialog === "share" && (
        <ShareDialog kind="doc" itemId={space.id} title={space.title} onClose={() => setDialog(null)} />
      )}
      {dialog === "ask" && <AskDocs space={space} onClose={() => setDialog(null)} />}
      {dialog === "ai-pages" && (
        <AiSuggestDialog
          kind="doc_pages"
          title={t("docs.aiPages")}
          hint={t("docs.aiPagesHint")}
          initialText={`${space.title}\n${space.description}`.trim()}
          count={8}
          onClose={() => setDialog(null)}
          onAccept={async (items) => {
            await docsApi.createPages(
              space.id,
              null,
              items.map((item) => ({
                title: item.title,
                content: item.detail,
                body: plainTextToDoc(item.detail),
              })),
            );
            await refresh();
            toast(t("docs.pagesAdded", { count: items.length }), "success");
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- tree

type DropZone = "before" | "inside" | "after";

function DocTree({
  space,
  tree,
  activeId,
  canEdit,
  onAdd,
  onChanged,
  onOpen,
}: {
  space: DocSpace;
  tree: TreeNode[];
  activeId: number | null;
  canEdit: boolean;
  onAdd: (parentId: number | null) => void;
  onChanged: () => Promise<unknown>;
  onOpen: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const storageKey = `notes.docTree.${space.id}`;
  const [collapsed, setCollapsed] = useState<Set<number>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(storageKey) ?? "[]") as number[]);
    } catch {
      return new Set();
    }
  });
  const [dragId, setDragId] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ id: number; zone: DropZone } | null>(null);
  const byId = useMemo(() => new Map(flatten(tree).map((node) => [node.id, node])), [tree]);

  const toggle = (id: number) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // not important
    }
  };

  const siblings = (node: TreeNode) =>
    node.parent_id == null ? tree : (byId.get(node.parent_id)?.children ?? []);

  async function move(id: number, parentId: number | null, index: number) {
    try {
      await docsApi.movePage(space.id, id, parentId, Math.max(0, index));
      await onChanged();
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  async function remove(node: TreeNode) {
    const ok = await confirm({
      title: t("docs.deletePage"),
      message: t("docs.deletePageMessage", { title: node.title || t("notes.untitled") }),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await docsApi.removePage(space.id, node.id);
      await onChanged();
      if (activeId === node.id) navigate(`/docs/${space.id}`);
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  function onDragOver(event: DragEvent, node: TreeNode) {
    if (dragId == null || dragId === node.id) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - box.top;
    const zone: DropZone = y < box.height * 0.28 ? "before" : y > box.height * 0.72 ? "after" : "inside";
    setDrop({ id: node.id, zone });
  }

  async function onDrop(node: TreeNode) {
    const target = drop;
    const moving = dragId;
    setDrop(null);
    setDragId(null);
    if (!target || moving == null || moving === node.id) return;
    // Do not drop a page inside its own sub-tree.
    for (let p: TreeNode | undefined = node; p; p = p.parent_id != null ? byId.get(p.parent_id) : undefined) {
      if (p.id === moving) return;
    }
    if (target.zone === "inside") {
      await move(moving, node.id, node.children.length);
      if (collapsed.has(node.id)) toggle(node.id);
      return;
    }
    const list = siblings(node).filter((item) => item.id !== moving);
    const index = list.findIndex((item) => item.id === node.id) + (target.zone === "after" ? 1 : 0);
    await move(moving, node.parent_id, index);
  }

  const render = (nodes: TreeNode[]) =>
    nodes.map((node) => {
      const list = siblings(node);
      const index = list.findIndex((item) => item.id === node.id);
      const previous = index > 0 ? list[index - 1] : null;
      const open = !collapsed.has(node.id);
      return (
        <li key={node.id}>
          <div
            className="tree-row"
            data-active={node.id === activeId}
            data-drop={drop?.id === node.id ? drop.zone : undefined}
            style={{ paddingInlineStart: `${0.35 + node.depth * 0.9}rem` }}
            draggable={canEdit}
            onDragStart={(event) => {
              setDragId(node.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => {
              setDragId(null);
              setDrop(null);
            }}
            onDragOver={(event) => onDragOver(event, node)}
            onDragLeave={() => setDrop((current) => (current?.id === node.id ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              void onDrop(node);
            }}
          >
            <button
              type="button"
              className="tree-chevron"
              aria-label={open ? t("editor.collapse") : t("editor.expand")}
              aria-expanded={open}
              style={{ visibility: node.children.length ? "visible" : "hidden" }}
              onClick={() => toggle(node.id)}
            >
              <ChevronRightIcon />
            </button>
            <Link to={`/docs/${space.id}/${node.id}`} className="tree-link" onClick={onOpen}>
              <span aria-hidden="true">{node.icon || "📄"}</span>
              <span className="tree-title" dir="auto">
                {node.title || t("notes.untitled")}
              </span>
            </Link>
            {canEdit && (
              <span className="tree-actions">
                <button
                  type="button"
                  className="icon-button small"
                  title={t("docs.addSubpage")}
                  aria-label={t("docs.addSubpage")}
                  onClick={() => onAdd(node.id)}
                >
                  <PlusIcon />
                </button>
                <Popover
                  label={t("common.more")}
                  align="end"
                  trigger={({ toggle: open2 }) => (
                    <button
                      type="button"
                      className="icon-button small"
                      aria-label={t("common.more")}
                      onClick={open2}
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
                        disabled={index <= 0}
                        onClick={() => {
                          close();
                          void move(node.id, node.parent_id, index - 1);
                        }}
                      >
                        <ArrowUpIcon /> {t("docs.moveUp")}
                      </button>
                      <button
                        type="button"
                        className="menu-item"
                        disabled={index >= list.length - 1}
                        onClick={() => {
                          close();
                          void move(node.id, node.parent_id, index + 1);
                        }}
                      >
                        <ArrowDownIcon /> {t("docs.moveDown")}
                      </button>
                      <button
                        type="button"
                        className="menu-item"
                        disabled={!previous}
                        onClick={() => {
                          close();
                          if (previous) void move(node.id, previous.id, previous.children.length);
                        }}
                      >
                        <IndentIcon /> {t("docs.indent")}
                      </button>
                      <button
                        type="button"
                        className="menu-item"
                        disabled={node.parent_id == null}
                        onClick={() => {
                          close();
                          const parent = node.parent_id != null ? byId.get(node.parent_id) : undefined;
                          if (!parent) return;
                          const parentIndex = siblings(parent).findIndex((item) => item.id === parent.id);
                          void move(node.id, parent.parent_id, parentIndex + 1);
                        }}
                      >
                        <OutdentIcon /> {t("docs.outdent")}
                      </button>
                      <button
                        type="button"
                        className="menu-item"
                        onClick={async () => {
                          close();
                          try {
                            const copy = await docsApi.duplicatePage(space.id, node.id);
                            await onChanged();
                            navigate(`/docs/${space.id}/${copy.id}`);
                          } catch (err) {
                            toast(errorMessage(err, i18n), "error");
                          }
                        }}
                      >
                        <CopyIcon /> {t("page.duplicate")}
                      </button>
                      <div className="menu-separator" />
                      <button
                        type="button"
                        className="menu-item danger"
                        onClick={() => {
                          close();
                          void remove(node);
                        }}
                      >
                        <TrashIcon /> {t("common.delete")}
                      </button>
                    </div>
                  )}
                </Popover>
              </span>
            )}
          </div>
          {open && node.children.length > 0 && <ul className="tree">{render(node.children)}</ul>}
        </li>
      );
    });

  return (
    <nav className="docs-tree" aria-label={t("docs.pagesTree")}>
      <ul className="tree">{render(tree)}</ul>
    </nav>
  );
}

function DocSearch({ space, onOpen }: { space: DocSpace; onOpen: (id: number) => void }) {
  const { t } = useI18n();
  const query = usePageQuery();
  const [params, setParams] = useSearchParams();
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);
  const { data: hits = [] } = useQuery({
    queryKey: ["doc-search", space.id, debounced],
    queryFn: () => docsApi.search(space.id, debounced),
    enabled: debounced.length > 1,
  });
  const setQuery = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("q", value);
    else next.delete("q");
    setParams(next, { replace: true });
  };
  return (
    <div className="docs-search">
      {debounced.length > 1 && (
        <ul className="docs-search-results">
          {hits.length ? (
            hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    onOpen(hit.id);
                  }}
                >
                  <strong dir="auto">{hit.title || t("notes.untitled")}</strong>
                  <span className="muted small" dir="auto">
                    {hit.snippet}
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="muted small">{t("common.noResults")}</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- page

const PAGE_ICONS = ["📄", "📘", "🚀", "⚙️", "🧩", "💡", "📌", "🔐", "🧪", "📦", "🎯", "❓"];

function DocPageView({
  space,
  pageId,
  order,
  canEdit,
  onChanged,
}: {
  space: DocSpace;
  pageId: number;
  order: TreeNode[];
  canEdit: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const i18n = useI18n();
  const { t, calendar, dir } = i18n;
  const client = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { data: page, isLoading } = useQuery({
    queryKey: pageKey(space.id, pageId),
    queryFn: () => docsApi.page(space.id, pageId),
  });
  const [title, setTitle] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [words, setWords] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [history, setHistory] = useState(false);
  const [writing, setWriting] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const { state, schedule } = useAutosave<Pick<DocPage, "title" | "icon" | "body" | "content">>(
    async (changes) => {
      const saved = await docsApi.updatePage(space.id, pageId, changes);
      client.setQueryData(pageKey(space.id, pageId), saved);
      if ("title" in changes || "icon" in changes) await onChanged();
    },
  );

  useEffect(() => {
    const element = titleRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [title, page]);

  const initial = useMemo<JSONContent | null>(
    () => (page ? ((page.body as JSONContent | null) ?? plainTextToDoc(page.content)) : null),
    // Only the first load; later saves must not reset the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page?.id],
  );

  if (isLoading || !page || !initial) return <Skeleton rows={6} />;
  const shownTitle = title ?? page.title;
  const shownIcon = icon ?? page.icon;
  const index = order.findIndex((node) => node.id === page.id);
  const previous = index > 0 ? order[index - 1] : null;
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : null;
  const crumbs: DocPageNode[] = [];
  for (
    let p = space.pages.find((x) => x.id === page.parent_id);
    p;
    p = space.pages.find((x) => x.id === p?.parent_id)
  ) {
    crumbs.unshift(p);
  }

  function exportAs(format: ExportFormat) {
    const name = safeFilename(shownTitle, t("notes.untitled"));
    if (format === "markdown")
      downloadText(`${name}.md`, docToMarkdown(editor?.getJSON() ?? initial, shownTitle), "text/markdown");
    else if (format === "text")
      downloadText(
        `${name}.txt`,
        `${shownTitle}\n\n${editor?.getText() ?? page?.content ?? ""}`,
        "text/plain",
      );
    else {
      const html = standaloneHtml(shownTitle, editor?.getHTML() ?? "", dir);
      if (format === "html") downloadText(`${name}.html`, html, "text/html");
      else printHtml(html);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: t("docs.deletePage"),
      message: t("docs.deletePageMessage", { title: shownTitle || t("notes.untitled") }),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    await docsApi.removePage(space.id, pageId);
    await onChanged();
    navigate(`/docs/${space.id}`);
  }

  return (
    <div className="doc-page-layout">
      <article className="doc-article">
        <div className="doc-toolbar">
          <nav className="note-breadcrumb" aria-label={t("notes.location")}>
            <Link to={`/docs/${space.id}`}>
              {space.icon} {space.title}
            </Link>
            {crumbs.map((crumb) => (
              <span key={crumb.id}>
                <span aria-hidden="true"> / </span>
                <Link to={`/docs/${space.id}/${crumb.id}`} dir="auto">
                  {crumb.title || t("notes.untitled")}
                </Link>
              </span>
            ))}
          </nav>
          <span className="save-state" data-state={state}>
            <span className="save-dot" aria-hidden="true" />
            {t(`notes.state.${state}`)}
          </span>
          {canEdit && (
            <button type="button" className="ghost small" onClick={() => setWriting(true)}>
              <SparkleIcon /> <span className="hide-on-phone">{t("docs.aiWrite")}</span>
            </button>
          )}
          <PageMenu
            readOnly={!canEdit}
            onCopyLink={() =>
              void navigator.clipboard
                .writeText(window.location.href)
                .then(() => toast(t("common.copied"), "success"))
            }
            onCopyContents={() =>
              void navigator.clipboard
                .writeText(`${shownTitle}\n\n${editor?.getText() ?? ""}`)
                .then(() => toast(t("common.copied"), "success"))
            }
            onDuplicate={async () => {
              const copy = await docsApi.duplicatePage(space.id, pageId);
              await onChanged();
              navigate(`/docs/${space.id}/${copy.id}`);
            }}
            onHistory={() => setHistory(true)}
            onExport={exportAs}
            onImport={async (file) => {
              const { content, title: imported } = await readImport(file);
              editor?.chain().focus("end").insertContent(content).run();
              if (!shownTitle.trim() && imported) {
                setTitle(imported);
                schedule({ title: imported });
              }
            }}
            onDelete={() => void remove()}
            lastEdited={{ name: page.updated_by_name, at: page.updated_at }}
            words={words}
          />
        </div>

        <div className="doc-heading">
          {canEdit ? (
            <Popover
              label={t("categories.emoji")}
              trigger={({ toggle }) => (
                <button
                  type="button"
                  className="doc-icon-button"
                  onClick={toggle}
                  title={t("categories.emoji")}
                >
                  {shownIcon || "📄"}
                </button>
              )}
            >
              {(close) => (
                <div className="emoji-grid compact">
                  {PAGE_ICONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="emoji-option"
                      onClick={() => {
                        close();
                        setIcon(emoji);
                        schedule({ icon: emoji }, 0);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </Popover>
          ) : (
            <span className="doc-icon-button">{shownIcon || "📄"}</span>
          )}
          <textarea
            ref={titleRef}
            className="note-title-input"
            rows={1}
            maxLength={200}
            readOnly={!canEdit}
            autoFocus={!page.title}
            placeholder={t("notes.untitled")}
            value={shownTitle}
            onChange={(event) => {
              setTitle(event.target.value);
              schedule({ title: event.target.value });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                editor?.commands.focus("start");
              }
            }}
          />
          <p className="note-meta">
            {t("notes.updatedAt", { date: calendar.dateTime(page.updated_at) })}
            {page.updated_by_name && ` · ${page.updated_by_name}`}
          </p>
        </div>

        <NoteEditor
          initialContent={initial}
          editable={canEdit}
          onChange={(body, content) => schedule({ body, content })}
          onStats={(stats) => setWords(stats.words)}
          onReady={setEditor}
        />

        <nav className="doc-pager" aria-label={t("docs.pager")}>
          {previous ? (
            <Link to={`/docs/${space.id}/${previous.id}`} className="pager-link prev">
              <span className="muted small">
                <ChevronLeftIcon /> {t("docs.previous")}
              </span>
              <strong dir="auto">{previous.title || t("notes.untitled")}</strong>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link to={`/docs/${space.id}/${next.id}`} className="pager-link next">
              <span className="muted small">
                {t("docs.next")} <ChevronRightIcon />
              </span>
              <strong dir="auto">{next.title || t("notes.untitled")}</strong>
            </Link>
          )}
        </nav>
      </article>

      <aside className="doc-outline-wrap">
        <Outline editor={editor} className="doc-outline" />
      </aside>

      {history && (
        <RevisionDialog
          queryKey={["doc-revisions", space.id, pageId]}
          load={() => docsApi.revisions(space.id, pageId)}
          loadOne={(id) => docsApi.revision(space.id, pageId, id)}
          restore={(id) => docsApi.restoreRevision(space.id, pageId, id)}
          onClose={() => setHistory(false)}
          onRestored={() => window.location.reload()}
        />
      )}
      {writing && (
        <WriteWithAi
          title={shownTitle}
          context={`${space.title}: ${space.description}`}
          onClose={() => setWriting(false)}
          onInsert={(markdown) =>
            editor?.chain().focus("end").insertContent(markdownToContent(markdown)).run()
          }
        />
      )}
    </div>
  );
}

function WriteWithAi({
  title,
  context,
  onClose,
  onInsert,
}: {
  title: string;
  context: string;
  onClose: () => void;
  onInsert: (markdown: string) => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const [topic, setTopic] = useState(title);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await aiToolsApi.generate({ kind: "write", title: topic, text: context });
      setResult(response.text);
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("docs.aiWrite")}
      icon={WandIcon}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!result}
            onClick={() => {
              onInsert(result);
              onClose();
            }}
          >
            {t("ai.insert")}
          </button>
        </>
      }
    >
      <form className="stack" onSubmit={run}>
        <label className="field">
          <span className="field-label">{t("docs.aiTopic")}</span>
          <input data-autofocus value={topic} onChange={(event) => setTopic(event.target.value)} />
        </label>
        <button type="submit" className="button" disabled={busy || !topic.trim()}>
          <SparkleIcon /> {busy ? t("ai.thinking") : result ? t("ai.again") : t("ai.generate")}
        </button>
        {error && <p className="error-text">{error}</p>}
        {result && (
          <pre className="ai-result" dir="auto">
            {result}
          </pre>
        )}
      </form>
    </Modal>
  );
}

function AskDocs({ space, onClose }: { space: DocSpace; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setAnswer(await docsApi.ask(space.id, question.trim()));
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("docs.askTitle", { title: space.title })} icon={SparkleIcon} onClose={onClose} size="lg">
      <form className="ask-form" onSubmit={ask}>
        <input
          data-autofocus
          value={question}
          maxLength={2000}
          placeholder={t("docs.askPlaceholder")}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button type="submit" className="primary" disabled={busy || !question.trim()}>
          {busy ? t("ai.thinking") : t("ai.ask")}
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
      {answer && (
        <div className="ask-answer">
          <p dir="auto" className="ask-text">
            {answer.answer.replace(/\[note:\d+\]/g, "")}
          </p>
          {answer.partial && <p className="hint">{t("chat.partial")}</p>}
          <p className="field-label">{t("docs.sources")}</p>
          <div className="source-chips">
            {answer.sources.map((source) => (
              <Link
                key={source.id}
                to={source.url}
                className={answer.cited_ids.includes(source.id) ? "chip cited" : "chip"}
                onClick={onClose}
              >
                {source.title}
              </Link>
            ))}
          </div>
        </div>
      )}
      <p className="hint">{t("docs.askHint")}</p>
    </Modal>
  );
}

function SpaceSettings({ space, onClose }: { space: DocSpace; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const confirm = useConfirm();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { data: categories = [] } = useCategories();
  const canEdit = space.role !== "viewer";
  const [draft, setDraft] = useState({
    title: space.title,
    description: space.description,
    icon: space.icon,
    color: space.color as ColorName,
    version: space.version,
    tags: space.tags.join(", "),
    category_id: space.category_id,
    starred: space.starred,
  });
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await docsApi.update(space.id, {
        ...draft,
        tags: draft.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      await client.invalidateQueries({ queryKey: spaceKey(space.id) });
      await client.invalidateQueries({ queryKey: docsKey });
      toast(t("settings.saved"), "success");
      onClose();
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
      setBusy(false);
    }
  }

  async function exportAll() {
    const parts: string[] = [`# ${space.title}`, space.description];
    for (const node of flatten(buildTree(space.pages))) {
      const page = await docsApi.page(space.id, node.id);
      const body = docToMarkdown((page.body as JSONContent | null) ?? plainTextToDoc(page.content));
      parts.push(`${"#".repeat(Math.min(node.depth + 2, 6))} ${page.title}\n\n${body}`);
    }
    downloadText(
      `${safeFilename(space.title, "docs")}.md`,
      parts.filter(Boolean).join("\n\n"),
      "text/markdown",
    );
  }

  async function remove() {
    const ok = await confirm({
      title: t("docs.delete"),
      message: t("docs.deleteMessage", { title: space.title }),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    await docsApi.remove(space.id);
    await client.invalidateQueries({ queryKey: docsKey });
    navigate("/docs");
  }

  return (
    <Modal
      title={t("docs.settings")}
      icon={SettingsIcon}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {canEdit && (
            <button type="button" className="danger-outline" onClick={() => void remove()}>
              <TrashIcon /> {t("docs.delete")}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="ghost" onClick={() => void exportAll()}>
            <DownloadIcon /> {t("docs.exportAll")}
          </button>
          {canEdit && (
            <button type="submit" form="space-form" className="primary" disabled={busy}>
              {t("common.save")}
            </button>
          )}
        </>
      }
    >
      <form id="space-form" className="modal-split" onSubmit={save}>
        <aside className="modal-split-aside">
          <div className="field">
            <span className="field-label">{t("categories.emoji")}</span>
            <input
              className="emoji-input big"
              maxLength={8}
              value={draft.icon}
              onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
            />
          </div>
          <div className="field">
            <span className="field-label">{t("categories.color")}</span>
            <ColorPicker
              label={t("categories.color")}
              size="sm"
              value={draft.color}
              onChange={(color) => setDraft({ ...draft, color })}
            />
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={draft.starred}
              onChange={(event) => setDraft({ ...draft, starred: event.target.checked })}
            />
            <span>
              <StarIcon /> {t("docs.star")}
            </span>
          </label>
        </aside>
        <div className="stack">
          <label className="field">
            <span className="field-label">{t("docs.title")}</span>
            <input
              required
              maxLength={120}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">{t("docs.description")}</span>
            <textarea
              rows={3}
              maxLength={500}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">{t("docs.version")}</span>
              <input
                dir="ltr"
                maxLength={30}
                placeholder="1.0"
                value={draft.version}
                onChange={(event) => setDraft({ ...draft, version: event.target.value })}
              />
            </label>
            <div className="field">
              <span className="field-label">{t("common.category")}</span>
              <CategorySelect
                categories={categories}
                value={draft.category_id}
                onChange={(category_id) => setDraft({ ...draft, category_id })}
              />
            </div>
          </div>
          <label className="field">
            <span className="field-label">{t("docs.tags")}</span>
            <input
              value={draft.tags}
              placeholder={t("docs.tagsPlaceholder")}
              onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
            />
          </label>
        </div>
      </form>
    </Modal>
  );
}
