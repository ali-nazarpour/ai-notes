/**
 * Floating toolbars:
 * - FormatToolbar appears over selected text: marks, links, alignment, block type, AI.
 * - TableToolbar appears while the cursor is inside a table: rows, columns, header, delete.
 */
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { NodeSelection } from "@tiptap/pm/state";
import { useState, type FormEvent } from "react";

import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  CodeIcon,
  HighlightIcon,
  ItalicIcon,
  LinkIcon,
  SparkleIcon,
  StrikeIcon,
  TrashIcon,
  UnderlineIcon,
} from "../../components/Icons";
import { useI18n } from "../../i18n";
import { QUICK_LANGUAGES, translationLanguage } from "../../lib/languages";
import type { EditAction } from "../../types";
import { ACTION_LABELS } from "./AiDialog";

const AI_ACTIONS: EditAction[] = [
  "improve",
  "fix",
  "shorter",
  "longer",
  "simplify",
  "professional",
  "friendly",
];

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

export function FormatToolbar({
  editor,
  onAi,
}: {
  editor: Editor;
  onAi: (action: EditAction, targetLanguage?: string) => void;
}) {
  const { t } = useI18n();
  const [panel, setPanel] = useState<"none" | "link" | "ai">("none");
  const [href, setHref] = useState("");

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      highlight: e.isActive("highlight"),
      link: e.isActive("link"),
      align: (["left", "center", "right", "justify"] as const).find((value) =>
        e.isActive({ textAlign: value }),
      ),
      block: e.isActive("heading", { level: 1 })
        ? "h1"
        : e.isActive("heading", { level: 2 })
          ? "h2"
          : e.isActive("heading", { level: 3 })
            ? "h3"
            : "p",
    }),
  });

  const chain = () => editor.chain().focus();
  const marks = [
    { key: "bold", icon: BoldIcon, active: state.bold, run: () => chain().toggleBold().run() },
    { key: "italic", icon: ItalicIcon, active: state.italic, run: () => chain().toggleItalic().run() },
    {
      key: "underline",
      icon: UnderlineIcon,
      active: state.underline,
      run: () => chain().toggleUnderline().run(),
    },
    { key: "strike", icon: StrikeIcon, active: state.strike, run: () => chain().toggleStrike().run() },
    { key: "code", icon: CodeIcon, active: state.code, run: () => chain().toggleCode().run() },
    {
      key: "highlight",
      icon: HighlightIcon,
      active: state.highlight,
      run: () => chain().toggleHighlight().run(),
    },
  ] as const;
  const alignments = [
    { value: "left", icon: AlignLeftIcon },
    { value: "center", icon: AlignCenterIcon },
    { value: "right", icon: AlignRightIcon },
    { value: "justify", icon: AlignJustifyIcon },
  ] as const;

  function setBlock(value: string) {
    if (value === "p") chain().setParagraph().run();
    else
      chain()
        .setNode("heading", { level: Number(value.slice(1)) })
        .run();
  }

  function submitLink(event: FormEvent) {
    event.preventDefault();
    const url = safeHref(href);
    if (url) chain().extendMarkRange("link").setLink({ href: url }).run();
    else chain().extendMarkRange("link").unsetLink().run();
    setPanel("none");
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="format-toolbar"
      className="bubble"
      options={{ placement: "top", offset: 8, flip: true }}
      shouldShow={({ editor: e, state: s, from, to }) =>
        from !== to && e.isEditable && !(s.selection instanceof NodeSelection) && !e.isActive("codeBlock")
      }
    >
      {panel === "link" ? (
        <form className="bubble-row" onSubmit={submitLink}>
          <input
            type="url"
            dir="ltr"
            autoFocus
            placeholder="https://"
            aria-label={t("editor.link")}
            value={href}
            onChange={(event) => setHref(event.target.value)}
          />
          <button type="submit" className="primary small">
            {t("common.save")}
          </button>
          {state.link && (
            <button
              type="button"
              className="ghost small"
              onClick={() => {
                chain().extendMarkRange("link").unsetLink().run();
                setPanel("none");
              }}
            >
              {t("editor.removeLink")}
            </button>
          )}
        </form>
      ) : panel === "ai" ? (
        <div className="bubble-ai" role="menu" aria-label={t("ai.title")}>
          {AI_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setPanel("none");
                onAi(action);
              }}
            >
              {t(ACTION_LABELS[action])}
            </button>
          ))}
          <p className="menu-heading">{t("ai.action.translate")}</p>
          <div className="bubble-languages">
            {QUICK_LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                className="mini-chip"
                onClick={() => {
                  setPanel("none");
                  onAi("translate", code);
                }}
              >
                {translationLanguage(code).native}
              </button>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setPanel("none");
              onAi("custom");
            }}
          >
            {t("ai.action.custom")}
          </button>
        </div>
      ) : (
        <div className="bubble-row" role="toolbar" aria-label={t("editor.formatting")}>
          <button
            type="button"
            className="bubble-ai-button"
            onClick={() => setPanel("ai")}
            title={t("ai.title")}
          >
            <SparkleIcon /> {t("ai.short")}
          </button>
          <span className="toolbar-separator" aria-hidden="true" />
          <select
            className="bubble-select"
            aria-label={t("editor.blockType")}
            value={state.block}
            onChange={(event) => setBlock(event.target.value)}
          >
            <option value="p">{t("editor.block.text")}</option>
            <option value="h1">{t("editor.block.heading", { level: 1 })}</option>
            <option value="h2">{t("editor.block.heading", { level: 2 })}</option>
            <option value="h3">{t("editor.block.heading", { level: 3 })}</option>
          </select>
          <span className="toolbar-separator" aria-hidden="true" />
          {marks.map(({ key, icon: MarkIcon, active, run }) => (
            <button
              key={key}
              type="button"
              className="icon-button small"
              aria-pressed={active}
              aria-label={t(`editor.mark.${key}`)}
              title={t(`editor.mark.${key}`)}
              onClick={run}
            >
              <MarkIcon />
            </button>
          ))}
          <button
            type="button"
            className="icon-button small"
            aria-pressed={state.link}
            aria-label={t("editor.link")}
            title={t("editor.link")}
            onClick={() => {
              setHref(String(editor.getAttributes("link").href ?? ""));
              setPanel("link");
            }}
          >
            <LinkIcon />
          </button>
          <span className="toolbar-separator" aria-hidden="true" />
          {alignments.map(({ value, icon: AlignIcon }) => (
            <button
              key={value}
              type="button"
              className="icon-button small"
              aria-pressed={state.align === value}
              aria-label={t(`editor.align.${value}`)}
              title={t(`editor.align.${value}`)}
              onClick={() => chain().setTextAlign(value).run()}
            >
              <AlignIcon />
            </button>
          ))}
        </div>
      )}
    </BubbleMenu>
  );
}

