/**
 * Drive (like Google Drive): My Drive, Shared with me, Recent, Starred and Trash; folders
 * and files in a grid or a list; drag files (or whole folders) in to upload; drag items
 * onto a folder to move them; right-click for actions; previews; sharing with people and
 * public links. The top bar search searches the drive while this page is open.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { driveApi } from "../../api/v5";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockRecentIcon,
  CloseIcon,
  DownloadIcon,
  DriveIcon,
  EditIcon,
  FolderPlusIcon,
  GridIcon,
  InfoIcon,
  ListIcon,
  MoreIcon,
  MoveIcon,
  PlusIcon,
  RestoreIcon,
  SearchIcon,
  ShareIcon,
  StarIcon,
  TrashIcon,
  UploadIcon,
  UsersIcon,
} from "../../components/Icons";
import { EmptyState, Skeleton } from "../../components/ui";
import { useDismiss } from "../../hooks/useDismiss";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { usePageQuery } from "../../hooks/usePageQuery";
import { useI18n, type TranslationKey } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { formatBytes } from "../../lib/embeds";
import type { DriveItem, DriveSection, DriveView } from "../../types5";
import { ShareDialog } from "../sharing/ShareDialog";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { DetailsPanel, MoveDialog, NameDialog, PublicLinkSection } from "./DriveDialogs";
import { DrivePreview } from "./DrivePreview";
import { FileTypeIcon, typeStyle } from "./FileIcon";
import { fileType } from "./fileTypes";
import { folderUrl, rootUrl, SECTIONS, SectionView } from "./SectionViews";
import { filesFromDrop, useUploads } from "./useUploads";

const ITEM_MIME = "application/x-drive-items";
type SortKey = "name" | "updated" | "size";

const VIEWS: { id: DriveView; to: string; label: TranslationKey; icon: () => React.JSX.Element }[] = [
  { id: "folder", to: "/drive", label: "drive.myDrive", icon: DriveIcon },
  { id: "shared", to: "/drive/shared", label: "drive.sharedWithMe", icon: UsersIcon },
  { id: "recent", to: "/drive/recent", label: "drive.recent", icon: ClockRecentIcon },
  { id: "starred", to: "/drive/starred", label: "drive.starred", icon: () => <StarIcon /> },
  { id: "trash", to: "/drive/trash", label: "drive.trash", icon: TrashIcon },
];

type Dialog =
  | { kind: "folder" }
  | { kind: "rename"; item: DriveItem }
  | { kind: "move"; items: DriveItem[] }
  | { kind: "share"; item: DriveItem }
  | null;

export function DrivePage() {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const client = useQueryClient();
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const query = usePageQuery();
  const { canEdit: workspaceCanEdit } = useWorkspace();

  // Old links /drive/item/:id lead to the item's folder (and open a file's preview).
  useEffect(() => {
    if (!params.itemId) return;
    driveApi
      .item(Number(params.itemId))
      .then((item) =>
        navigate(
          item.is_folder
            ? folderUrl(item.section, item.id)
            : `${item.parent_id ? folderUrl(item.section, item.parent_id) : rootUrl(item.section)}?file=${item.id}`,
          { replace: true },
        ),
      )
      .catch(() => navigate("/drive", { replace: true }));
  }, [params.itemId, navigate]);

  // /drive/music, /drive/videos... are libraries of one kind of file, each with folders.
  const sectionParam = SECTIONS.find((s) => s.id === params.view)?.id;
  const section: DriveSection = sectionParam ?? "files";
  const routeView = sectionParam ? "folder" : ((params.view as DriveView | undefined) ?? "folder");
  const view: DriveView = query ? "search" : VIEWS.some((v) => v.id === routeView) ? routeView : "folder";
  const folderId = params.folderId && params.folderId !== "root" ? Number(params.folderId) : null;

  const listingKey = ["drive", view, folderId, query, section];
  const { data, isLoading, error } = useQuery({
    queryKey: listingKey,
    queryFn: () => driveApi.list(view, view === "folder" ? folderId : null, query, section),
    enabled: !params.itemId,
  });
  const { data: usage } = useQuery({ queryKey: ["drive-usage"], queryFn: driveApi.usage });
  const items = useMemo(() => data?.items ?? [], [data]);
  const role = data?.role ?? "viewer";
  // In this workspace the role is the member's role; in a folder shared with you, the share's role.
  const editable = role !== "viewer" && view !== "shared" && (workspaceCanEdit || role === "editor");

  const [layout, setLayout] = useLocalStorage<"grid" | "list">("drive.layout", "grid");
  const [sort, setSort] = useLocalStorage<{ key: SortKey; desc: boolean }>("drive.sort", {
    key: "name",
    desc: false,
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [details, setDetails] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; item: DriveItem } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<number | "root" | null>(null);
  const lastClicked = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => setSelected(new Set()), [view, folderId, query, section]);

  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: ["drive"] });
    void client.invalidateQueries({ queryKey: ["drive-usage"] });
    void client.invalidateQueries({ queryKey: ["drive-folders"] });
  }, [client]);

  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploads = useUploads(() => {
    // Refresh once a burst of uploads settles.
    if (uploadTimer.current) clearTimeout(uploadTimer.current);
    uploadTimer.current = setTimeout(refresh, 400);
  });

  const sorted = useMemo(() => {
    if (view === "recent" || view === "trash") return items;
    const list = [...items].sort((a, b) => {
      let diff = 0;
      if (sort.key === "name")
        diff = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      else if (sort.key === "updated") diff = Date.parse(a.updated_at) - Date.parse(b.updated_at);
      else diff = a.size - b.size;
      return sort.desc ? -diff : diff;
    });
    return [...list.filter((i) => i.is_folder), ...list.filter((i) => !i.is_folder)];
  }, [items, sort, view]);
  const folders = sorted.filter((i) => i.is_folder);
  const files = sorted.filter((i) => !i.is_folder);
  const selection = sorted.filter((i) => selected.has(i.id));
  const detailItem = selection.length === 1 ? selection[0] : (data?.folder ?? null);

  const previewId = Number(search.get("file")) || null;
  const [previewFallback, setPreviewFallback] = useState<DriveItem | null>(null);
  const previewItem = previewId ? (items.find((i) => i.id === previewId) ?? previewFallback) : null;
  useEffect(() => {
    if (!previewId || items.some((i) => i.id === previewId)) return;
    driveApi.item(previewId).then(setPreviewFallback, () => setPreviewFallback(null));
  }, [previewId, items]);

  function setPreview(item: DriveItem | null) {
    const next = new URLSearchParams(search);
    if (item) next.set("file", String(item.id));
    else {
      next.delete("file");
      next.delete("slideshow");
    }
    setSearch(next, { replace: !!item && !!previewId });
  }

  function open(item: DriveItem) {
    if (view === "trash") return;
    if (item.is_folder) navigate(folderUrl(item.section, item.id));
    else setPreview(item);
  }

  async function run(action: () => Promise<unknown>, done?: string) {
    try {
      await action();
      if (done) toast(done, "success");
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    } finally {
      refresh();
    }
  }

  const trash = (list: DriveItem[]) =>
    run(async () => {
      for (const item of list) await driveApi.trash(item.id);
      setSelected(new Set());
      toast(t("drive.movedToTrash", { count: list.length }), "success", {
        label: t("common.undo"),
        run: () =>
          void run(async () => {
            for (const item of list) await driveApi.restore(item.id);
          }),
      });
    });

  async function deleteForever(list: DriveItem[]) {
    const ok = await confirm({
      title: t("drive.deleteForeverTitle", { count: list.length }),
      message: t("drive.deleteForeverHint"),
      confirmLabel: t("drive.deleteForever"),
      danger: true,
    });
    if (ok)
      await run(async () => {
        for (const item of list) await driveApi.remove(item.id);
        setSelected(new Set());
      });
  }

  async function emptyTrash() {
    const ok = await confirm({
      title: t("drive.emptyTrashTitle"),
      message: t("drive.deleteForeverHint"),
      confirmLabel: t("drive.emptyTrash"),
      danger: true,
    });
    if (ok) await run(() => driveApi.emptyTrash(), t("drive.trashEmptied"));
  }

  function download(item: DriveItem) {
    if (item.is_folder) {
      void run(() => driveApi.zip(item.id, item.name));
    } else if (item.url) {
      const link = document.createElement("a");
      link.href = item.url;
      link.download = item.name;
      document.body.append(link);
      link.click();
      link.remove();
    }
  }

  const moveTo = (list: DriveItem[], target: number | null) =>
    run(
      async () => {
        for (const item of list)
          if (item.id !== target) await driveApi.update(item.id, { parent_id: target });
        setSelected(new Set());
      },
      t("drive.moved", { count: list.length }),
    );

  // ------------------------------------------------------------ selection

  function select(item: DriveItem, event: MouseEvent) {
    if (event.shiftKey && lastClicked.current != null) {
      const ids = sorted.map((i) => i.id);
      const [a, b] = [ids.indexOf(lastClicked.current), ids.indexOf(item.id)].sort((x, y) => x - y);
      setSelected(new Set(ids.slice(a, b + 1)));
    } else if (event.ctrlKey || event.metaKey) {
      setSelected((set) => {
        const next = new Set(set);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
    } else {
      setSelected(new Set([item.id]));
    }
    lastClicked.current = item.id;
  }

  function toggle(item: DriveItem) {
    setSelected((set) => {
      const next = new Set(set);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    lastClicked.current = item.id;
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true]") || previewId || dialog) return;
      if (event.key === "Escape") setSelected(new Set());
      if ((event.key === "Delete" || event.key === "Backspace") && selection.length && editable) {
        event.preventDefault();
        if (view === "trash") void deleteForever(selection);
        else void trash(selection);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelected(new Set(sorted.map((i) => i.id)));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // ------------------------------------------------------------ drag and drop

  const uploadParent = view === "folder" ? folderId : null;

  function onDragOver(event: DragEvent) {
    if (!editable || view === "trash") return;
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      setDragging(true);
    }
  }

  async function onDrop(event: DragEvent, target: number | null = uploadParent) {
    setDragging(false);
    setDropTarget(null);
    if (!editable) return;
    const moved = event.dataTransfer.getData(ITEM_MIME);
    if (moved) {
      event.preventDefault();
      const ids: number[] = JSON.parse(moved);
      const list = items.filter((i) => ids.includes(i.id) && i.id !== target);
      if (list.length) await moveTo(list, target);
      return;
    }
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      const dropped = await filesFromDrop(event.dataTransfer);
      if (dropped.length) uploads.add(dropped, target, section);
    }
  }

  function dragStart(event: DragEvent, item: DriveItem) {
    if (!editable || view === "trash") return;
    const ids = selected.has(item.id) ? [...selected] : [item.id];
    if (!selected.has(item.id)) setSelected(new Set([item.id]));
    event.dataTransfer.setData(ITEM_MIME, JSON.stringify(ids));
    event.dataTransfer.effectAllowed = "move";
  }

  const folderDropProps = (target: number | null, key: number | "root") =>
    editable
      ? {
          onDragOver: (event: DragEvent) => {
            if (event.dataTransfer.types.includes(ITEM_MIME) || event.dataTransfer.types.includes("Files")) {
              event.preventDefault();
              event.stopPropagation();
              setDropTarget(key);
            }
          },
          onDragLeave: () => setDropTarget((current) => (current === key ? null : current)),
          onDrop: (event: DragEvent) => {
            event.stopPropagation();
            void onDrop(event, target);
          },
        }
      : {};

  // ------------------------------------------------------------ menus

  function actionsFor(list: DriveItem[]) {
    const one = list.length === 1 ? list[0] : null;
    if (view === "trash") {
      return [
        {
          label: t("drive.restore"),
          icon: RestoreIcon,
          run: () =>
            void run(async () => {
              for (const i of list) await driveApi.restore(i.id);
            }, t("drive.restored")),
        },
        {
          label: t("drive.deleteForever"),
          icon: TrashIcon,
          danger: true,
          run: () => void deleteForever(list),
        },
      ];
    }
    const actions: {
      label: string;
      icon: () => React.JSX.Element;
      run: () => void;
      danger?: boolean;
      divider?: boolean;
    }[] = [];
    if (one && !one.is_folder)
      actions.push({ label: t("drive.preview"), icon: SearchIcon, run: () => open(one) });
    if (one?.is_folder)
      actions.push({ label: t("drive.open"), icon: ChevronRightIcon, run: () => open(one) });
    if (one)
      actions.push({
        label: one.is_folder ? t("drive.downloadZip") : t("common.download"),
        icon: DownloadIcon,
        run: () => download(one),
      });
    if (editable && one) {
      actions.push({
        label: t("page.share"),
        icon: ShareIcon,
        run: () => setDialog({ kind: "share", item: one }),
        divider: true,
      });
      actions.push({
        label: t("drive.rename"),
        icon: EditIcon,
        run: () => setDialog({ kind: "rename", item: one }),
      });
    }
    if (editable) {
      actions.push({
        label: t("drive.moveTo"),
        icon: MoveIcon,
        run: () => setDialog({ kind: "move", items: list }),
      });
      const allStarred = list.every((i) => i.starred);
      actions.push({
        label: allStarred ? t("drive.unstar") : t("drive.star"),
        icon: () => <StarIcon filled={!allStarred} />,
        run: () =>
          void run(async () => {
            for (const i of list) await driveApi.update(i.id, { starred: !allStarred });
          }),
      });
    }
    if (one)
      actions.push({
        label: t("drive.details"),
        icon: InfoIcon,
        run: () => {
          setSelected(new Set([one.id]));
          setDetails(true);
        },
      });
    if (editable)
      actions.push({
        label: t("drive.toTrash"),
        icon: TrashIcon,
        danger: true,
        divider: true,
        run: () => void trash(list),
      });
    return actions;
  }

  function openMenu(event: MouseEvent, item: DriveItem) {
    event.preventDefault();
    event.stopPropagation();
    if (!selected.has(item.id)) setSelected(new Set([item.id]));
    setMenu({ x: event.clientX, y: event.clientY, item });
  }

  // ------------------------------------------------------------ rendering

  const sectionLabel = t(SECTIONS.find((s) => s.id === section)?.label ?? "drive.myDrive");
  const title =
    view === "search"
      ? t("search.resultsFor", { query })
      : view === "folder"
        ? (data?.folder?.name ?? sectionLabel)
        : t(VIEWS.find((v) => v.id === view)!.label);
  // Documents are always a list; the media libraries have their own views.
  const shownLayout = section === "documents" ? "list" : layout;

  const usedRatio = usage && usage.quota ? Math.min(1, usage.used / usage.quota) : 0;
  const fmt = (bytes: number) => formatBytes(bytes, calendar.formatNumber);

  const itemProps = (item: DriveItem) => ({
    "data-selected": selected.has(item.id),
    draggable: editable && view !== "trash",
    onDragStart: (event: DragEvent) => dragStart(event, item),
    onClick: (event: MouseEvent) => {
      if (event.detail > 1) return;
      // Touch screens and plain clicks on small screens open directly.
      if (window.matchMedia("(hover: none)").matches) open(item);
      else select(item, event);
    },
    onDoubleClick: () => open(item),
    onContextMenu: (event: MouseEvent) => openMenu(event, item),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter") open(item);
    },
    tabIndex: 0,
    role: "row",
    "aria-selected": selected.has(item.id),
  });

  const checkbox = (item: DriveItem) => (
    <button
      type="button"
      className="drive-check"
      aria-label={t("drive.select", { name: item.name })}
      aria-pressed={selected.has(item.id)}
      onClick={(event) => {
        event.stopPropagation();
        toggle(item);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <CheckIcon />
    </button>
  );

  const moreButton = (item: DriveItem) => (
    <button
      type="button"
      className="icon-button small drive-more"
      aria-label={t("common.actions")}
      onClick={(event) => {
        event.stopPropagation();
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        if (!selected.has(item.id)) setSelected(new Set([item.id]));
        setMenu({ x: rect.left, y: rect.bottom + 4, item });
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <MoreIcon />
    </button>
  );

  return (
    <div className="drive-page" data-details={details && !!detailItem}>
      <aside className="drive-side">
        {editable && view !== "trash" ? (
          <NewMenu
            onFolder={() => setDialog({ kind: "folder" })}
            onFiles={() => fileInput.current?.click()}
            onFolderUpload={() => folderInput.current?.click()}
          />
        ) : (
          <div className="drive-new-placeholder" />
        )}
        <nav className="drive-nav" aria-label={t("nav.drive")}>
          {VIEWS.slice(0, 1).map((item) => (
            <Link
              key={item.id}
              to={item.to}
              className="drive-nav-item"
              aria-current={view === "folder" && section === "files" ? "page" : undefined}
              {...(section === "files" ? folderDropProps(null, "root") : {})}
              data-drop={section === "files" && dropTarget === "root"}
            >
              <item.icon />
              <span>{t(item.label)}</span>
            </Link>
          ))}
          <p className="drive-nav-heading">{t("drive.libraries")}</p>
          {SECTIONS.map((item) => (
            <Link
              key={item.id}
              to={rootUrl(item.id)}
              className="drive-nav-item"
              data-section={item.id}
              aria-current={view === "folder" && section === item.id ? "page" : undefined}
            >
              <item.icon />
              <span>{t(item.label)}</span>
            </Link>
          ))}
          <span className="drive-nav-sep" aria-hidden="true" />
          {VIEWS.slice(1).map((item) => (
            <Link
              key={item.id}
              to={item.to}
              className="drive-nav-item"
              aria-current={view === item.id ? "page" : undefined}
            >
              <item.icon />
              <span>{t(item.label)}</span>
            </Link>
          ))}
        </nav>
        {usage && (
          <div className="drive-storage">
            <div className="drive-storage-bar" aria-hidden="true">
              <span
                style={{ width: `${Math.max(usedRatio * 100, usage.used ? 2 : 0)}%` }}
                data-full={usedRatio > 0.9}
              />
            </div>
            <p className="small">
              {usage.quota
                ? t("drive.storageOf", { used: fmt(usage.used), total: fmt(usage.quota) })
                : t("drive.storageUsed", { used: fmt(usage.used) })}
            </p>
            <p className="muted small">{t("drive.maxFile", { size: fmt(usage.max_file) })}</p>
          </div>
        )}
      </aside>

      <section
        className="drive-main"
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(event) => void onDrop(event)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelected(new Set());
        }}
      >
        <header className="drive-header">
          <div className="drive-crumbs">
            {view === "folder" ? (
              <>
                <Link
                  to={rootUrl(section)}
                  className="drive-crumb"
                  {...folderDropProps(null, "root")}
                  data-drop={dropTarget === "root"}
                >
                  {sectionLabel}
                </Link>
                {data?.path.map((crumb, index) => (
                  <span key={crumb.id} className="drive-crumb-wrap">
                    <span className="drive-crumb-sep" aria-hidden="true">
                      <ChevronRightIcon />
                    </span>
                    {index === (data?.path.length ?? 0) - 1 ? (
                      <span className="drive-crumb current" dir="auto">
                        {crumb.name}
                      </span>
                    ) : (
                      <Link
                        to={folderUrl(section, crumb.id)}
                        className="drive-crumb"
                        dir="auto"
                        {...folderDropProps(crumb.id, crumb.id)}
                        data-drop={dropTarget === crumb.id}
                      >
                        {crumb.name}
                      </Link>
                    )}
                  </span>
                ))}
              </>
            ) : (
              <h1 className="drive-crumb current">{title}</h1>
            )}
          </div>
          <div className="drive-tools">
            {view === "trash" && items.length > 0 && editable && (
              <button type="button" className="ghost small danger" onClick={() => void emptyTrash()}>
                <TrashIcon /> {t("drive.emptyTrash")}
              </button>
            )}
            <div className="segmented compact" role="group" aria-label={t("drive.layout")}>
              <button
                type="button"
                aria-pressed={layout === "list"}
                onClick={() => setLayout("list")}
                title={t("drive.listView")}
              >
                <ListIcon />
              </button>
              <button
                type="button"
                aria-pressed={layout === "grid"}
                onClick={() => setLayout("grid")}
                title={t("drive.gridView")}
              >
                <GridIcon />
              </button>
            </div>
            <button
              type="button"
              className={details ? "icon-button active" : "icon-button"}
              aria-pressed={details}
              onClick={() => setDetails(!details)}
              title={t("drive.details")}
            >
              <InfoIcon />
            </button>
          </div>
        </header>

        {selection.length > 0 ? (
          <div className="drive-selection" role="toolbar">
            <button
              type="button"
              className="icon-button small"
              onClick={() => setSelected(new Set())}
              aria-label={t("drive.clearSelection")}
            >
              <CloseIcon />
            </button>
            <strong>{t("drive.selected", { count: calendar.formatNumber(selection.length) })}</strong>
            <span className="drive-selection-actions">
              {actionsFor(selection)
                .filter((a) => !["drive.details"].includes(a.label))
                .slice(0, 6)
                .map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={action.danger ? "icon-button small danger" : "icon-button small"}
                    title={action.label}
                    aria-label={action.label}
                    onClick={action.run}
                  >
                    <action.icon />
                  </button>
                ))}
            </span>
          </div>
        ) : (
          view !== "recent" &&
          view !== "trash" && (
            <div className="drive-sortbar">
              <span className="muted small">
                {view === "search"
                  ? t("drive.foundCount", { count: calendar.formatNumber(items.length) })
                  : t("drive.countSummary", {
                      folders: calendar.formatNumber(folders.length),
                      files: calendar.formatNumber(files.length),
                    })}
              </span>
              <label className="drive-sort">
                <span className="muted small">{t("notes.sortBy")}</span>
                <select
                  className="compact-select"
                  value={sort.key}
                  onChange={(event) => setSort({ ...sort, key: event.target.value as SortKey })}
                >
                  <option value="name">{t("drive.col.name")}</option>
                  <option value="updated">{t("drive.col.modified")}</option>
                  <option value="size">{t("drive.col.size")}</option>
                </select>
                <button
                  type="button"
                  className="icon-button small"
                  aria-label={t("drive.sortDirection")}
                  onClick={() => setSort({ ...sort, desc: !sort.desc })}
                >
                  <span className="sort-arrow" data-desc={sort.desc}>
                    <ChevronDownIcon />
                  </span>
                </button>
              </label>
            </div>
          )
        )}

        {view === "trash" && items.length > 0 && (
          <p className="drive-banner muted small">{t("drive.trashHint")}</p>
        )}

        {isLoading ? (
          <Skeleton rows={4} height={shownLayout === "grid" ? 120 : 48} />
        ) : error ? (
          <EmptyState icon={DriveIcon} title={errorMessage(error, i18n)} />
        ) : !items.length ? (
          <DriveEmpty
            view={view}
            section={section}
            editable={editable}
            onUpload={() => fileInput.current?.click()}
          />
        ) : view === "folder" && (section === "music" || section === "videos" || section === "photos") ? (
          <SectionView
            section={section}
            folders={folders}
            files={files}
            selected={selected}
            onOpen={open}
            onSelect={(item, event) => select(item, event)}
            onMenu={openMenu}
            moreButton={moreButton}
            folderName={data?.folder?.name}
            onSlideshow={(first) => {
              const next = new URLSearchParams(search);
              next.set("file", String(first.id));
              next.set("slideshow", "1");
              setSearch(next);
            }}
          />
        ) : shownLayout === "grid" ? (
          <div className="drive-grid-wrap" role="grid" aria-label={title}>
            {folders.length > 0 && (
              <>
                <h2 className="drive-section-title">{t("drive.folders")}</h2>
                <div className="drive-folder-grid">
                  {folders.map((item) => (
                    <div
                      key={item.id}
                      className="drive-folder"
                      style={typeStyle("folder", item.color)}
                      {...itemProps(item)}
                      {...(view !== "trash" ? folderDropProps(item.id, item.id) : {})}
                      data-drop={dropTarget === item.id}
                    >
                      {checkbox(item)}
                      <FileTypeIcon type="folder" color={item.color} size={24} />
                      <span className="drive-name" dir="auto" title={item.name}>
                        {item.name}
                      </span>
                      {item.link_enabled || item.shared_count ? (
                        <span className="drive-shared-mark" title={t("drive.shared")}>
                          <UsersIcon />
                        </span>
                      ) : null}
                      {item.starred && (
                        <span className="drive-star">
                          <StarIcon filled />
                        </span>
                      )}
                      {moreButton(item)}
                    </div>
                  ))}
                </div>
              </>
            )}
            {files.length > 0 && (
              <>
                <h2 className="drive-section-title">{t("drive.files")}</h2>
                <div className="drive-file-grid">
                  {files.map((item) => {
                    const type = fileType(item);
                    return (
                      <div key={item.id} className="drive-file" style={typeStyle(type)} {...itemProps(item)}>
                        <div className="drive-file-head">
                          {checkbox(item)}
                          <FileTypeIcon type={type} size={20} />
                          <span className="drive-name" dir="auto" title={item.name}>
                            {item.name}
                          </span>
                          {moreButton(item)}
                        </div>
                        <div className="drive-thumb">
                          {type === "image" && item.url ? (
                            <img src={item.url} alt="" loading="lazy" draggable={false} />
                          ) : type === "video" && item.url ? (
                            <video src={`${item.url}#t=0.5`} preload="metadata" muted playsInline />
                          ) : (
                            <span className="drive-thumb-icon">
                              <FileTypeIcon type={type} size={56} />
                            </span>
                          )}
                          {item.starred && (
                            <span className="drive-star">
                              <StarIcon filled />
                            </span>
                          )}
                        </div>
                        <div className="drive-file-foot muted small">
                          <span>{fmt(item.size)}</span>
                          <span>{calendar.shortDate(item.updated_at)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="drive-table" role="grid" aria-label={title}>
            <div className="drive-row drive-row-head" role="row">
              <span className="drive-col-check" />
              <button
                type="button"
                className="drive-col-name"
                onClick={() => setSort({ key: "name", desc: sort.key === "name" ? !sort.desc : false })}
              >
                {t("drive.col.name")} {sort.key === "name" && <SortArrow desc={sort.desc} />}
              </button>
              <span className="drive-col-owner">{t("drive.col.owner")}</span>
              <button
                type="button"
                className="drive-col-date"
                onClick={() => setSort({ key: "updated", desc: sort.key === "updated" ? !sort.desc : true })}
              >
                {t("drive.col.modified")} {sort.key === "updated" && <SortArrow desc={sort.desc} />}
              </button>
              <button
                type="button"
                className="drive-col-size"
                onClick={() => setSort({ key: "size", desc: sort.key === "size" ? !sort.desc : true })}
              >
                {t("drive.col.size")} {sort.key === "size" && <SortArrow desc={sort.desc} />}
              </button>
              <span className="drive-col-more" />
            </div>
            {sorted.map((item) => {
              const type = fileType(item);
              return (
                <div
                  key={item.id}
                  className="drive-row"
                  {...itemProps(item)}
                  {...(item.is_folder && view !== "trash" ? folderDropProps(item.id, item.id) : {})}
                  data-drop={dropTarget === item.id}
                >
                  <span className="drive-col-check">{checkbox(item)}</span>
                  <span className="drive-col-name">
                    <FileTypeIcon type={type} color={item.is_folder ? item.color : null} size={22} />
                    <span className="drive-name" dir="auto" title={item.name}>
                      {item.name}
                    </span>
                    {(item.link_enabled || item.shared_count > 0) && (
                      <span className="drive-shared-mark" title={t("drive.shared")}>
                        <UsersIcon />
                      </span>
                    )}
                    {item.starred && (
                      <span className="drive-star inline">
                        <StarIcon filled />
                      </span>
                    )}
                  </span>
                  <span className="drive-col-owner muted small">{item.owner_name || "—"}</span>
                  <span className="drive-col-date muted small">{calendar.shortDate(item.updated_at)}</span>
                  <span className="drive-col-size muted small">
                    {item.is_folder
                      ? t("drive.itemCount", { count: calendar.formatNumber(item.item_count) })
                      : fmt(item.size)}
                  </span>
                  <span className="drive-col-more">{moreButton(item)}</span>
                </div>
              );
            })}
          </div>
        )}

        {dragging && (
          <div className="drive-dropzone" aria-hidden="true">
            <UploadIcon />
            <strong>{t("drive.dropHere")}</strong>
            <span>{data?.folder?.name ?? t("drive.myDrive")}</span>
          </div>
        )}
      </section>

      {details && detailItem && (
        <DetailsPanel
          item={detailItem}
          canEdit={editable}
          onDescription={(description) => void run(() => driveApi.update(detailItem.id, { description }))}
          onClose={() => setDetails(false)}
        />
      )}

      <input
        ref={fileInput}
        type="file"
        accept={SECTIONS.find((s) => s.id === section)?.accept}
        multiple
        hidden
        onChange={(event) => {
          const list = Array.from(event.target.files ?? []).map((file) => ({ file, path: "" }));
          event.target.value = "";
          if (list.length) uploads.add(list, uploadParent, section);
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(event) => {
          const list = Array.from(event.target.files ?? []).map((file) => ({
            file,
            path: (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "",
          }));
          event.target.value = "";
          if (list.length) uploads.add(list, uploadParent, section);
        }}
      />

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {(close) =>
            actionsFor(selected.has(menu.item.id) && selection.length > 1 ? selection : [menu.item]).map(
              (action) => (
                <div key={action.label}>
                  {action.divider && <div className="menu-separator" />}
                  <button
                    type="button"
                    role="menuitem"
                    className={action.danger ? "menu-item danger" : "menu-item"}
                    onClick={() => {
                      close();
                      action.run();
                    }}
                  >
                    <action.icon />
                    <span className="menu-item-text">{action.label}</span>
                  </button>
                </div>
              ),
            )
          }
        </ContextMenu>
      )}

      <UploadPanel jobs={uploads.jobs} onCancel={uploads.cancel} onClear={uploads.clear} />

      {previewItem && (
        <DrivePreview
          item={previewItem}
          items={files.length ? files : [previewItem]}
          onNavigate={(item) => setPreview(item)}
          onClose={() => setPreview(null)}
          slideshow={search.get("slideshow") === "1"}
          onShare={editable ? () => setDialog({ kind: "share", item: previewItem }) : undefined}
          onDetails={() => {
            setSelected(new Set([previewItem.id]));
            setDetails(true);
            setPreview(null);
          }}
        />
      )}

      {dialog?.kind === "folder" && (
        <NameDialog
          title={t("drive.newFolder")}
          initial={t("drive.untitledFolder")}
          withColor
          submitLabel={t("common.create")}
          onSubmit={async (name, color) => {
            await driveApi.createFolder(name, uploadParent, color, section);
            refresh();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "rename" && (
        <NameDialog
          title={t("drive.rename")}
          initial={dialog.item.name}
          withColor={dialog.item.is_folder}
          initialColor={dialog.item.color}
          submitLabel={t("common.save")}
          onSubmit={async (name, color) => {
            await driveApi.update(dialog.item.id, dialog.item.is_folder ? { name, color } : { name });
            refresh();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "move" && (
        <MoveDialog
          items={dialog.items}
          section={dialog.items[0]?.section ?? section}
          currentFolder={dialog.items[0]?.parent_id ?? null}
          onMove={(target) => moveTo(dialog.items, target)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "share" && (
        <ShareDialog
          kind="drive"
          itemId={dialog.item.id}
          title={dialog.item.name}
          onClose={() => {
            setDialog(null);
            refresh();
          }}
          extra={<PublicLinkSection item={dialog.item} />}
        />
      )}
    </div>
  );
}

function SortArrow({ desc }: { desc: boolean }) {
  return (
    <span className="sort-arrow" data-desc={desc} aria-hidden="true">
      <ChevronDownIcon />
    </span>
  );
}

function NewMenu({
  onFolder,
  onFiles,
  onFolderUpload,
}: {
  onFolder: () => void;
  onFiles: () => void;
  onFolderUpload: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };
  return (
    <div className="drive-new" ref={ref}>
      <button
        type="button"
        className="drive-new-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <PlusIcon />
        <span>{t("common.new")}</span>
      </button>
      {open && (
        <div className="menu drive-new-menu" role="menu">
          <button type="button" role="menuitem" className="menu-item" onClick={() => choose(onFolder)}>
            <FolderPlusIcon /> <span className="menu-item-text">{t("drive.newFolder")}</span>
          </button>
          <div className="menu-separator" />
          <button type="button" role="menuitem" className="menu-item" onClick={() => choose(onFiles)}>
            <UploadIcon /> <span className="menu-item-text">{t("drive.uploadFiles")}</span>
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => choose(onFolderUpload)}>
            <FileTypeIcon type="folder" size={20} />{" "}
            <span className="menu-item-text">{t("drive.uploadFolder")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ContextMenu({
  x,
  y,
  onClose,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: (close: () => void) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useDismiss(ref, true, onClose);
  useEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - box.height - 8)),
    });
  }, [x, y]);
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="menu context-menu"
      role="menu"
      style={{ left: position.left, top: position.top }}
    >
      {children(onClose)}
    </div>
  );
}

function DriveEmpty({
  view,
  section,
  editable,
  onUpload,
}: {
  view: DriveView;
  section: DriveSection;
  editable: boolean;
  onUpload: () => void;
}) {
  const { t } = useI18n();
  const library = SECTIONS.find((s) => s.id === section);
  if (view === "folder" && library) {
    return (
      <div className="drive-empty" data-section={section}>
        <span className="drive-empty-library" aria-hidden="true">
          <library.icon />
        </span>
        <h2>{t(library.empty)}</h2>
        <p className="muted">{t(library.emptyHint)}</p>
        {editable && (
          <button type="button" className="primary" onClick={onUpload}>
            <UploadIcon /> {t(library.upload)}
          </button>
        )}
      </div>
    );
  }
  const content: Record<DriveView, [string, string]> = {
    folder: [t("drive.emptyFolder"), t("drive.emptyFolderHint")],
    recent: [t("drive.emptyRecent"), t("drive.emptyRecentHint")],
    starred: [t("drive.emptyStarred"), t("drive.emptyStarredHint")],
    trash: [t("drive.emptyTrashView"), t("drive.emptyTrashHint")],
    shared: [t("drive.emptyShared"), t("drive.emptySharedHint")],
    search: [t("search.nothing"), t("search.nothingHint")],
  };
  const [title, hint] = content[view];
  return (
    <div className="drive-empty">
      <div className="drive-empty-art" aria-hidden="true">
        <FileTypeIcon type="folder" size={72} />
        <FileTypeIcon type="image" size={40} />
        <FileTypeIcon type="pdf" size={40} />
      </div>
      <h2>{title}</h2>
      <p className="muted">{hint}</p>
      {editable && view === "folder" && (
        <button type="button" className="primary" onClick={onUpload}>
          <UploadIcon /> {t("drive.uploadFiles")}
        </button>
      )}
    </div>
  );
}

function UploadPanel({
  jobs,
  onCancel,
  onClear,
}: {
  jobs: ReturnType<typeof useUploads>["jobs"];
  onCancel: (id: number) => void;
  onClear: () => void;
}) {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const [collapsed, setCollapsed] = useState(false);
  if (!jobs.length) return null;
  const active = jobs.filter((j) => j.status === "queued" || j.status === "uploading").length;
  const done = jobs.filter((j) => j.status === "done").length;
  const failed = jobs.filter((j) => j.status === "error").length;
  return (
    <div className="upload-panel" data-collapsed={collapsed}>
      <header>
        <strong>
          {active
            ? t("drive.uploading", { count: calendar.formatNumber(active) })
            : t("drive.uploaded", { count: calendar.formatNumber(done) })}
          {failed > 0 && (
            <span className="upload-failed">
              {" "}
              · {t("drive.uploadFailed", { count: calendar.formatNumber(failed) })}
            </span>
          )}
        </strong>
        <button
          type="button"
          className="icon-button small"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? t("drive.expand") : t("drive.collapse")}
        >
          <span className="move-chevron" data-open={!collapsed}>
            <ChevronDownIcon />
          </span>
        </button>
        {!active && (
          <button
            type="button"
            className="icon-button small"
            onClick={onClear}
            aria-label={t("common.close")}
          >
            <CloseIcon />
          </button>
        )}
      </header>
      {!collapsed && (
        <ul>
          {jobs.map((job) => {
            const type = fileType({ is_folder: false, name: job.name, kind: "", content_type: "" });
            return (
              <li key={job.id} data-status={job.status}>
                <FileTypeIcon type={type} size={22} />
                <span className="upload-name" dir="auto" title={job.name}>
                  {job.name}
                  {job.status === "error" && (
                    <span className="error-text small">{errorMessage(job.error, i18n)}</span>
                  )}
                </span>
                {job.status === "uploading" || job.status === "queued" ? (
                  <>
                    <span
                      className="upload-ring"
                      style={{ "--p": job.progress } as React.CSSProperties}
                      title={`${Math.round(job.progress * 100)}%`}
                    />
                    <button
                      type="button"
                      className="icon-button small"
                      onClick={() => onCancel(job.id)}
                      aria-label={t("common.cancel")}
                    >
                      <CloseIcon />
                    </button>
                  </>
                ) : job.status === "done" ? (
                  <span className="upload-done">
                    <CheckIcon />
                  </span>
                ) : (
                  <span className="muted small">
                    {job.status === "cancelled" ? t("drive.cancelled") : "!"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
