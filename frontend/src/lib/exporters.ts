/**
 * Export a page: editor JSON -> Markdown, a standalone HTML file, or print (PDF).
 * Import: Markdown / HTML / plain text files -> editor content.
 */
import type { JSONContent } from "@tiptap/react";

import { markdownToContent, plainTextToDoc } from "./markdown";

function inline(nodes: JSONContent[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "  \n";
      let text = node.text ?? "";
      if (!text) return "";
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") text = `**${text}**`;
        else if (mark.type === "italic") text = `*${text}*`;
        else if (mark.type === "strike") text = `~~${text}~~`;
        else if (mark.type === "code") text = `\`${text}\``;
        else if (mark.type === "link") text = `[${text}](${String(mark.attrs?.href ?? "")})`;
      }
      return text;
    })
    .join("");
}

function block(node: JSONContent, depth = 0): string {
  const indent = "  ".repeat(depth);
  const children = (list: JSONContent[] | undefined) =>
    (list ?? []).map((child) => block(child, depth)).join("\n\n");
  switch (node.type) {
    case "paragraph":
      return inline(node.content);
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level ?? 1))} ${inline(node.content)}`;
    case "blockquote":
      return children(node.content)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "codeBlock":
      return `\`\`\`${String(node.attrs?.language ?? "")}\n${inline(node.content)}\n\`\`\``;
    case "horizontalRule":
      return "---";
    case "bulletList":
    case "orderedList":
    case "taskList":
      return (node.content ?? [])
        .map((item, index) => {
          const marker =
            node.type === "orderedList"
              ? `${index + 1}.`
              : node.type === "taskList"
                ? `- [${item.attrs?.checked ? "x" : " "}]`
                : "-";
          const [first, ...rest] = item.content ?? [];
          const head = `${indent}${marker} ${first ? block(first, depth + 1) : ""}`;
          const tail = rest.map((child) => block(child, depth + 1)).join("\n");
          return tail ? `${head}\n${tail}` : head;
        })
        .join("\n");
    case "table": {
      const rows = (node.content ?? []).map((row) =>
        (row.content ?? []).map((cell) => children(cell.content).replace(/\n+/g, " ").replace(/\|/g, "\\|")),
      );
      if (!rows.length) return "";
      const header = `| ${rows[0].join(" | ")} |`;
      const separator = `| ${rows[0].map(() => "---").join(" | ")} |`;
      return [header, separator, ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`)].join("\n");
    }
    case "media":
      return node.attrs?.kind === "video"
        ? `[video](${String(node.attrs?.src ?? "")})`
        : `![${String(node.attrs?.alt ?? "")}](${String(node.attrs?.src ?? "")})`;
    case "embed":
    case "bookmark":
      return `<${String(node.attrs?.url ?? "")}>`;
    case "audio":
      return `[${String(node.attrs?.title || "audio")}](${String(node.attrs?.src ?? "")})`;
    case "fileBlock":
      return `[${String(node.attrs?.name ?? "file")}](${String(node.attrs?.url ?? "")})`;
    case "pageLink":
      return `[${String(node.attrs?.title ?? "")}](${String(node.attrs?.url ?? "")})`;
    case "callout":
      return children(node.content)
        .split("\n")
        .map((line, i) => (i === 0 ? `> ${String(node.attrs?.emoji ?? "💡")} ${line}` : `> ${line}`))
        .join("\n");
    case "toggle":
      return children(node.content);
    case "toc":
      return "";
    default:
      return children(node.content);
  }
}

export function docToMarkdown(doc: JSONContent | null | undefined, title = ""): string {
  const body = (doc?.content ?? [])
    .map((node) => block(node))
    .filter((text) => text !== "")
    .join("\n\n");
  return title ? `# ${title}\n\n${body}\n` : `${body}\n`;
}

export function standaloneHtml(title: string, bodyHtml: string, dir: "ltr" | "rtl"): string {
  const safeTitle = title.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c);
  return `<!doctype html>
<html lang="${dir === "rtl" ? "fa" : "en"}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
  body { font-family: Vazirmatn, "Segoe UI", system-ui, sans-serif; max-width: 760px; margin: 2.5rem auto; padding: 0 1rem; line-height: 1.8; color: #1f2328; }
  img, video, iframe { max-width: 100%; border-radius: 8px; }
  pre { background: #f6f8fa; padding: 1rem; border-radius: 8px; overflow: auto; direction: ltr; }
  code { background: #f6f8fa; padding: .1em .3em; border-radius: 4px; }
  blockquote, aside { border-inline-start: 3px solid #e8743b; margin: 0; padding-inline-start: 1rem; color: #57606a; }
  table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #d0d7de; padding: .4rem .6rem; }
  h1 { font-size: 2.1rem; line-height: 1.3; }
</style>
</head>
<body>
<h1>${safeTitle}</h1>
${bodyHtml}
</body>
</html>`;
}

export function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(title: string, fallback: string): string {
  return (title.trim() || fallback).replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
}

/**
 * Prints the page (the browser offers "Save as PDF"). The HTML is loaded into a hidden
 * iframe that may not run scripts.
 */
export function printHtml(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.style.cssText = "position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;";
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
  document.body.appendChild(frame);
}

/** Reads an imported file into editor content (Markdown, HTML or plain text). */
export async function readImport(file: File): Promise<{ content: JSONContent[] | string; title: string }> {
  const text = await file.text();
  const name = file.name.replace(/\.[^.]+$/, "");
  if (/\.html?$/i.test(file.name)) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    doc.querySelectorAll("script,style,iframe,object,embed").forEach((el) => el.remove());
    return { content: doc.body.innerHTML, title: doc.title || name };
  }
  if (/\.(md|markdown)$/i.test(file.name)) {
    const heading = /^#\s+(.+)$/m.exec(text)?.[1]?.trim();
    return { content: markdownToContent(text), title: heading || name };
  }
  return { content: plainTextToDoc(text).content ?? [], title: name };
}
