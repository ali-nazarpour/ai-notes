import type { Editor, Range } from "@tiptap/core";

import {
  BookmarkIcon,
  BulletListIcon,
  CalloutIcon,
  CodeBlockIcon,
  DividerIcon,
  EmbedIcon,
  FileIcon,
  HeadingIcon,
  ImageIcon,
  LinkIcon,
  MusicIcon,
  OrderedListIcon,
  PageLinkIcon,
  PlayIcon,
  QuoteIcon,
  SparkleIcon,
  TableIcon,
  TextIcon,
  TocIcon,
  TodoIcon,
  ToggleIcon,
  VideoIcon,
  WandIcon,
} from "../../components/Icons";
import type { I18n } from "../../i18n";
import type { UrlKind } from "./InsertDialogs";
import type { SlashItem } from "./SlashCommand";

export type UploadKind = "image" | "video" | "audio" | "file";

export interface SlashActions {
  pickFile: (kind: UploadKind) => void;
  askUrl: (kind: UrlKind) => void;
  pickPage: () => void;
  openAi: (mode: "continue" | "write") => void;
}

export function buildSlashItems(t: I18n["t"], actions: SlashActions): SlashItem[] {
  const chain = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);
  const then = (action: () => void) => (editor: Editor, range: Range) => {
    chain(editor, range).run();
    action();
  };

  const headings: SlashItem[] = ([1, 2, 3, 4, 5, 6] as const).map((level) => ({
    id: `h${level}`,
    group: "basic",
    title: t("editor.block.heading", { level }),
    description: t("editor.block.headingHint", { level }),
    keywords: [`h${level}`, "heading", "title", `#${"#".repeat(level - 1)}`],
    shortcut: "#".repeat(level),
    icon: HeadingIcon,
    run: (editor, range) => chain(editor, range).setNode("heading", { level }).run(),
  }));

  return [
    {
      id: "paragraph",
      group: "basic",
      title: t("editor.block.text"),
      description: t("editor.block.textHint"),
      keywords: ["text", "paragraph", "p"],
      icon: TextIcon,
      run: (editor, range) => chain(editor, range).setParagraph().run(),
    },
    ...headings,
    {
      id: "bullet",
      group: "basic",
      title: t("editor.block.bullet"),
      description: t("editor.block.bulletHint"),
      keywords: ["bullet", "list", "ul", "-"],
      shortcut: "-",
      icon: BulletListIcon,
      run: (editor, range) => chain(editor, range).toggleBulletList().run(),
    },
    {
      id: "ordered",
      group: "basic",
      title: t("editor.block.ordered"),
      description: t("editor.block.orderedHint"),
      keywords: ["number", "ordered", "list", "ol", "1."],
      shortcut: "1.",
      icon: OrderedListIcon,
      run: (editor, range) => chain(editor, range).toggleOrderedList().run(),
    },
    {
      id: "todo",
      group: "basic",
      title: t("editor.block.todo"),
      description: t("editor.block.todoHint"),
      keywords: ["todo", "task", "checkbox", "check", "[]"],
      shortcut: "[]",
      icon: TodoIcon,
      run: (editor, range) => chain(editor, range).toggleTaskList().run(),
    },
    {
      id: "toggle",
      group: "basic",
      title: t("editor.block.toggle"),
      description: t("editor.block.toggleHint"),
      keywords: ["toggle", "collapse", "details", "accordion", ">"],
      shortcut: ">",
      icon: ToggleIcon,
      run: (editor, range) =>
        chain(editor, range)
          .insertContent({
            type: "toggle",
            attrs: { open: true },
            content: [{ type: "paragraph" }, { type: "paragraph" }],
          })
          .run(),
    },
    {
      id: "pageLink",
      group: "basic",
      title: t("editor.block.pageLink"),
      description: t("editor.block.pageLinkHint"),
      keywords: ["page", "link", "mention", "note", "doc", "@"],
      icon: PageLinkIcon,
      run: then(actions.pickPage),
    },
    {
      id: "callout",
      group: "basic",
      title: t("editor.block.callout"),
      description: t("editor.block.calloutHint"),
      keywords: ["callout", "note", "info", "warning", "tip", "box"],
      icon: CalloutIcon,
      run: (editor, range) =>
        chain(editor, range)
          .insertContent({
            type: "callout",
            attrs: { emoji: "💡", color: "amber" },
            content: [{ type: "paragraph" }],
          })
          .run(),
    },
    {
      id: "quote",
      group: "basic",
      title: t("editor.block.quote"),
      description: t("editor.block.quoteHint"),
      keywords: ["quote", "blockquote", '"'],
      shortcut: '"',
      icon: QuoteIcon,
      run: (editor, range) => chain(editor, range).toggleBlockquote().run(),
    },
    {
      id: "table",
      group: "basic",
      title: t("editor.block.table"),
      description: t("editor.block.tableHint"),
      keywords: ["table", "grid", "rows", "columns"],
      icon: TableIcon,
      run: (editor, range) =>
        chain(editor, range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      id: "divider",
      group: "basic",
      title: t("editor.block.divider"),
      description: t("editor.block.dividerHint"),
      keywords: ["divider", "line", "hr", "---", "separator"],
      shortcut: "---",
      icon: DividerIcon,
      run: (editor, range) => chain(editor, range).setHorizontalRule().run(),
    },
    {
      id: "toc",
      group: "basic",
      title: t("editor.block.toc"),
      description: t("editor.block.tocHint"),
      keywords: ["toc", "contents", "outline", "index"],
      icon: TocIcon,
      run: (editor, range) => chain(editor, range).insertContent({ type: "toc" }).run(),
    },
    {
      id: "image",
      group: "media",
      title: t("editor.block.image"),
      description: t("editor.block.imageHint"),
      keywords: ["image", "picture", "photo", "img", "upload"],
      icon: ImageIcon,
      run: then(() => actions.pickFile("image")),
    },
    {
      id: "image-link",
      group: "media",
      title: t("editor.block.imageLink"),
      description: t("editor.block.imageLinkHint"),
      keywords: ["image", "url", "link", "photo"],
      icon: LinkIcon,
      run: then(() => actions.askUrl("image")),
    },
    {
      id: "video",
      group: "media",
      title: t("editor.block.video"),
      description: t("editor.block.videoHint"),
      keywords: ["video", "movie", "mp4", "clip", "upload"],
      icon: VideoIcon,
      run: then(() => actions.pickFile("video")),
    },
    {
      id: "video-embed",
      group: "media",
      title: t("editor.block.videoEmbed"),
      description: t("editor.block.videoEmbedHint"),
      keywords: ["youtube", "aparat", "vimeo", "video", "embed", "link"],
      icon: PlayIcon,
      run: then(() => actions.askUrl("embed")),
    },
    {
      id: "audio",
      group: "media",
      title: t("editor.block.audio"),
      description: t("editor.block.audioHint"),
      keywords: ["audio", "music", "mp3", "song", "sound", "upload"],
      icon: MusicIcon,
      run: then(() => actions.pickFile("audio")),
    },
    {
      id: "audio-link",
      group: "media",
      title: t("editor.block.audioLink"),
      description: t("editor.block.audioLinkHint"),
      keywords: ["audio", "music", "mp3", "url", "link", "podcast"],
      icon: MusicIcon,
      run: then(() => actions.askUrl("audio")),
    },
    {
      id: "code",
      group: "media",
      title: t("editor.block.code"),
      description: t("editor.block.codeHint"),
      keywords: ["code", "snippet", "```", "pre"],
      shortcut: "```",
      icon: CodeBlockIcon,
      run: (editor, range) => chain(editor, range).toggleCodeBlock().run(),
    },
    {
      id: "file",
      group: "media",
      title: t("editor.block.file"),
      description: t("editor.block.fileHint"),
      keywords: ["file", "pdf", "document", "attachment", "upload"],
      icon: FileIcon,
      run: then(() => actions.pickFile("file")),
    },
    {
      id: "bookmark",
      group: "media",
      title: t("editor.block.bookmark"),
      description: t("editor.block.bookmarkHint"),
      keywords: ["bookmark", "link", "url", "web", "card"],
      icon: BookmarkIcon,
      run: then(() => actions.askUrl("bookmark")),
    },
    {
      id: "embed",
      group: "embeds",
      title: t("editor.block.embed"),
      description: t("editor.block.embedHint"),
      keywords: ["embed", "spotify", "soundcloud", "figma", "codepen", "maps", "iframe"],
      icon: EmbedIcon,
      run: then(() => actions.askUrl("embed")),
    },
    {
      id: "ai-continue",
      group: "ai",
      title: t("ai.continue"),
      description: t("ai.continueHint"),
      keywords: ["ai", "continue", "write", "more"],
      icon: SparkleIcon,
      run: then(() => actions.openAi("continue")),
    },
    {
      id: "ai-write",
      group: "ai",
      title: t("ai.write"),
      description: t("ai.writeHint"),
      keywords: ["ai", "write", "generate", "draft", "prompt"],
      icon: WandIcon,
      run: then(() => actions.openAi("write")),
    },
  ];
}
