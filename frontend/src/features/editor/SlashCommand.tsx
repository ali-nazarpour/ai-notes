/**
 * The "/" menu. Typing "/" opens a list of blocks; typing more filters it (in English or
 * the UI language); arrows + Enter or a click inserts the block.
 */
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionOptions, type SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import type { IconComponent } from "../../components/Icons";
import { useI18n } from "../../i18n";

export interface SlashItem {
  id: string;
  group: "basic" | "media" | "embeds" | "ai";
  title: string;
  description: string;
  keywords: string[];
  /** Markdown shortcut shown on the right, e.g. "##". */
  shortcut?: string;
  icon: IconComponent;
  run: (editor: Editor, range: Range) => void;
}

export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) => item.title.toLowerCase().includes(q) || item.keywords.some((word) => word.includes(q)),
  );
}

interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const GROUP_ORDER: SlashItem["group"][] = ["basic", "media", "embeds", "ai"];

const SlashMenu = forwardRef<SlashMenuHandle, SuggestionProps<SlashItem, SlashItem>>(function SlashMenu(
  { items, command },
  ref,
) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelected(0), [items]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (!items.length) return false;
      if (event.key === "ArrowDown") {
        setSelected((index) => (index + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((index) => (index - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        command(items[selected]);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) {
    return <div className="slash-menu slash-empty">{t("editor.slash.noResults")}</div>;
  }

  let index = -1;
  return (
    <div className="slash-panel">
      <div className="slash-menu" ref={listRef} role="listbox" aria-label={t("editor.slash.label")}>
        {GROUP_ORDER.map((group) => {
          const groupItems = items.filter((item) => item.group === group);
          if (!groupItems.length) return null;
          return (
            <div key={group} className="slash-group">
              <p className="slash-heading">{t(`editor.slash.group.${group}`)}</p>
              {groupItems.map((item) => {
                index += 1;
                const itemIndex = index;
                const ItemIcon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={itemIndex === selected}
                    data-index={itemIndex}
                    className="slash-item"
                    onMouseEnter={() => setSelected(itemIndex)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => command(item)}
                  >
                    <span className="slash-icon">
                      <ItemIcon />
                    </span>
                    <span className="slash-text">
                      <span className="slash-title">{item.title}</span>
                      <span className="slash-description">{item.description}</span>
                    </span>
                    {item.shortcut && (
                      <kbd className="slash-shortcut" dir="ltr">
                        {item.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="slash-footer">
        <span>{t("editor.slash.close")}</span>
        <kbd>esc</kbd>
      </div>
    </div>
  );
});

export interface SlashCommandOptions {
  suggestion: Omit<SuggestionOptions<SlashItem, SlashItem>, "editor">;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        allowSpaces: false,
        command: ({ editor, range, props }) => props.run(editor, range),
        allow: ({ state, range }) => state.doc.resolve(range.from).parent.type.name !== "codeBlock",
        render: () => {
          let renderer: ReactRenderer<SlashMenuHandle, SuggestionProps<SlashItem, SlashItem>> | null = null;
          let unmount: (() => void) | null = null;
          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashMenu, {
                props,
                editor: props.editor,
                className: "slash-popover",
              });
              unmount = props.mount(renderer.element as HTMLElement);
            },
            onUpdate: (props) => renderer?.updateProps(props),
            onKeyDown: ({ event }) => {
              if (event.key === "Escape") {
                unmount?.();
                renderer?.destroy();
                renderer = null;
                return true;
              }
              return renderer?.ref?.onKeyDown(event) ?? false;
            },
            onExit: () => {
              unmount?.();
              renderer?.destroy();
              renderer = null;
            },
          };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...this.options.suggestion })];
  },
});
