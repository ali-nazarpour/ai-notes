/**
 * Extra editor blocks (Notion-like):
 *
 * - embed      YouTube / Aparat / Vimeo / Spotify / SoundCloud / ... (see lib/embeds.ts)
 * - audio      an uploaded or linked audio file with a player
 * - bookmark   a link card with title, description and image (fetched by the server)
 * - fileBlock  an uploaded document to download
 * - callout    a highlighted box with an emoji
 * - toggle     a collapsible block: the first line is the summary
 * - toc        a live table of contents of the page's headings
 * - pageLink   a link to another note, documentation page, post, project or board
 */
import { mergeAttributes, Node, type JSONContent } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { linkApi } from "../../api/v4";
import {
  BookmarkIcon,
  ChevronRightIcon,
  DownloadIcon,
  ExpandIcon,
  FileIcon,
  MusicIcon,
  PageLinkIcon,
  TocIcon,
  TrashIcon,
} from "../../components/Icons";
import { useI18n } from "../../i18n";
import { formatBytes, toEmbed } from "../../lib/embeds";
import { isSafeMediaUrl } from "./Media";

const isHttp = (value: unknown): value is string => typeof value === "string" && /^https?:\/\//.test(value);

function BlockTools({ onDelete, href }: { onDelete: () => void; href?: string }) {
  const { t } = useI18n();
  return (
    <div className="block-tools" contentEditable={false}>
      {href && (
        <a
          className="icon-button small"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={t("editor.openLink")}
        >
          <ExpandIcon />
        </a>
      )}
      <button
        type="button"
        className="icon-button small danger"
        onClick={onDelete}
        title={t("common.delete")}
      >
        <TrashIcon />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- embed

function EmbedView({ node, deleteNode, editor, selected }: ReactNodeViewProps) {
  const { t } = useI18n();
  const url = String(node.attrs.url ?? "");
  // The iframe address is rebuilt from the original link, never taken from stored HTML.
  const embed = toEmbed(url);
  if (!embed) {
    return (
      <NodeViewWrapper className="embed embed-broken" contentEditable={false}>
        {t("editor.embedUnsupported")}
      </NodeViewWrapper>
    );
  }
  const style = embed.aspect ? { aspectRatio: String(embed.aspect) } : { height: `${embed.height}px` };
  return (
    <NodeViewWrapper className={`embed embed-${embed.kind}`} data-selected={selected} contentEditable={false}>
      <div className="embed-frame" style={style}>
        <iframe
          src={embed.src}
          title={`${embed.provider}: ${url}`}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
        />
      </div>
      <div className="embed-caption">
        <span className="embed-provider">{embed.provider}</span>
        <a href={url} target="_blank" rel="noopener noreferrer" dir="ltr">
          {url}
        </a>
      </div>
      {editor.isEditable && <BlockTools onDelete={deleteNode} href={url} />}
    </NodeViewWrapper>
  );
}

export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { url: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-embed]", getAttrs: (el) => ({ url: el.getAttribute("data-url") ?? "" }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-embed": "", "data-url": node.attrs.url }),
      node.attrs.url,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(EmbedView);
  },
});

// ---------------------------------------------------------------- audio

function AudioView({ node, deleteNode, editor, updateAttributes }: ReactNodeViewProps) {
  const { t } = useI18n();
  const src = String(node.attrs.src ?? "");
  const title = String(node.attrs.title ?? "");
  if (!isSafeMediaUrl(src)) {
    return (
      <NodeViewWrapper className="audio-block embed-broken">{t("editor.embedUnsupported")}</NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper className="audio-block" contentEditable={false}>
      <span className="audio-icon">
        <MusicIcon />
      </span>
      <div className="audio-body">
        {editor.isEditable ? (
          <input
            className="audio-title"
            value={title}
            placeholder={t("editor.audioTitle")}
            onChange={(event) => updateAttributes({ title: event.target.value })}
          />
        ) : (
          <strong className="audio-title">{title || t("editor.block.audio")}</strong>
        )}
        <audio src={src} controls preload="metadata" />
      </div>
      {editor.isEditable && <BlockTools onDelete={deleteNode} />}
    </NodeViewWrapper>
  );
}

export const Audio = Node.create({
  name: "audio",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: "" }, title: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-audio]",
        getAttrs: (el) => ({ src: el.getAttribute("data-src"), title: el.textContent }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-audio": "", "data-src": node.attrs.src }),
      node.attrs.title || "",
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AudioView);
  },
});

// ---------------------------------------------------------------- bookmark

