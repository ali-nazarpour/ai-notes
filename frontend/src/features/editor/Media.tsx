/**
 * Image and video blocks. Each block stores its source, alignment (left/center/right)
 * and width (percent of the text column). While editing, a small toolbar appears on
 * hover/selection to change alignment and size or to remove the block.
 */
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import type { CSSProperties } from "react";

import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  type IconComponent,
  TrashIcon,
} from "../../components/Icons";
import { useI18n } from "../../i18n";

export type MediaAlign = "left" | "center" | "right";
export type MediaKind = "image" | "video";

export interface MediaAttributes {
  kind: MediaKind;
  src: string;
  alt?: string;
  align?: MediaAlign;
  width?: number;
}

/** Only our own uploads and https URLs are accepted as media sources. */
export function isSafeMediaUrl(src: string | null | undefined): src is string {
  return !!src && (src.startsWith("/api/files/") || src.startsWith("https://"));
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    media: {
      insertMedia: (attributes: MediaAttributes, position?: number) => ReturnType;
    };
  }
}

const ALIGNMENTS: { value: MediaAlign; icon: IconComponent }[] = [
  { value: "left", icon: AlignLeftIcon },
  { value: "center", icon: AlignCenterIcon },
  { value: "right", icon: AlignRightIcon },
];
const WIDTHS = [33, 50, 75, 100];

function MediaView({ node, updateAttributes, deleteNode, selected, editor }: ReactNodeViewProps) {
  const { t } = useI18n();
  const { kind, src, alt, align, width } = node.attrs as Required<MediaAttributes>;
  if (!isSafeMediaUrl(src)) return <NodeViewWrapper as="figure" className="media media-broken" />;

  return (
    <NodeViewWrapper
      as="figure"
      className="media"
      data-align={align}
      data-selected={selected}
      style={{ "--media-width": `${width}%` } as CSSProperties}
    >
      <div className="media-frame" contentEditable={false} data-drag-handle="">
        {kind === "video" ? (
          <video src={src} controls preload="metadata" />
        ) : (
          <img src={src} alt={alt} loading="lazy" draggable={false} />
        )}
        {editor.isEditable && (
          <div className="media-toolbar" role="toolbar" aria-label={t("editor.mediaOptions")}>
            {ALIGNMENTS.map(({ value, icon: AlignIcon }) => (
              <button
                key={value}
                type="button"
                className="icon-button small"
                aria-pressed={align === value}
                aria-label={t(`editor.align.${value}`)}
                title={t(`editor.align.${value}`)}
                onClick={() => updateAttributes({ align: value })}
              >
                <AlignIcon />
              </button>
            ))}
            <span className="toolbar-separator" aria-hidden="true" />
            {WIDTHS.map((value) => (
              <button
                key={value}
                type="button"
                className="size-button"
                aria-pressed={width === value}
                title={t("editor.width", { value })}
                onClick={() => updateAttributes({ width: value })}
              >
                {value === 100 ? t("editor.full") : `${value}%`}
              </button>
            ))}
            <span className="toolbar-separator" aria-hidden="true" />
            <button
              type="button"
              className="icon-button small danger"
              aria-label={t("common.delete")}
              title={t("common.delete")}
              onClick={deleteNode}
            >
              <TrashIcon />
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const Media = Node.create({
  name: "media",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      kind: { default: "image", parseHTML: (el) => el.getAttribute("data-kind") ?? "image" },
      src: {
        default: null,
        parseHTML: (el) =>
          el.getAttribute("src") ?? el.querySelector("img,video")?.getAttribute("src") ?? null,
      },
      alt: { default: "" },
      align: { default: "center", parseHTML: (el) => el.getAttribute("data-align") ?? "center" },
      width: { default: 100, parseHTML: (el) => Number(el.getAttribute("data-width")) || 100 },
    };
  },

  parseHTML() {
    return [
      { tag: "figure[data-media]" },
      {
        tag: "img[src]",
        getAttrs: (el) => (isSafeMediaUrl(el.getAttribute("src")) ? { kind: "image" } : false),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { kind, src, alt, align, width } = node.attrs as Required<MediaAttributes>;
    const inner = kind === "video" ? ["video", { src, controls: "true" }] : ["img", { src, alt }];
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-media": "",
        "data-kind": kind,
        "data-align": align,
        "data-width": width,
      }),
      inner,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaView);
  },

  addCommands() {
    return {
      insertMedia:
        (attributes, position) =>
        ({ chain, state }) =>
          chain()
            .insertContentAt(position ?? state.selection.to, {
              type: this.name,
              attrs: { align: "center", width: 100, ...attributes },
            })
            .run(),
    };
  },
});
