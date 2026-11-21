/**
 * The public blog of a workspace (no sign-in): /w/<slug>/blog and /w/<slug>/blog/<post>.
 * Posts are shown with a read-only editor, so embeds, code and tables look the same as
 * when writing.
 */
import { useQuery } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { blogApi } from "../../api/v4";
import { BackIcon, EyeIcon, NewspaperIcon } from "../../components/Icons";
import { EmptyState, Skeleton } from "../../components/ui";
import { useI18n } from "../../i18n";
import { coverStyle } from "../../lib/covers";
import { plainTextToDoc } from "../../lib/markdown";
import { NoteEditor } from "../editor/NoteEditor";

const noop = () => undefined;

export function PublicBlogPage() {
  const { slug = "", postSlug } = useParams();
  return postSlug ? <PublicPost slug={slug} postSlug={postSlug} /> : <PublicIndex slug={slug} />;
}

function useTitle(title: string | undefined) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}

function PublicIndex({ slug }: { slug: string }) {
  const { t, calendar } = useI18n();
  const [tag, setTag] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-blog", slug, tag],
    queryFn: () => blogApi.publicBlog(slug, tag ?? undefined),
  });
  useTitle(data?.workspace_name);
  if (isLoading) return <Skeleton rows={5} />;
  if (error || !data) return <EmptyState icon={NewspaperIcon} title={t("errors.blog_not_found")} />;
  const [featured, ...rest] = data.posts;
  return (
    <div className="public-blog">
      <header className="public-blog-head">
        <span className="ws-mark ws-mark-lg">{data.workspace_icon || data.workspace_name.slice(0, 1)}</span>
        <h1>{data.workspace_name}</h1>
        {data.description && <p className="muted">{data.description}</p>}
        {tag && (
          <button type="button" className="tag" onClick={() => setTag(null)}>
            #{tag} ×
          </button>
        )}
      </header>
      {!featured ? (
        <EmptyState icon={NewspaperIcon} title={t("blog.noPublic")} />
      ) : (
        <>
          <Link to={`/w/${slug}/blog/${featured.slug}`} className="public-featured">
            <span className="post-cover" style={featured.cover ? coverStyle(featured.cover) : undefined} />
            <span className="post-body">
              <strong dir="auto">{featured.title}</strong>
              <span className="muted" dir="auto">
                {featured.excerpt}
              </span>
              <span className="muted small">
                {featured.author_name} · {calendar.shortDate(featured.published_at ?? featured.created_at)} ·{" "}
                {t("blog.minutes", { count: featured.reading_minutes })}
              </span>
            </span>
          </Link>
          <div className="post-grid">
            {rest.map((post) => (
              <Link key={post.id} to={`/w/${slug}/blog/${post.slug}`} className="post-card">
                <span className="post-cover" style={post.cover ? coverStyle(post.cover) : undefined}>
                  {!post.cover && <NewspaperIcon />}
                </span>
                <span className="post-body">
                  <strong dir="auto">{post.title}</strong>
                  <span className="muted small post-excerpt" dir="auto">
                    {post.excerpt}
                  </span>
                  <span className="muted small">
                    {calendar.shortDate(post.published_at ?? post.created_at)} ·{" "}
                    {t("blog.minutes", { count: post.reading_minutes })}
                  </span>
                  <span className="tag-row">
                    {post.tags.slice(0, 3).map((name) => (
                      <button
                        key={name}
                        type="button"
                        className="tag"
                        onClick={(event) => {
                          event.preventDefault();
                          setTag(name);
                        }}
                      >
                        #{name}
                      </button>
                    ))}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PublicPost({ slug, postSlug }: { slug: string; postSlug: string }) {
  const { t, calendar } = useI18n();
  const {
    data: post,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["public-post", slug, postSlug],
    queryFn: () => blogApi.publicPost(slug, postSlug),
    staleTime: Infinity,
  });
  useTitle(post ? post.seo_title || post.title : undefined);
  useEffect(() => {
    if (!post) return;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = post.seo_description || post.excerpt;
  }, [post]);
  if (isLoading) return <Skeleton rows={6} />;
  if (error || !post) return <EmptyState icon={NewspaperIcon} title={t("errors.post_not_found")} />;
  const body = (post.body as JSONContent | null) ?? plainTextToDoc(post.content);
  return (
    <article className="public-post">
      <Link to={`/w/${slug}/blog`} className="ghost small public-back">
        <BackIcon /> {t("blog.allPosts")}
      </Link>
      {post.cover && <div className="public-cover" style={coverStyle(post.cover)} />}
      <h1 dir="auto">{post.title}</h1>
      <p className="muted public-meta">
        {post.author_name && <strong>{post.author_name}</strong>} ·{" "}
        {calendar.longDay((post.published_at ?? post.created_at).slice(0, 10))} ·{" "}
        {t("blog.minutes", { count: post.reading_minutes })} · <EyeIcon /> {calendar.formatNumber(post.views)}
      </p>
      {post.excerpt && (
        <p className="post-lead" dir="auto">
          {post.excerpt}
        </p>
      )}
      <NoteEditor initialContent={body} onChange={noop} editable={false} />
      {post.tags.length > 0 && (
        <div className="tag-row">
          {post.tags.map((name) => (
            <span key={name} className="tag">
              #{name}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
