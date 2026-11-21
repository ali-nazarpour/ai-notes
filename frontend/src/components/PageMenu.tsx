/**
 * The "⋯" page menu (Notion-like), shared by notes, documentation pages and blog posts:
 * search actions, copy link / contents, duplicate, move, version history, share,
 * appearance (font, small text, full width, table of contents), AI actions, lock,
 * import / export and delete, with "last edited" and the word count at the bottom.
 * Every action is optional: pass only what the page supports.
 */
import { useRef, useState, type ReactNode } from "react";

import { useI18n, type TranslationKey } from "../i18n";
import type { FontStyle, NoteSettings } from "../types";
import {
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  FontIcon,
  HistoryIcon,
  type IconComponent,
  LinkIcon,
  LockIcon,
  MoreIcon,
  NotesIcon,
  PrinterIcon,
  SearchIcon,
  ShareIcon,
  SparkleIcon,
  TocIcon,
  TranslateIcon,
  TrashIcon,
  UploadIcon,
  WidthIcon,
  FolderIcon,
  TextIcon,
} from "./Icons";
import { Popover } from "./ui";

export type ExportFormat = "markdown" | "html" | "text" | "pdf";
export type AiMode = "summarize" | "translate" | "ask";

export interface PageMenuProps {
  settings?: NoteSettings;
  onSettings?: (settings: NoteSettings) => void;
  onCopyLink?: () => void;
  onCopyContents?: () => void;
  onDuplicate?: () => void;
  /** Renders the content of the "Move to" submenu. */
  moveMenu?: (close: () => void) => ReactNode;
  onHistory?: () => void;
  onShare?: () => void;
  onAi?: (mode: AiMode) => void;
  onExport?: (format: ExportFormat) => void;
  onImport?: (file: File) => void;
  onTrash?: () => void;
  onDelete?: () => void;
  lastEdited?: { name: string; at: string };
  words?: number;
  readOnly?: boolean;
}

interface Action {
  key: string;
  label: TranslationKey;
  icon: IconComponent;
  run: () => void;
  danger?: boolean;
  hint?: string;
}

const FONTS: { value: FontStyle; label: TranslationKey; sample: string }[] = [
  { value: "default", label: "page.font.default", sample: "Ag" },
  { value: "serif", label: "page.font.serif", sample: "Ag" },
  { value: "mono", label: "page.font.mono", sample: "Ag" },
];

export const DEFAULT_SETTINGS: NoteSettings = {
  font: "default",
  small_text: false,
  full_width: false,
  toc: false,
  locked: false,
};

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={onChange}
    >
      <span className="switch-thumb" />
    </button>
  );
}

