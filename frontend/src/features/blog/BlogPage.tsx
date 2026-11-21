/** Blog posts of the workspace: status tabs, search, tags, featured post, public link. */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";

import { blogApi } from "../../api/v4";
import { useToast } from "../../components/Feedback";
import { EyeIcon, GlobeIcon, NewspaperIcon, PenIcon, PlusIcon, StarIcon } from "../../components/Icons";
import { EmptyState, PageHeader, Skeleton } from "../../components/ui";
import { matchesQuery, usePageQuery } from "../../hooks/usePageQuery";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { coverStyle } from "../../lib/covers";
import type { PostSummary } from "../../types4";
import { useWorkspace } from "../workspace/WorkspaceContext";

export const blogKey = ["blog"] as const;

type Tab = "all" | "published" | "scheduled" | "draft";

export function postState(post: PostSummary): Exclude<Tab, "all"> {
  if (post.status === "draft") return "draft";
  return post.published_at && new Date(post.published_at) > new Date() ? "scheduled" : "published";
}

export function BlogPage() {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const navigate = useNavigate();
  const { workspace, canEdit } = useWorkspace();
  const { data: posts = [], isLoading } = useQuery({ queryKey: blogKey, queryFn: () => blogApi.list() });
  const [tab, setTab] = useState<Tab>("all");
  const query = usePageQuery();
  const [tag, setTag] = useState<string | null>(null);

  const tags = useMemo(() => [...new Set(posts.flatMap((p) => p.tags))].sort(), [posts]);
  const counts = useMemo(() => {
    const result = { all: posts.length, published: 0, scheduled: 0, draft: 0 };
    posts.forEach((post) => (result[postState(post)] += 1));
    return result;
  }, [posts]);
  const filtered = posts.filter((post) => {
    return (
      (tab === "all" || postState(post) === tab) &&
      (!tag || post.tags.includes(tag)) &&
      matchesQuery(query, post.title, post.excerpt, post.tags.join(" "))
    );
  });

  async function create() {
    try {
      const post = await blogApi.create();
      navigate(`/blog/${post.id}`, { state: { isNew: true } });
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  const publicUrl = workspace?.settings.blog_public ? `/w/${workspace.slug}/blog` : null;

  return (
    <div className="page blog-page">
      <PageHeader
        title={t("nav.blog")}
        subtitle={t("blog.subtitle")}
        actions={
          <>
            {publicUrl ? (
              <a href={publicUrl} target="_blank" rel="noreferrer" className="button ghost">
                <GlobeIcon /> {t("blog.viewPublic")}
              </a>
            ) : (
              canEdit && (
                <Link to="/settings/workspace" className="button ghost" title={t("blog.publicOffHint")}>
                  <GlobeIcon /> {t("blog.publicOff")}
                </Link>
              )
            )}
            {canEdit && (
              <button type="button" className="primary" onClick={() => void create()}>
                <PlusIcon /> {t("blog.new")}
              </button>
            )}
          </>
        }
      />

      <div className="blog-toolbar">
        <div className="segmented" role="tablist">
          {(["all", "published", "scheduled", "draft"] as const).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {t(`blog.tab.${id}`)} <span className="count">{calendar.formatNumber(counts[id])}</span>
            </button>
          ))}
        </div>
      </div>
      {tags.length > 0 && (
        <div className="tag-row filter-tags">
          {tags.map((name) => (
            <button
              key={name}
              type="button"
              className="tag"
              aria-pressed={tag === name}
              onClick={() => setTag(tag === name ? null : name)}
            >
              #{name}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <Skeleton rows={3} height={140} />
      ) : !posts.length ? (
        <EmptyState
          icon={NewspaperIcon}
          title={t("blog.empty")}
          hint={t("blog.emptyHint")}
          action={
            canEdit && (
              <button type="button" className="primary" onClick={() => void create()}>
                <PenIcon /> {t("blog.writeFirst")}
              </button>
            )
          }
        />
      ) : (
        <div className="post-grid">
          {filtered.map((post) => {
            const state = postState(post);
            return (
              <Link key={post.id} to={`/blog/${post.id}`} className="post-card" data-featured={post.featured}>
                <span className="post-cover" style={post.cover ? coverStyle(post.cover) : undefined}>
                  {!post.cover && <NewspaperIcon />}
                  <span className={`badge status-${state}`}>{t(`blog.state.${state}`)}</span>
                  {post.featured && (
                    <span className="badge featured">
                      <StarIcon /> {t("blog.featured")}
                    </span>
                  )}
                </span>
                <span className="post-body">
                  <strong dir="auto">{post.title || t("notes.untitled")}</strong>
                  {post.excerpt && (
                    <span className="muted small post-excerpt" dir="auto">
                      {post.excerpt}
                    </span>
                  )}
                  <span className="post-meta muted small">
                    <span>
                      {state === "draft"
                        ? t("blog.editedAt", { date: calendar.shortDate(post.updated_at) })
                        : calendar.shortDate(post.published_at ?? post.updated_at)}
                    </span>
                    <span>· {t("blog.minutes", { count: post.reading_minutes })}</span>
                    {post.views > 0 && (
                      <span>
                        · <EyeIcon /> {calendar.formatNumber(post.views)}
                      </span>
                    )}
                  </span>
                  {post.tags.length > 0 && (
                    <span className="tag-row">
                      {post.tags.slice(0, 3).map((name) => (
                        <span key={name} className="tag">
                          #{name}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
