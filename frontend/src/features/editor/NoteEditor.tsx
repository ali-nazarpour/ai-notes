/**
 * The rich note editor (TipTap / ProseMirror).
 *
 * - "/" opens the block menu (Notion-like): text, headings, lists, toggle, callout, quote,
 *   table, table of contents, page links, images / videos / audio / files (upload or link),
 *   YouTube & other embeds, web bookmarks and AI.
 * - Pasting a YouTube/Aparat/Spotify/... link embeds it; a link to an image, video or
 *   audio file shows it.
 * - Selecting text shows the formatting toolbar (with AI rewrite and translate).
 * - Images and videos can be pasted or dropped; they are uploaded to the server.
 * - Every block gets its own direction (BlockDirection), so Persian and English mix
 *   correctly and empty lines follow the page direction.
 *
 * The editor is uncontrolled: it starts from `initialContent` and reports every change
 * through onChange(doc, plainText). The parent saves (debounced).
 */
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Highlight from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { TextAlign } from "@tiptap/extension-text-align";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { filesApi } from "../../api/endpoints";
import { useToast } from "../../components/Feedback";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import type { EditAction } from "../../types";
import { AiDialog, type AiRequest } from "./AiDialog";
import { BlockDirection } from "./BlockDirection";
import { directMediaKind, toEmbed } from "../../lib/embeds";
import { EXTRA_BLOCKS } from "./Blocks";
import { PagePicker, UrlDialog, type UrlKind } from "./InsertDialogs";
import { Media } from "./Media";
import { filterSlashItems, SlashCommand } from "./SlashCommand";
import { buildSlashItems, type UploadKind } from "./slashItems";
import { FormatToolbar, TableToolbar } from "./Toolbars";

const lowlight = createLowlight(common);

const ACCEPT: Record<UploadKind, string> = {
  image: "image/png,image/jpeg,image/gif,image/webp,image/avif",
  video: "video/mp4,video/webm,video/quicktime",
  audio: "audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/flac,.mp3,.m4a,.ogg,.wav,.flac",
  file: ".pdf,.docx,.xlsx,.pptx,.zip,.txt,.md,.csv,.json",
};

function preference(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as boolean);
  } catch {
    return fallback;
  }
}

/** Inserts the right block for a pasted / typed link. Returns false if it is a plain link. */
export function insertLink(editor: Editor, url: string, kind?: UrlKind, position?: number): boolean {
  const at = position ?? editor.state.selection.to;
  const insert = (content: JSONContent) => editor.chain().focus().insertContentAt(at, content).run();
  if (kind === "bookmark") return insert({ type: "bookmark", attrs: { url } });
  if (kind === undefined || kind === "embed") {
    if (toEmbed(url)) return insert({ type: "embed", attrs: { url } });
    if (kind === "embed") return false;
  }
  const direct = directMediaKind(url);
  if (direct === "audio") return insert({ type: "audio", attrs: { src: url, title: "" } });
  if (direct === "image" || direct === "video") {
    return editor.chain().focus().insertMedia({ kind: direct, src: url }, at).run();
  }
  return false;
}

export interface NoteEditorProps {
  initialContent: JSONContent;
  onChange: (doc: JSONContent, text: string) => void;
  onStats?: (stats: { words: number; characters: number }) => void;
  onReady?: (editor: Editor) => void;
  /** false for viewers and locked pages. */
  editable?: boolean;
}