export function PageMenu(props: PageMenuProps) {
  const { t, calendar, plural } = useI18n();
  const [query, setQuery] = useState("");
  const [submenu, setSubmenu] = useState<"appearance" | "ai" | "export" | "move" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const settings = props.settings ?? DEFAULT_SETTINGS;
  const change = (patch: Partial<NoteSettings>) => props.onSettings?.({ ...settings, ...patch });

  return (
    <Popover
      label={t("common.more")}
      align="end"
      className="page-menu-anchor"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className="icon-button"
          aria-expanded={open}
          aria-label={t("common.more")}
          title={t("common.more")}
          onClick={() => {
            setSubmenu(null);
            setQuery("");
            toggle();
          }}
        >
          <MoreIcon />
        </button>
      )}
    >
      {(close) => {
        const act = (fn: () => void) => () => {
          close();
          fn();
        };
        const primary: Action[] = [
          props.onCopyLink && {
            key: "link",
            label: "page.copyLink",
            icon: LinkIcon,
            run: act(props.onCopyLink),
            hint: "Ctrl+L",
          },
          props.onCopyContents && {
            key: "contents",
            label: "page.copyContents",
            icon: NotesIcon,
            run: act(props.onCopyContents),
          },
          props.onDuplicate &&
            !props.readOnly && {
              key: "duplicate",
              label: "page.duplicate",
              icon: CopyIcon,
              run: act(props.onDuplicate),
              hint: "Ctrl+D",
            },
          props.onHistory && {
            key: "history",
            label: "page.history",
            icon: HistoryIcon,
            run: act(props.onHistory),
          },
          props.onShare && { key: "share", label: "page.share", icon: ShareIcon, run: act(props.onShare) },
          props.onImport &&
            !props.readOnly && {
              key: "import",
              label: "page.import",
              icon: UploadIcon,
              run: () => fileInput.current?.click(),
            },
        ].filter(Boolean) as Action[];
        const danger: Action[] = [
          props.onTrash &&
            !props.readOnly && {
              key: "trash",
              label: "page.trash",
              icon: TrashIcon,
              run: act(props.onTrash),
              danger: true,
            },
          props.onDelete &&
            !props.readOnly && {
              key: "delete",
              label: "page.delete",
              icon: TrashIcon,
              run: act(props.onDelete),
              danger: true,
            },
        ].filter(Boolean) as Action[];
        const q = query.trim().toLowerCase();
        const match = (action: Action) =>
          !q || t(action.label).toLowerCase().includes(q) || action.key.includes(q);
        const row = (action: Action) => (
          <button
            key={action.key}
            type="button"
            role="menuitem"
            className={action.danger ? "menu-item danger" : "menu-item"}
            onClick={action.run}
          >
            <action.icon />
            <span className="menu-item-text">{t(action.label)}</span>
            {action.hint && <kbd className="menu-hint">{action.hint}</kbd>}
          </button>
        );
        const sub = (key: NonNullable<typeof submenu>, label: TranslationKey, Icon: IconComponent) => (
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            aria-expanded={submenu === key}
            onClick={() => setSubmenu(submenu === key ? null : key)}
          >
            <Icon />
            <span className="menu-item-text">{t(label)}</span>
            <span className="flip-rtl-wrap">
              <ChevronRightIcon />
            </span>
          </button>
        );

        return (
          <div className="page-menu" role="menu">
            <label className="page-menu-search">
              <SearchIcon />
              <input
                value={query}
                autoFocus
                placeholder={t("page.searchActions")}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="page-menu-columns">
              {!submenu && (
                <div className="page-menu-main">
                  {primary.filter(match).map(row)}
                  {props.moveMenu &&
                    !props.readOnly &&
                    (!q || t("page.moveTo").toLowerCase().includes(q)) &&
                    sub("move", "page.moveTo", FolderIcon)}
                  {(props.onSettings || props.onExport || props.onAi) && <div className="menu-separator" />}
                  {props.onSettings &&
                    (!q || t("page.appearance").toLowerCase().includes(q)) &&
                    sub("appearance", "page.appearance", FontIcon)}
                  {props.onAi &&
                    (!q || t("page.useAi").toLowerCase().includes(q)) &&
                    sub("ai", "page.useAi", SparkleIcon)}
                  {props.onExport &&
                    (!q || t("page.export").toLowerCase().includes(q)) &&
                    sub("export", "page.export", DownloadIcon)}
                  {props.onSettings && !props.readOnly && (
                    <div className="menu-item menu-toggle">
                      <LockIcon />
                      <span className="menu-item-text">{t("page.lock")}</span>
                      <Switch
                        checked={settings.locked}
                        label={t("page.lock")}
                        onChange={() => change({ locked: !settings.locked })}
                      />
                    </div>
                  )}
                  {danger.filter(match).length > 0 && <div className="menu-separator" />}
                  {danger.filter(match).map(row)}
                </div>
              )}

              {submenu && (
                <div className="page-submenu">
                  <button type="button" className="menu-item submenu-back" onClick={() => setSubmenu(null)}>
                    <span className="flip-back">
                      <ChevronRightIcon />
                    </span>
                    <span className="menu-item-text">{t("common.back")}</span>
                  </button>
                  <div className="menu-separator" />
                  {submenu === "appearance" && (
                    <>
                      <p className="menu-heading">{t("page.fontStyle")}</p>
                      <div className="font-choices">
                        {FONTS.map((font) => (
                          <button
                            key={font.value}
                            type="button"
                            className="font-choice"
                            data-font={font.value}
                            aria-pressed={settings.font === font.value}
                            onClick={() => change({ font: font.value })}
                          >
                            <span className="font-sample">{font.sample}</span>
                            <span>{t(font.label)}</span>
                          </button>
                        ))}
                      </div>
                      <div className="menu-separator" />
                      {(
                        [
                          ["small_text", "page.smallText", TextIcon],
                          ["full_width", "page.fullWidth", WidthIcon],
                          ["toc", "page.toc", TocIcon],
                        ] as const
                      ).map(([key, label, Icon]) => (
                        <div key={key} className="menu-item menu-toggle">
                          <Icon />
                          <span className="menu-item-text">{t(label)}</span>
                          <Switch
                            checked={settings[key]}
                            label={t(label)}
                            onChange={() => change({ [key]: !settings[key] })}
                          />
                        </div>
                      ))}
                    </>
                  )}
                  {submenu === "ai" && props.onAi && (
                    <>
                      {(
                        [
                          ["summarize", "ai.summarize", SparkleIcon],
                          ["translate", "ai.translate", TranslateIcon],
                          ["ask", "ai.ask", SearchIcon],
                        ] as const
                      ).map(([mode, label, Icon]) => (
                        <button
                          key={mode}
                          type="button"
                          className="menu-item"
                          onClick={act(() => props.onAi?.(mode))}
                        >
                          <Icon /> <span className="menu-item-text">{t(label)}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {submenu === "export" && props.onExport && (
                    <>
                      {(
                        [
                          ["markdown", "page.export.markdown", DownloadIcon],
                          ["html", "page.export.html", DownloadIcon],
                          ["text", "page.export.text", DownloadIcon],
                          ["pdf", "page.export.pdf", PrinterIcon],
                        ] as const
                      ).map(([format, label, Icon]) => (
                        <button
                          key={format}
                          type="button"
                          className="menu-item"
                          onClick={act(() => props.onExport?.(format))}
                        >
                          <Icon /> <span className="menu-item-text">{t(label)}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {submenu === "move" && props.moveMenu?.(close)}
                </div>
              )}
            </div>
            {(props.lastEdited || props.words !== undefined) && (
              <div className="page-menu-footer">
                {props.lastEdited && (
                  <>
                    <span className="muted small">{t("page.lastEdited")}</span>
                    <span className="small">
                      {props.lastEdited.name ? `${props.lastEdited.name} · ` : ""}
                      {calendar.dateTime(props.lastEdited.at)}
                    </span>
                  </>
                )}
                {props.words !== undefined && (
                  <span className="muted small">{plural("notes.words", props.words)}</span>
                )}
              </div>
            )}
            <input
              ref={fileInput}
              type="file"
              hidden
              accept=".md,.markdown,.txt,.html,.htm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  close();
                  props.onImport?.(file);
                }
              }}
            />
          </div>
        );
      }}
    </Popover>
  );
}
