/**
 * Per-block text direction.
 *
 * Every paragraph, heading, quote and list gets dir="rtl" or dir="ltr" from its first
 * strong letter (Persian/Arabic -> rtl, Latin etc. -> ltr). Blocks without letters (an empty
 * line, numbers only) get no attribute, so they follow the page: right-aligned in the
 * Persian UI, left-aligned in English. (dir="auto" would make empty lines LTR.)
 *
 * Only blocks touched by a change are recomputed, so typing stays fast in huge notes.
 */
import { combineTransactionSteps, Extension, getChangedRanges } from "@tiptap/core";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";

const TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "taskList",
  "listItem",
  "taskItem",
];

const span = (from: number, to: number) => `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`;

// Hebrew, Arabic, Syriac, Thaana, NKo ... and Arabic presentation forms.
const RTL = new RegExp(`[${span(0x0590, 0x08ff)}${span(0xfb1d, 0xfdff)}${span(0xfe70, 0xfefc)}]`);
// Latin (with accents), Greek, Cyrillic, Armenian, CJK etc.: anything else that is a letter.
const LETTER = /\p{L}/u;
const DIGIT = /\p{N}/u;

export type Direction = "rtl" | "ltr";

export function directionOf(text: string): Direction | null {
  for (const char of text) {
    if (DIGIT.test(char)) continue; // Persian/Arabic digits are neutral, like 0-9
    if (RTL.test(char)) return "rtl";
    if (LETTER.test(char)) return "ltr";
  }
  return null;
}

function nodeDirection(node: ProseNode): Direction | null {
  let found: Direction | null = null;
  node.descendants((child) => {
    if (found) return false;
    if (child.isText && child.text) found = directionOf(child.text);
    return !found;
  });
  return found;
}

function fix(tr: Transaction, doc: ProseNode, from: number, to: number): void {
  doc.nodesBetween(from, to, (node, pos) => {
    if (!TYPES.includes(node.type.name)) return true;
    const wanted = nodeDirection(node);
    if ((node.attrs.dir ?? null) !== wanted) tr.setNodeAttribute(pos, "dir", wanted);
    return true;
  });
}

const key = new PluginKey("blockDirection");

export const BlockDirection = Extension.create({
  name: "blockDirection",

  addGlobalAttributes() {
    return [
      {
        types: TYPES,
        attributes: {
          dir: {
            default: null,
            parseHTML: (element) => {
              const value = element.getAttribute("dir");
              return value === "rtl" || value === "ltr" ? value : null;
            },
            renderHTML: (attributes) => (attributes.dir ? { dir: attributes.dir } : {}),
          },
        },
      },
    ];
  },

  onCreate() {
    // Documents saved before this extension existed: compute everything once, silently.
    const { state, view } = this.editor;
    const tr = state.tr;
    fix(tr, state.doc, 0, state.doc.content.size);
    if (tr.docChanged) {
      tr.setMeta("addToHistory", false).setMeta("preventUpdate", true);
      view.dispatch(tr);
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        appendTransaction(transactions: readonly Transaction[], oldState: EditorState, state) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const tr = state.tr;
          const transform = combineTransactionSteps(oldState.doc, [...transactions]);
          for (const { newRange } of getChangedRanges(transform)) {
            const from = Math.max(0, newRange.from - 1);
            const to = Math.min(state.doc.content.size, newRange.to + 1);
            fix(tr, state.doc, from, to);
          }
          return tr.docChanged ? tr.setMeta("addToHistory", false) : null;
        },
      }),
    ];
  },
});
