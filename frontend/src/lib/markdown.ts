/**
 * Converts the Markdown that the AI returns into editor (TipTap/ProseMirror) content,
 * so AI text arrives with real headings, lists, tables and formatting.
 *
 * Supported: headings, paragraphs, bullet/numbered/task lists, quotes, fenced code,
 * horizontal rules, tables, and inline **bold**, *italic*, ~~strike~~, `code`, [links](https://…).
 * Nested lists are flattened.
 */
import type { JSONContent } from "@tiptap/react";

type Mark = NonNullable<JSONContent["marks"]>[number];

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\s][^*\n]*\*)|(_[^_\s][^_\n]*_)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;

function text(value: string, marks?: Mark[]): JSONContent | null {
  if (!value) return null;
  return marks?.length ? { type: "text", text: value, marks } : { type: "text", text: value };
}

export function parseInline(source: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  let last = 0;
  for (const match of source.matchAll(INLINE)) {
    const index = match.index ?? 0;
    const plain = text(source.slice(last, index));
    if (plain) nodes.push(plain);
    const token = match[0];
    let node: JSONContent | null;
    if (match[1]) node = text(token.slice(1, -1), [{ type: "code" }]);
    else if (match[2] || match[3]) node = text(token.slice(2, -2), [{ type: "bold" }]);
    else if (match[4]) node = text(token.slice(2, -2), [{ type: "strike" }]);
    else if (match[5] || match[6]) node = text(token.slice(1, -1), [{ type: "italic" }]);
    else {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token) ?? [];
      node = text(label, [{ type: "link", attrs: { href } }]);
    }
    if (node) nodes.push(node);
    last = index + token.length;
  }
  const rest = text(source.slice(last));
  if (rest) nodes.push(rest);
  return nodes;
}

function paragraph(source: string): JSONContent {
  const content = parseInline(source.trim());
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})\s*$/;
const TASK = /^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function markdownToContent(markdown: string): JSONContent[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: JSONContent[] = [];
  let i = 0;

  const collect = (pattern: RegExp) => {
    const items: RegExpExecArray[] = [];
    while (i < lines.length) {
      const match = pattern.exec(lines[i]);
      if (!match) break;
      items.push(match);
      i += 1;
    }
    return items;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = /^```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[(i += 1) - 1]);
      i += 1;
      const value = code.join("\n");
      blocks.push({
        type: "codeBlock",
        attrs: { language: fence[1] || null },
        ...(value ? { content: [{ type: "text", text: value }] } : {}),
      });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const content = parseInline(heading[2].trim());
      blocks.push({
        type: "heading",
        attrs: { level: heading[1].length },
        ...(content.length ? { content } : {}),
      });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: "horizontalRule" });
      i += 1;
      continue;
    }

    if (line.trim().startsWith("|") && TABLE_SEPARATOR.test(lines[i + 1] ?? "")) {
      const header = tableCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(tableCells(lines[(i += 1) - 1]));
      const row = (cells: string[], type: string): JSONContent => ({
        type: "tableRow",
        content: header.map((_, index) => ({
          type,
          content: [paragraph(cells[index] ?? "")],
        })),
      });
      blocks.push({
        type: "table",
        content: [row(header, "tableHeader"), ...rows.map((cells) => row(cells, "tableCell"))],
      });
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      const quoted: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        quoted.push(lines[i].trimStart().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "blockquote", content: markdownToContent(quoted.join("\n")) });
      continue;
    }

    if (TASK.test(line)) {
      blocks.push({
        type: "taskList",
        content: collect(TASK).map((m) => ({
          type: "taskItem",
          attrs: { checked: m[1].toLowerCase() === "x" },
          content: [paragraph(m[2])],
        })),
      });
      continue;
    }

    if (BULLET.test(line)) {
      blocks.push({
        type: "bulletList",
        content: collect(BULLET).map((m) => ({ type: "listItem", content: [paragraph(m[1])] })),
      });
      continue;
    }

    if (ORDERED.test(line)) {
      blocks.push({
        type: "orderedList",
        content: collect(ORDERED).map((m) => ({ type: "listItem", content: [paragraph(m[1])] })),
      });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      ![HEADING, RULE, BULLET, ORDERED, TASK].some((pattern) => pattern.test(lines[i])) &&
      !lines[i].startsWith("```") &&
      !lines[i].trimStart().startsWith(">")
    ) {
      paragraphLines.push(lines[i].trim());
      i += 1;
    }
    const content: JSONContent[] = [];
    paragraphLines.forEach((part, index) => {
      if (index > 0) content.push({ type: "hardBreak" });
      content.push(...parseInline(part));
    });
    blocks.push(content.length ? { type: "paragraph", content } : { type: "paragraph" });
  }
  return blocks;
}

/** Plain text (one paragraph per line block) to editor content; used for old notes. */
export function plainTextToDoc(value: string): JSONContent {
  const paragraphs = value.split(/\n\s*\n/).map((block) => {
    const content: JSONContent[] = [];
    block.split("\n").forEach((line, index) => {
      if (index > 0) content.push({ type: "hardBreak" });
      if (line) content.push({ type: "text", text: line });
    });
    return content.length ? { type: "paragraph", content } : { type: "paragraph" };
  });
  return { type: "doc", content: paragraphs.length ? paragraphs : [{ type: "paragraph" }] };
}