export function TableToolbar({ editor }: { editor: Editor }) {
  const { t } = useI18n();
  const chain = () => editor.chain().focus();
  const actions = [
    { key: "rowAbove", run: () => chain().addRowBefore().run() },
    { key: "rowBelow", run: () => chain().addRowAfter().run() },
    { key: "colBefore", run: () => chain().addColumnBefore().run() },
    { key: "colAfter", run: () => chain().addColumnAfter().run() },
    { key: "deleteRow", run: () => chain().deleteRow().run() },
    { key: "deleteCol", run: () => chain().deleteColumn().run() },
    { key: "header", run: () => chain().toggleHeaderRow().run() },
  ] as const;

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="table-toolbar"
      className="bubble"
      options={{ placement: "top", offset: 8, flip: true }}
      shouldShow={({ editor: e, state: s }) => e.isEditable && s.selection.empty && e.isActive("table")}
    >
      <div className="bubble-row" role="toolbar" aria-label={t("editor.table.label")}>
        {actions.map(({ key, run }) => (
          <button key={key} type="button" className="ghost small" onClick={run}>
            {t(`editor.table.${key}`)}
          </button>
        ))}
        <button
          type="button"
          className="icon-button small danger"
          aria-label={t("editor.table.delete")}
          title={t("editor.table.delete")}
          onClick={() => chain().deleteTable().run()}
        >
          <TrashIcon />
        </button>
      </div>
    </BubbleMenu>
  );
}
