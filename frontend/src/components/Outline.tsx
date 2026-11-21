/** A floating table of contents for a page, following the editor's headings live. */
import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";

import { headingsOf, scrollToHeading, type Heading } from "../features/editor/Blocks";
import { useI18n } from "../i18n";
import { TocIcon } from "./Icons";

export function Outline({ editor, className = "" }: { editor: Editor | null; className?: string }) {
  const { t } = useI18n();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const update = () => setHeadings(headingsOf(editor.getJSON()));
    update();
    editor.on("update", update);
    return () => {
      editor.off("update", update);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || !headings.length) return;
    const root = editor.view.dom;
    const onScroll = () => {
      const nodes = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6"));
      let current = 0;
      nodes.forEach((node, index) => {
        if (node.getBoundingClientRect().top < 140) current = index;
      });
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", onScroll, { capture: true });
  }, [editor, headings]);

  if (!headings.length) return null;
  const min = Math.min(...headings.map((h) => h.level));
  return (
    <nav className={`outline ${className}`} aria-label={t("page.toc")}>
      <p className="outline-title">
        <TocIcon /> {t("page.onThisPage")}
      </p>
      <ol>
        {headings.map((heading) => (
          <li key={heading.index} style={{ paddingInlineStart: `${(heading.level - min) * 0.8}rem` }}>
            <button
              type="button"
              className={heading.index === active ? "active" : ""}
              onClick={() =>
                scrollToHeading(editor?.view.dom.closest(".editor-shell") ?? null, heading.index)
              }
            >
              {heading.text || t("editor.untitledHeading")}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
