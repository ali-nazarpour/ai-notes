/**
 * Renders an assistant answer: paragraphs, bullet/numbered lists, **bold**, `code`, and
 * citations like [note:12] turned into links to the cited note. Plain React elements
 * only (no HTML injection), so model output can never run scripts.
 */
import type { ReactNode } from "react";
import { Link } from "react-router";

import type { ChatSource } from "../../types";

/** Some sources have a fixed English title on the server; show them in the UI language. */
let labels: Partial<Record<string, string>> = {};
export function setSourceLabels(next: Partial<Record<string, string>>): void {
  labels = next;
}
export function sourceLabel(source: ChatSource): string {
  return (source.kind && labels[source.kind]) || source.title;
}

const INLINE = /(\[note:\s*\d+\s*\])|(\*\*[^*]+\*\*)|(`[^`]+`)/g;

function inline(text: string, sources: ChatSource[], key: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const token = match[0];
    const id = `${key}-${index++}`;
    if (match[1]) {
      const noteId = Number(/\d+/.exec(token)?.[0]);
      const source = sources.find((s) => s.id === noteId);
      parts.push(
        source ? (
          <Link
            key={id}
            to={source.url ?? `/notes/${noteId}`}
            className="citation"
            title={source.title}
            dir="auto"
          >
            {sourceLabel(source) || `#${noteId}`}
          </Link>
        ) : null,
      );
    } else if (match[2]) {
      parts.push(<strong key={id}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<code key={id}>{token.slice(1, -1)}</code>);
    }
    last = start + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Answer({ text, sources }: { text: string; sources: ChatSource[] }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="answer" dir="auto">
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").filter((line) => line.trim());
        const bullets = lines.every((line) => /^\s*[-*•]\s+/.test(line));
        const numbered = lines.every((line) => /^\s*\d+[.)]\s+/.test(line));
        const key = `b${blockIndex}`;
        if (lines.length && (bullets || numbered)) {
          const items = lines.map((line, i) => (
            <li key={i}>{inline(line.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), sources, `${key}-${i}`)}</li>
          ));
          return numbered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
        }
        return (
          <p key={key}>
            {lines.map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {inline(line.replace(/^#+\s*/, ""), sources, `${key}-${i}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