export function NoteEditor({ initialContent, onChange, onStats, onReady, editable = true }: NoteEditorProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const insertAt = useRef<number | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [aiRequest, setAiRequest] = useState<AiRequest | null>(null);
  const [urlKind, setUrlKind] = useState<UrlKind | null>(null);
  const [pickingPage, setPickingPage] = useState(false);
  const callbacks = useRef({ onChange, onStats });
  callbacks.current = { onChange, onStats };

  const uploadFiles = useCallback(
    async (files: File[], position?: number) => {
      const editor = editorRef.current;
      if (!editor) return;
      for (const file of files) {
        setUploading(0);
        try {
          const stored = await filesApi.upload(file, setUploading);
          const at = position ?? editor.state.selection.to;
          if (stored.kind === "image" || stored.kind === "video") {
            editor
              .chain()
              .focus()
              .insertMedia({ kind: stored.kind, src: stored.url, alt: file.name }, at)
              .run();
          } else if (stored.kind === "audio") {
            const title = file.name.replace(/\.[^.]+$/, "");
            editor
              .chain()
              .focus()
              .insertContentAt(at, { type: "audio", attrs: { src: stored.url, title } })
              .run();
          } else {
            editor
              .chain()
              .focus()
              .insertContentAt(at, {
                type: "fileBlock",
                attrs: { url: stored.url, name: file.name, size: stored.size },
              })
              .run();
          }
        } catch (error) {
          toast(errorMessage(error, i18n), "error");
        } finally {
          setUploading(null);
        }
      }
    },
    [i18n, toast],
  );

  const actions = useRef({
    pickFile: (kind: UploadKind) => {
      if (!fileInput.current) return;
      insertAt.current = editorRef.current?.state.selection.from ?? null;
      fileInput.current.accept = ACCEPT[kind];
      fileInput.current.click();
    },
    askUrl: (kind: UrlKind) => {
      insertAt.current = editorRef.current?.state.selection.from ?? null;
      setUrlKind(kind);
    },
    pickPage: () => {
      insertAt.current = editorRef.current?.state.selection.from ?? null;
      setPickingPage(true);
    },
    openAi: (mode: "continue" | "write") => {
      const editor = editorRef.current;
      if (!editor) return;
      const at = editor.state.selection.from;
      const context = editor.state.doc.textBetween(0, at, "\n\n");
      setAiRequest({ kind: mode, at, context });
    },
  });

  const slashItems = useMemo(() => buildSlashItems(t, actions.current), [t]);
  const slashItemsRef = useRef(slashItems);
  slashItemsRef.current = slashItems;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
        dropcursor: { width: 3, class: "drop-cursor" },
      }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading" ? t("editor.headingPlaceholder") : t("editor.placeholder"),
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: true } }),
      CodeBlockLowlight.configure({ lowlight }),
      CharacterCount,
      BlockDirection,
      Media,
      ...EXTRA_BLOCKS,
      SlashCommand.configure({
        suggestion: {
          ...SlashCommand.options.suggestion,
          items: ({ query }) => filterSlashItems(slashItemsRef.current, query),
        },
      }),
    ],
    content: initialContent,
    editable,
    editorProps: {
      attributes: {
        class: "prose",
        "aria-label": t("editor.label"),
        spellcheck: String(preference("notes.editor.spellcheck", true)),
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!files.length) {
          // A single pasted link to a video / music / image becomes a player or picture.
          const text = event.clipboardData?.getData("text/plain").trim() ?? "";
          const current = editorRef.current;
          if (!current || !text || /\s/.test(text) || !preference("notes.editor.autoEmbed", true))
            return false;
          if (current.state.selection.$from.parent.type.name === "codeBlock") return false;
          return insertLink(current, text);
        }
        void uploadFiles(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (moved || !files.length) return false;
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void uploadFiles(files, position);
        return true;
      },
    },
    onCreate: ({ editor: created }) => {
      const storage = created.storage.characterCount;
      callbacks.current.onStats?.({ words: storage.words(), characters: storage.characters() });
    },
    onUpdate: ({ editor: updated }) => {
      callbacks.current.onChange(updated.getJSON(), updated.getText({ blockSeparator: "\n\n" }));
      const storage = updated.storage.characterCount;
      callbacks.current.onStats?.({ words: storage.words(), characters: storage.characters() });
    },
  });

  useEffect(() => {
    editorRef.current = editor;
    if (editor) onReady?.(editor);
  }, [editor, onReady]);

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  const onAi = useCallback(
    (action: EditAction, targetLanguage?: string) => {
      if (!editor) return;
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, "\n\n");
      setAiRequest({ kind: "edit", action, text, from, to, targetLanguage });
    },
    [editor],
  );

  return (
    <div className="editor-shell">
      {uploading !== null && (
        <div className="upload-progress" role="status">
          <span>{t("editor.uploading")}</span>
          <span className="upload-bar">
            <span style={{ width: `${Math.round(uploading * 100)}%` }} />
          </span>
        </div>
      )}
      {editor && editable && <FormatToolbar editor={editor} onAi={onAi} />}
      {editor && editable && <TableToolbar editor={editor} />}
      <EditorContent editor={editor} className="editor-content" />
      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) void uploadFiles(files, insertAt.current ?? undefined);
        }}
      />
      {editor && aiRequest && (
        <AiDialog editor={editor} request={aiRequest} onClose={() => setAiRequest(null)} />
      )}
      {editor && urlKind && (
        <UrlDialog
          kind={urlKind}
          onClose={() => setUrlKind(null)}
          onSubmit={(url) => {
            setUrlKind(null);
            if (!insertLink(editor, url, urlKind, insertAt.current ?? undefined)) {
              editor.chain().focus().insertContent({ type: "bookmark", attrs: { url } }).run();
            }
          }}
        />
      )}
      {editor && pickingPage && (
        <PagePicker
          onClose={() => setPickingPage(false)}
          onPick={(page) => {
            setPickingPage(false);
            editor
              .chain()
              .focus()
              .insertContentAt(insertAt.current ?? editor.state.selection.to, {
                type: "pageLink",
                attrs: page,
              })
              .run();
          }}
        />
      )}
    </div>
  );
}