function BookmarkView({ node, updateAttributes, deleteNode, editor }: ReactNodeViewProps) {
  const { t } = useI18n();
  const { url, title, description, image, site } = node.attrs as Record<string, string | null>;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isHttp(url) || title || failed) return;
    let cancelled = false;
    linkApi.preview(url).then(
      (preview) => {
        if (cancelled) return;
        updateAttributes({
          title: preview.title || preview.site_name || url,
          description: preview.description,
          image: preview.image?.startsWith("https://") ? preview.image : null,
          site: preview.site_name,
        });
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [url, title, failed, updateAttributes]);

  if (!isHttp(url)) return <NodeViewWrapper className="bookmark embed-broken" />;
  return (
    <NodeViewWrapper className="bookmark" contentEditable={false}>
      <a href={url} target="_blank" rel="noopener noreferrer" className="bookmark-card">
        <span className="bookmark-text">
          <strong>{title || (failed ? url : t("common.loading"))}</strong>
          {description && <span className="bookmark-description">{description}</span>}
          <span className="bookmark-url" dir="ltr">
            <BookmarkIcon /> {site || new URL(url).hostname}
          </span>
        </span>
        {image && <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      </a>
      {editor.isEditable && <BlockTools onDelete={deleteNode} />}
    </NodeViewWrapper>
  );
}

export const Bookmark = Node.create({
  name: "bookmark",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      url: { default: "" },
      title: { default: "" },
      description: { default: "" },
      image: { default: null },
      site: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-bookmark]", getAttrs: (el) => ({ url: el.getAttribute("href") }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, { "data-bookmark": "", href: node.attrs.url }),
      node.attrs.title || node.attrs.url,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(BookmarkView);
  },
});

// ---------------------------------------------------------------- file

function FileView({ node, deleteNode, editor }: ReactNodeViewProps) {
  const { calendar } = useI18n();
  const { url, name, size } = node.attrs as { url: string; name: string; size: number };
  if (!isSafeMediaUrl(url)) return <NodeViewWrapper className="file-block embed-broken" />;
  return (
    <NodeViewWrapper className="file-block" contentEditable={false}>
      <a href={url} className="file-card" download={name}>
        <span className="file-icon">
          <FileIcon />
        </span>
        <span className="file-text">
          <strong dir="auto">{name}</strong>
          <span className="muted small">{formatBytes(size || 0, calendar.formatNumber)}</span>
        </span>
        <DownloadIcon />
      </a>
      {editor.isEditable && <BlockTools onDelete={deleteNode} />}
    </NodeViewWrapper>
  );
}

export const FileBlock = Node.create({
  name: "fileBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { url: { default: "" }, name: { default: "" }, size: { default: 0 } };
  },
  parseHTML() {
    return [
      { tag: "a[data-file]", getAttrs: (el) => ({ url: el.getAttribute("href"), name: el.textContent }) },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["a", mergeAttributes(HTMLAttributes, { "data-file": "", href: node.attrs.url }), node.attrs.name];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FileView);
  },
});

// ---------------------------------------------------------------- callout

const CALLOUT_EMOJIS = ["💡", "⚠️", "✅", "❗", "📌", "ℹ️", "🔥", "📝"];
const CALLOUT_COLORS = ["gray", "blue", "green", "amber", "red", "violet"];

function CalloutView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const { t } = useI18n();
  const emoji = String(node.attrs.emoji || "💡");
  const color = String(node.attrs.color || "amber");
  const next = <T,>(list: T[], value: T) => list[(list.indexOf(value) + 1) % list.length];
  return (
    <NodeViewWrapper className="callout" data-color={color}>
      <button
        type="button"
        className="callout-emoji"
        contentEditable={false}
        disabled={!editor.isEditable}
        title={t("editor.calloutIcon")}
        onClick={() => updateAttributes({ emoji: next(CALLOUT_EMOJIS, emoji) })}
      >
        {emoji}
      </button>
      <NodeViewContent className="callout-content" />
      {editor.isEditable && (
        <button
          type="button"
          className="callout-color"
          contentEditable={false}
          title={t("editor.calloutColor")}
          onClick={() => updateAttributes({ color: next(CALLOUT_COLORS, color) })}
        />
      )}
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { emoji: { default: "💡" }, color: { default: "amber" } };
  },
  parseHTML() {
    return [{ tag: "aside[data-callout]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(HTMLAttributes, {
        "data-callout": "",
        "data-emoji": node.attrs.emoji,
        "data-color": node.attrs.color,
      }),
      0,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});

// ---------------------------------------------------------------- toggle

