/**
 * Writing a blog post: cover, title and the rich editor, with a settings panel for
 * publishing (now or scheduled), address (slug), excerpt, tags, category, SEO (with a
 * search-result preview) and featured flag. AI helps with titles, excerpt, tags and SEO.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Editor, JSONContent } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";

import { useCategories } from "../../api/queries";
import { aiToolsApi, blogApi } from "../../api/v4";
import { CategorySelect } from "../../components/CategoryBits";
import { DatePicker } from "../../components/DatePicker";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  BackIcon,
  CloseIcon,
  EyeIcon,
  GlobeIcon,
  InboxIcon,
  SettingsIcon,
  SparkleIcon,
  StarIcon,
} from "../../components/Icons";
import { Outline } from "../../components/Outline";
import { PageMenu, type ExportFormat } from "../../components/PageMenu";
import { EmptyState, Popover, Skeleton } from "../../components/ui";
import { useAutosave } from "../../hooks/useAutosave";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { coverStyle } from "../../lib/covers";
import {
  docToMarkdown,
  downloadText,
  printHtml,
  readImport,
  safeFilename,
  standaloneHtml,
} from "../../lib/exporters";
import { plainTextToDoc } from "../../lib/markdown";
import type { Post, PostChanges } from "../../types4";
import { NoteEditor } from "../editor/NoteEditor";
import { CoverPicker } from "../notes/CoverPicker";
import { RevisionDialog } from "../sharing/RevisionDialog";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { blogKey, postState } from "./BlogPage";

const postKey = (id: number) => ["post", id] as const;

export function PostEditorPage() {
  const { postId } = useParams();
  const id = Number(postId);
  const { t } = useI18n();
  const {
    data: post,
    isLoading,
    error,
  } = useQuery({ queryKey: postKey(id), queryFn: () => blogApi.get(id) });
  if (isLoading) return <Skeleton rows={6} />;
  if (error || !post) {
    return (
      <EmptyState
        icon={InboxIcon}
        title={t("errors.post_not_found")}
        action={
          <Link to="/blog" className="button">
            {t("common.back")}
          </Link>
        }
      />
    );
  }
  return <PostEditor key={post.id} post={post} />;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9؀-ۿ]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "post"
  );
}

function PostEditor({ post }: { post: Post }) {
  const i18n = useI18n();
  const { t, calendar, dir } = i18n;
  const client = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const { workspace, canEdit } = useWorkspace();
  const { data: categories = [] } = useCategories();
  const [draft, setDraft] = useState<Post>(post);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [panel, setPanel] = useState(() => window.matchMedia("(min-width: 1100px)").matches);
  const [preview, setPreview] = useState(false);
  const [history, setHistory] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [titleIdeas, setTitleIdeas] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [words, setWords] = useState(0);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const slugTouched = useRef(post.slug !== slugify(post.title) && Boolean(post.title));

  const { state, schedule, flush } = useAutosave<PostChanges>(async (changes) => {
    const saved = await blogApi.update(post.id, changes);
    client.setQueryData(postKey(post.id), saved);
    void client.invalidateQueries({ queryKey: blogKey });
    setDraft((current) => ({
      ...current,
      slug: saved.slug,
      published_at: saved.published_at,
      updated_at: saved.updated_at,
    }));
  });

  const initial = useMemo<JSONContent>(
    () => (post.body as JSONContent | null) ?? plainTextToDoc(post.content),
    [post.body, post.content],
  );

  useEffect(() => {
    const element = titleRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft.title]);

  const update = (changes: PostChanges, wait?: number) => {
    setDraft((current) => ({ ...current, ...changes }) as Post);
    schedule(changes, wait);
  };

  async function runAi(kind: "titles" | "excerpt" | "seo" | "tags") {
    const text = `${draft.title}\n\n${editor?.getText() ?? draft.content}`.slice(0, 11000);
    if (!text.trim()) {
      toast(t("blog.writeFirstHint"), "info");
      return;
    }
    setAiBusy(kind);
    try {
      const result = await aiToolsApi.generate({ kind, text, count: kind === "tags" ? 6 : 5 });
      if (kind === "titles") setTitleIdeas(result.items.map((item) => item.title));
      if (kind === "excerpt") update({ excerpt: result.text.slice(0, 500) }, 0);
      if (kind === "seo")
        update(
          {
            seo_description: result.text.slice(0, 300),
            seo_title: draft.seo_title || draft.title.slice(0, 120),
          },
          0,
        );
      if (kind === "tags") {
        const merged = [
          ...new Set([...draft.tags, ...result.items.map((item) => item.title.replace(/^#/, "").trim())]),
        ]
          .filter(Boolean)
          .slice(0, 20);
        update({ tags: merged }, 0);
      }
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    } finally {
      setAiBusy(null);
    }
  }

  async function publish(now: boolean) {
    await flush();
    update({ status: "published", ...(now ? { published_at: new Date().toISOString() } : {}) }, 0);
    toast(t("blog.publishedToast"), "success");
  }

  function exportAs(format: ExportFormat) {
    const name = safeFilename(draft.title, "post");
    if (format === "markdown")
      downloadText(`${name}.md`, docToMarkdown(editor?.getJSON() ?? initial, draft.title), "text/markdown");
    else if (format === "text")
      downloadText(`${name}.txt`, `${draft.title}\n\n${editor?.getText() ?? ""}`, "text/plain");
    else {
      const html = standaloneHtml(draft.title, editor?.getHTML() ?? "", dir);
      if (format === "html") downloadText(`${name}.html`, html, "text/html");
      else printHtml(html);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: t("blog.delete"),
      message: t("notes.deleteMessage", { title: draft.title || t("notes.untitled") }),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    await blogApi.remove(post.id);
    await client.invalidateQueries({ queryKey: blogKey });
    navigate("/blog");
  }

  const current = postState(draft);
  const publicUrl = workspace?.settings.blog_public ? `/w/${workspace.slug}/blog/${draft.slug}` : null;
  const scheduledDate = draft.published_at ? draft.published_at.slice(0, 10) : null;
  const scheduledTime = draft.published_at
    ? new Date(draft.published_at).toTimeString().slice(0, 5)
    : "09:00";
  const setSchedule = (date: string | null, time: string) => {
    if (!date) {
      update({ published_at: null }, 0);
      return;
    }
    const [hours, minutes] = time.split(":").map(Number);
    const moment = new Date(`${date}T00:00:00`);
    moment.setHours(hours || 0, minutes || 0, 0, 0);
    update({ published_at: moment.toISOString() }, 0);
  };

  return (
    <div className="post-editor" data-panel={panel}>
      <div className="post-main">
        <div className="note-toolbar">
          <div className="note-toolbar-start">
            <Link to="/blog" className="icon-button" aria-label={t("nav.blog")} title={t("nav.blog")}>
              <BackIcon />
            </Link>
            <span className={`badge status-${current}`}>{t(`blog.state.${current}`)}</span>
            <span className="save-state" data-state={state}>
              <span className="save-dot" aria-hidden="true" />
              {t(`notes.state.${state}`)}
            </span>
          </div>
          <div className="note-toolbar-end">
            <button
              type="button"
              className={preview ? "ghost small active" : "ghost small"}
              aria-pressed={preview}
              onClick={() => setPreview(!preview)}
            >
              <EyeIcon /> <span className="hide-on-phone">{t("blog.preview")}</span>
            </button>
            {canEdit && current === "draft" && (
              <button type="button" className="primary small" onClick={() => void publish(true)}>
                <GlobeIcon /> {t("blog.publish")}
              </button>
            )}
            {canEdit && current !== "draft" && (
              <button type="button" className="ghost small" onClick={() => update({ status: "draft" }, 0)}>
                {t("blog.unpublish")}
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              aria-pressed={panel}
              title={t("blog.settings")}
              aria-label={t("blog.settings")}
              onClick={() => setPanel(!panel)}
            >
              <SettingsIcon />
            </button>
            <PageMenu
              readOnly={!canEdit}
              onCopyLink={() =>
                void navigator.clipboard
                  .writeText(publicUrl ? window.location.origin + publicUrl : window.location.href)
                  .then(() => toast(t("common.copied"), "success"))
              }
              onCopyContents={() =>
                void navigator.clipboard
                  .writeText(`${draft.title}\n\n${editor?.getText() ?? ""}`)
                  .then(() => toast(t("common.copied"), "success"))
              }
              onHistory={() => setHistory(true)}
              onExport={exportAs}
              onImport={async (file) => {
                const { content, title } = await readImport(file);
                editor?.chain().focus("end").insertContent(content).run();
                if (!draft.title.trim()) update({ title });
              }}
              onDelete={() => void remove()}
              lastEdited={{ name: draft.author_name, at: draft.updated_at }}
              words={words}
            />
          </div>
        </div>

        {draft.cover && (
          <div className="note-cover-banner" style={coverStyle(draft.cover)}>
            {canEdit && !preview && (
              <div className="cover-actions">
                <CoverPicker
                  cover={draft.cover}
                  onChange={(cover) => update({ cover }, 0)}
                  triggerLabel={t("notes.changeCover")}
                  triggerClassName="small cover-button"
                />
              </div>
            )}
          </div>
        )}

        <article className={preview ? "note-doc post-doc reader" : "note-doc post-doc"}>
          {!draft.cover && canEdit && !preview && (
            <div className="note-doc-actions">
              <CoverPicker
                cover={null}
                onChange={(cover) => update({ cover }, 0)}
                triggerLabel={t("notes.addCover")}
                triggerClassName="ghost small doc-action"
                align="start"
              />
            </div>
          )}
          <textarea
            ref={titleRef}
            className="note-title-input"
            rows={1}
            maxLength={200}
            readOnly={!canEdit || preview}
            autoFocus={Boolean((location.state as { isNew?: boolean } | null)?.isNew)}
            placeholder={t("blog.titlePlaceholder")}
            value={draft.title}
            onChange={(event) => {
              const title = event.target.value;
              const changes: PostChanges = { title };
              if (!slugTouched.current && current === "draft" && title.trim()) changes.slug = slugify(title);
              update(changes);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                editor?.commands.focus("start");
              }
            }}
          />
          {canEdit && !preview && (
            <div className="title-ai">
              <button
                type="button"
                className="link-button small"
                disabled={aiBusy === "titles"}
                onClick={() => void runAi("titles")}
              >
                <SparkleIcon /> {aiBusy === "titles" ? t("ai.thinking") : t("blog.suggestTitles")}
              </button>
              {titleIdeas.length > 0 && (
                <div className="idea-chips">
                  {titleIdeas.map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      className="chip"
                      dir="auto"
                      onClick={() => {
                        update({ title: idea });
                        setTitleIdeas([]);
                      }}
                    >
                      {idea}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="icon-button small"
                    aria-label={t("common.close")}
                    onClick={() => setTitleIdeas([])}
                  >
                    <CloseIcon />
                  </button>
                </div>
              )}
            </div>
          )}
          <p className="note-meta">
            {draft.author_name && `${draft.author_name} · `}
            {t("blog.minutes", { count: Math.max(1, Math.ceil(words / 200)) })}
            {draft.published_at && ` · ${calendar.dateTime(draft.published_at)}`}
          </p>
          {preview && draft.excerpt && (
            <p className="post-lead" dir="auto">
              {draft.excerpt}
            </p>
          )}
          <NoteEditor
            initialContent={initial}
            editable={canEdit && !preview}
            onChange={(body, content) => update({ body, content })}
            onStats={(stats) => setWords(stats.words)}
            onReady={setEditor}
          />
        </article>
        {preview && <Outline editor={editor} className="note-outline" />}
      </div>

      {panel && (
        <aside className="post-panel" aria-label={t("blog.settings")}>
          <section className="panel-section">
            <h3>{t("blog.publishing")}</h3>
            <div className="segmented small">
              <button
                type="button"
                aria-selected={draft.status === "draft"}
                disabled={!canEdit}
                onClick={() => update({ status: "draft" }, 0)}
              >
                {t("blog.state.draft")}
              </button>
              <button
                type="button"
                aria-selected={draft.status === "published"}
                disabled={!canEdit}
                onClick={() => update({ status: "published" }, 0)}
              >
                {t("blog.state.published")}
              </button>
            </div>
            <div className="field">
              <span className="field-label">{t("blog.publishDate")}</span>
              <div className="schedule-row">
                <DatePicker
                  value={scheduledDate}
                  onChange={(date) => setSchedule(date, scheduledTime)}
                  compact
                />
                <input
                  type="time"
                  dir="ltr"
                  value={scheduledTime}
                  disabled={!scheduledDate}
                  onChange={(event) => setSchedule(scheduledDate, event.target.value)}
                />
              </div>
              {current === "scheduled" && <span className="hint">{t("blog.scheduledHint")}</span>}
            </div>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={draft.featured}
                disabled={!canEdit}
                onChange={(event) => update({ featured: event.target.checked }, 0)}
              />
              <span>
                <StarIcon /> {t("blog.featured")}
              </span>
            </label>
          </section>

          <section className="panel-section">
            <h3>{t("blog.address")}</h3>
            <input
              dir="auto"
              value={draft.slug}
              disabled={!canEdit}
              onChange={(event) => {
                slugTouched.current = true;
                update({ slug: slugify(event.target.value) });
              }}
            />
            <span className="hint url-preview" dir="ltr">
              /w/{workspace?.slug ?? "…"}/blog/{draft.slug}
            </span>
            {publicUrl && current === "published" && (
              <a className="button small ghost" href={publicUrl} target="_blank" rel="noreferrer">
                <GlobeIcon /> {t("blog.openPublic")}
              </a>
            )}
          </section>

          <section className="panel-section">
            <div className="row-between">
              <h3>{t("blog.excerpt")}</h3>
              {canEdit && (
                <button
                  type="button"
                  className="link-button small"
                  disabled={aiBusy === "excerpt"}
                  onClick={() => void runAi("excerpt")}
                >
                  <SparkleIcon /> {aiBusy === "excerpt" ? t("ai.thinking") : t("ai.generate")}
                </button>
              )}
            </div>
            <textarea
              rows={3}
              maxLength={500}
              disabled={!canEdit}
              value={draft.excerpt}
              onChange={(event) => update({ excerpt: event.target.value })}
            />
          </section>

          <section className="panel-section">
            <div className="row-between">
              <h3>{t("blog.tags")}</h3>
              {canEdit && (
                <button
                  type="button"
                  className="link-button small"
                  disabled={aiBusy === "tags"}
                  onClick={() => void runAi("tags")}
                >
                  <SparkleIcon /> {aiBusy === "tags" ? t("ai.thinking") : t("ai.suggest")}
                </button>
              )}
            </div>
            <div className="tag-editor">
              {draft.tags.map((tag) => (
                <span key={tag} className="tag">
                  #{tag}
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={t("common.delete")}
                      onClick={() => update({ tags: draft.tags.filter((x) => x !== tag) }, 0)}
                    >
                      <CloseIcon />
                    </button>
                  )}
                </span>
              ))}
              {canEdit && (
                <input
                  value={tagInput}
                  placeholder={t("blog.addTag")}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === ",") && tagInput.trim()) {
                      event.preventDefault();
                      update({ tags: [...new Set([...draft.tags, tagInput.trim().replace(/^#/, "")])] }, 0);
                      setTagInput("");
                    }
                  }}
                />
              )}
            </div>
            <div className="field">
              <span className="field-label">{t("common.category")}</span>
              <CategorySelect
                categories={categories}
                value={draft.category_id}
                onChange={(category_id) => update({ category_id }, 0)}
              />
            </div>
          </section>

          <section className="panel-section">
            <div className="row-between">
              <h3>{t("blog.seo")}</h3>
              {canEdit && (
                <button
                  type="button"
                  className="link-button small"
                  disabled={aiBusy === "seo"}
                  onClick={() => void runAi("seo")}
                >
                  <SparkleIcon /> {aiBusy === "seo" ? t("ai.thinking") : t("ai.generate")}
                </button>
              )}
            </div>
            <input
              maxLength={120}
              placeholder={draft.title || t("blog.seoTitle")}
              disabled={!canEdit}
              value={draft.seo_title}
              onChange={(event) => update({ seo_title: event.target.value })}
            />
            <textarea
              rows={3}
              maxLength={300}
              placeholder={t("blog.seoDescription")}
              disabled={!canEdit}
              value={draft.seo_description}
              onChange={(event) => update({ seo_description: event.target.value })}
            />
            <div className="serp-preview" dir="auto">
              <span className="serp-url" dir="ltr">
                {window.location.host}/w/{workspace?.slug}/blog/{draft.slug}
              </span>
              <strong>{draft.seo_title || draft.title || t("notes.untitled")}</strong>
              <span>{(draft.seo_description || draft.excerpt || "").slice(0, 160)}</span>
            </div>
            <span className="hint">
              {t("blog.seoCount", {
                title: (draft.seo_title || draft.title).length,
                description: draft.seo_description.length,
              })}
            </span>
          </section>

          <section className="panel-section stats">
            <span>{t("blog.words", { count: words })}</span>
            <span>{t("blog.views", { count: draft.views })}</span>
            <span>{t("blog.created", { date: calendar.shortDate(draft.created_at) })}</span>
          </section>
          <Popover
            label={t("blog.help")}
            trigger={({ toggle }) => (
              <button type="button" className="link-button small" onClick={toggle}>
                {t("blog.help")}
              </button>
            )}
          >
            {() => <p className="popover-text">{t("blog.helpText")}</p>}
          </Popover>
        </aside>
      )}

      {history && (
        <RevisionDialog
          queryKey={["post-revisions", post.id]}
          load={() => blogApi.revisions(post.id)}
          loadOne={(id) => blogApi.revision(post.id, id)}
          restore={(id) => blogApi.restoreRevision(post.id, id)}
          onClose={() => setHistory(false)}
          onRestored={() => window.location.reload()}
        />
      )}
    </div>
  );
}
