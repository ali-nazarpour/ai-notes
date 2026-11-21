/** Drive dialogs: new folder, rename, move to, details, and the public link panel. */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { driveApi } from "../../api/v5";
import { useToast } from "../../components/Feedback";
import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  DriveIcon,
  EditIcon,
  FolderPlusIcon,
  GlobeIcon,
  InfoIcon,
  LockIcon,
  MoveIcon,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { formatBytes } from "../../lib/embeds";
import type { DriveFolder, DriveItem, DriveSection } from "../../types5";
import { FileTypeIcon } from "./FileIcon";
import { fileType, FOLDER_COLORS, TYPE_LABELS } from "./fileTypes";

export function NameDialog({
  title,
  initial,
  withColor = false,
  initialColor = null,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: string;
  withColor?: boolean;
  initialColor?: string | null;
  submitLabel: string;
  onSubmit: (name: string, color: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const [name, setName] = useState(initial);
  const [color, setColor] = useState<string | null>(initialColor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSubmit(name.trim(), color);
      onClose();
    } catch (err) {
      setError(errorMessage(err, i18n));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      icon={withColor ? FolderPlusIcon : EditIcon}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" form="drive-name-form" className="primary" disabled={busy || !name.trim()}>
            {submitLabel}
          </button>
        </>
      }
    >
      <form id="drive-name-form" className="stack" onSubmit={submit}>
        <input
          type="text"
          dir="auto"
          data-autofocus
          maxLength={255}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onFocus={(event) => {
            // Select the name without the extension, like file managers do.
            const dot = event.target.value.lastIndexOf(".");
            event.target.setSelectionRange(0, dot > 0 && !withColor ? dot : event.target.value.length);
          }}
        />
        {withColor && (
          <div
            className="folder-colors"
            role="radiogroup"
            aria-label={t("drive.folderColor")}
            style={{ "--cols": Math.ceil(FOLDER_COLORS.length / 2) } as React.CSSProperties}
          >
            {FOLDER_COLORS.map((value, index) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={(color ?? FOLDER_COLORS[0]) === value}
                className="folder-color"
                style={{ background: value }}
                onClick={() => setColor(index === 0 ? null : value)}
              >
                {(color ?? FOLDER_COLORS[0]) === value && <CheckIcon />}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

interface TreeNode extends DriveFolder {
  children: TreeNode[];
}

function buildTree(folders: DriveFolder[]): TreeNode[] {
  const nodes = new Map<number, TreeNode>(folders.map((f) => [f.id, { ...f, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id != null ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function MoveDialog({
  items,
  section,
  currentFolder,
  onMove,
  onClose,
}: {
  items: DriveItem[];
  section: DriveSection;
  currentFolder: number | null;
  onMove: (target: number | null) => Promise<void>;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const { data: folders = [], isLoading } = useQuery({
    queryKey: ["drive-folders", section],
    queryFn: () => driveApi.folders(section),
  });
  const [target, setTarget] = useState<number | null>(currentFolder);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const moving = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const tree = useMemo(() => buildTree(folders), [folders]);

  // Open the path to the current folder.
  useEffect(() => {
    if (currentFolder == null || !folders.length) return;
    const byId = new Map(folders.map((f) => [f.id, f]));
    const path = new Set<number>();
    let cursor = byId.get(currentFolder)?.parent_id ?? null;
    while (cursor != null && !path.has(cursor)) {
      path.add(cursor);
      cursor = byId.get(cursor)?.parent_id ?? null;
    }
    setOpen(path);
  }, [currentFolder, folders]);

  function render(nodes: TreeNode[], depth: number): React.ReactNode {
    return nodes
      .filter((node) => !moving.has(node.id))
      .map((node) => {
        const expanded = open.has(node.id);
        const children = node.children.filter((c) => !moving.has(c.id));
        return (
          <li key={node.id}>
            <div
              className="move-row"
              aria-selected={target === node.id}
              style={{ paddingInlineStart: `${depth * 18 + 6}px` }}
            >
              <button
                type="button"
                className="icon-button small move-toggle"
                aria-label={expanded ? t("drive.collapse") : t("drive.expand")}
                style={{ visibility: children.length ? "visible" : "hidden" }}
                onClick={() =>
                  setOpen((set) => {
                    const next = new Set(set);
                    if (next.has(node.id)) next.delete(node.id);
                    else next.add(node.id);
                    return next;
                  })
                }
              >
                <span className="move-chevron" data-open={expanded}>
                  <ChevronRightIcon />
                </span>
              </button>
              <button
                type="button"
                className="move-target"
                onClick={() => setTarget(node.id)}
                onDoubleClick={() => setOpen((s) => new Set(s).add(node.id))}
              >
                <FileTypeIcon type="folder" color={node.color} size={20} />
                <span dir="auto">{node.name}</span>
              </button>
            </div>
            {expanded && children.length > 0 && <ul>{render(children, depth + 1)}</ul>}
          </li>
        );
      });
  }

  async function submit() {
    setBusy(true);
    try {
      await onMove(target);
      onClose();
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={
        items.length === 1
          ? t("drive.moveOne", { name: items[0].name })
          : t("drive.moveMany", { count: items.length })
      }
      icon={MoveIcon}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || target === currentFolder}
            onClick={() => void submit()}
          >
            {t("drive.moveHere")}
          </button>
        </>
      }
    >
      <ul className="move-tree">
        <li>
          <div className="move-row" aria-selected={target === null}>
            <span className="icon-button small move-toggle" aria-hidden="true" />
            <button type="button" className="move-target" onClick={() => setTarget(null)}>
              <span className="move-root-icon">
                <DriveIcon />
              </span>
              <span>{t("drive.myDrive")}</span>
            </button>
          </div>
          {isLoading ? <p className="muted small">{t("common.loading")}</p> : <ul>{render(tree, 1)}</ul>}
        </li>
      </ul>
    </Modal>
  );
}

export function DetailsPanel({
  item,
  canEdit,
  onDescription,
  onClose,
}: {
  item: DriveItem;
  canEdit: boolean;
  onDescription: (value: string) => void;
  onClose: () => void;
}) {
  const { t, calendar } = useI18n();
  const type = fileType(item);
  const [description, setDescription] = useState(item.description);
  useEffect(() => setDescription(item.description), [item.id, item.description]);
  const rows: [string, React.ReactNode][] = [
    [t("drive.col.type"), t(TYPE_LABELS[type])],
    ...(item.is_folder
      ? ([[t("drive.items"), calendar.formatNumber(item.item_count)]] as [string, React.ReactNode][])
      : ([[t("drive.col.size"), formatBytes(item.size, calendar.formatNumber)]] as [
          string,
          React.ReactNode,
        ][])),
    [t("drive.col.owner"), item.owner_name || "—"],
    [t("drive.col.modified"), calendar.dateTime(item.updated_at)],
    [t("drive.created"), calendar.dateTime(item.created_at)],
    [
      t("drive.access"),
      item.link_enabled
        ? t("drive.publicLinkOn")
        : item.shared_count
          ? t("drive.sharedWith", { count: item.shared_count })
          : t("drive.private"),
    ],
  ];
  return (
    <aside className="drive-details" aria-label={t("drive.details")}>
      <header>
        <InfoIcon />
        <strong dir="auto">{item.name}</strong>
        <button type="button" className="icon-button small" onClick={onClose} aria-label={t("common.close")}>
          ×
        </button>
      </header>
      <div className="drive-details-preview">
        {type === "image" && item.url ? (
          <img src={item.url} alt="" />
        ) : (
          <FileTypeIcon type={type} color={item.color} size={64} />
        )}
      </div>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd dir="auto">{value}</dd>
          </div>
        ))}
      </dl>
      <label className="field">
        <span className="field-label">{t("drive.description")}</span>
        <textarea
          rows={3}
          dir="auto"
          maxLength={500}
          readOnly={!canEdit}
          placeholder={canEdit ? t("drive.descriptionPlaceholder") : ""}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => description !== item.description && onDescription(description)}
        />
      </label>
    </aside>
  );
}

export function PublicLinkSection({ item }: { item: DriveItem }) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const { data, refetch } = useQuery({
    queryKey: ["drive-link", item.id],
    queryFn: () => driveApi.link(item.id),
  });
  const [busy, setBusy] = useState(false);
  const token = data?.token ?? null;
  const url = token ? `${window.location.origin}/d/${token}` : "";

  async function toggle() {
    setBusy(true);
    try {
      await driveApi.setLink(item.id, !token);
      await refetch();
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public-link" data-on={!!token}>
      <div className="public-link-head">
        <span className="public-link-icon">{token ? <GlobeIcon /> : <LockIcon />}</span>
        <span>
          <strong>{token ? t("drive.anyoneWithLink") : t("drive.restricted")}</strong>
          <span className="muted small">{token ? t("drive.anyoneHint") : t("drive.restrictedHint")}</span>
        </span>
      </div>
      {token && (
        <div className="public-link-url">
          <input readOnly dir="ltr" value={url} onFocus={(event) => event.target.select()} />
          <button
            type="button"
            className="icon-button small"
            title={t("common.copy")}
            onClick={() =>
              void navigator.clipboard.writeText(url).then(() => toast(t("common.copied"), "success"))
            }
          >
            <CopyIcon />
          </button>
        </div>
      )}
      <button
        type="button"
        className={token ? "ghost small" : "small"}
        disabled={busy}
        onClick={() => void toggle()}
      >
        {token ? t("drive.linkOff") : t("drive.linkOn")}
      </button>
    </div>
  );
}