function ToggleView({ node, updateAttributes }: ReactNodeViewProps) {
  const { t } = useI18n();
  const open = Boolean(node.attrs.open);
  return (
    <NodeViewWrapper className="toggle-block" data-open={open}>
      <button
        type="button"
        className="toggle-button"
        contentEditable={false}
        aria-expanded={open}
        aria-label={open ? t("editor.collapse") : t("editor.expand")}
        onClick={() => updateAttributes({ open: !open })}
      >
        <ChevronRightIcon />
      </button>
      <NodeViewContent className="toggle-content" />
    </NodeViewWrapper>
  );
}

export const Toggle = Node.create({
  name: "toggle",
  group: "block",
  // The first paragraph is the always-visible summary; the rest is hidden when closed.
  content: "paragraph block*",
  defining: true,
  addAttributes() {
    return { open: { default: true } };
  },
  parseHTML() {
    return [{ tag: "div[data-toggle]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-toggle": "", "data-open": String(node.attrs.open) }),
      0,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ToggleView);
  },
});

// ---------------------------------------------------------------- table of contents

export interface Heading {
  level: number;
  text: string;
  index: number;
}

export function headingsOf(doc: JSONContent | null | undefined): Heading[] {
  const result: Heading[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === "heading") {
      const text = (node.content ?? [])
        .map((child) => child.text ?? "")
        .join("")
        .trim();
      result.push({ level: Number(node.attrs?.level ?? 1), text, index: result.length });
    }
    node.content?.forEach(walk);
  };
  if (doc) walk(doc);
  return result;
}

/** Scrolls to the n-th heading inside the closest editor. */
export function scrollToHeading(root: Element | null, index: number): void {
  const target = root?.querySelectorAll(".prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6")[
    index
  ];
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function TocView({ editor, deleteNode }: ReactNodeViewProps) {
  const { t } = useI18n();
  const [headings, setHeadings] = useState<Heading[]>(() => headingsOf(editor.getJSON()));
  useEffect(() => {
    const update = () => setHeadings(headingsOf(editor.getJSON()));
    editor.on("update", update);
    return () => {
      editor.off("update", update);
    };
  }, [editor]);
  const min = Math.min(...headings.map((h) => h.level), 6);
  return (
    <NodeViewWrapper className="toc-block" contentEditable={false}>
      <p className="toc-title">
        <TocIcon /> {t("editor.block.toc")}
      </p>
      {headings.length ? (
        <ol>
          {headings.map((heading) => (
            <li key={heading.index} style={{ paddingInlineStart: `${(heading.level - min) * 1.1}rem` }}>
              <button
                type="button"
                className="link-button"
                onClick={(event) =>
                  scrollToHeading(event.currentTarget.closest(".editor-shell"), heading.index)
                }
              >
                {heading.text || t("editor.untitledHeading")}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted small">{t("editor.tocEmpty")}</p>
      )}
      {editor.isEditable && <BlockTools onDelete={deleteNode} />}
    </NodeViewWrapper>
  );
}

export const TableOfContents = Node.create({
  name: "toc",
  group: "block",
  atom: true,
  draggable: true,
  parseHTML() {
    return [{ tag: "nav[data-toc]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["nav", mergeAttributes(HTMLAttributes, { "data-toc": "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TocView);
  },
});

// ---------------------------------------------------------------- page link

const PAGE_URL = /^\/(notes|docs|blog|projects|boards)\/[\d/]+$/;

function PageLinkView({ node, deleteNode, editor }: ReactNodeViewProps) {
  const { url, title, icon } = node.attrs as { url: string; title: string; icon: string };
  if (!PAGE_URL.test(url)) return <NodeViewWrapper className="page-link embed-broken" />;
  return (
    <NodeViewWrapper className="page-link" contentEditable={false}>
      <Link to={url} className="page-link-card">
        <span className="page-link-icon">{icon || <PageLinkIcon />}</span>
        <span dir="auto">{title}</span>
      </Link>
      {editor.isEditable && <BlockTools onDelete={deleteNode} />}
    </NodeViewWrapper>
  );
}

export const PageLink = Node.create({
  name: "pageLink",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { url: { default: "" }, title: { default: "" }, icon: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: "a[data-page-link]",
        getAttrs: (el) => ({ url: el.getAttribute("href"), title: el.textContent }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, { "data-page-link": "", href: node.attrs.url }),
      node.attrs.title,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PageLinkView);
  },
});

export const EXTRA_BLOCKS = [Embed, Audio, Bookmark, FileBlock, Callout, Toggle, TableOfContents, PageLink];
