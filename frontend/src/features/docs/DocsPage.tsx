/** Documentation spaces: a grid of "books", search, and a wide "new documentation" dialog. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { useCategories } from "../../api/queries";
import { aiToolsApi, docsApi } from "../../api/v4";
import { CategorySelect } from "../../components/CategoryBits";
import { useToast } from "../../components/Feedback";
import { BookIcon, PlusIcon, SparkleIcon, StarIcon } from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { ColorPicker, EmptyState, PageHeader, Skeleton } from "../../components/ui";
import { matchesQuery, usePageQuery } from "../../hooks/usePageQuery";
import { useI18n, type TranslationKey } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { categoryStyle } from "../../lib/palette";
import type { ColorName } from "../../types";
import type { DocSpaceSummary, DocTemplate } from "../../types4";
import { useWorkspace } from "../workspace/WorkspaceContext";

export const docsKey = ["docs"] as const;

const TEMPLATES: { id: DocTemplate; label: TranslationKey; hint: TranslationKey }[] = [
  { id: "guide", label: "docs.template.guide", hint: "docs.template.guideHint" },
  { id: "api", label: "docs.template.api", hint: "docs.template.apiHint" },
  { id: "handbook", label: "docs.template.handbook", hint: "docs.template.handbookHint" },
  { id: "blank", label: "docs.template.blank", hint: "docs.template.blankHint" },
];
const ICONS = ["📘", "📗", "📙", "📕", "⚛️", "🐍", "🧩", "🛠️", "🚀", "📐", "🧠", "🌐"];

export function DocsPage() {
  const { t, calendar, plural } = useI18n();
  const { canEdit } = useWorkspace();
  const { data: spaces = [], isLoading } = useQuery({ queryKey: docsKey, queryFn: docsApi.list });
  const { data: categories = [] } = useCategories();
  const query = usePageQuery();
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    return spaces.filter((s) => matchesQuery(query, s.title, s.description, s.tags.join(" ")));
  }, [spaces, query]);

  return (
    <div className="page docs-page">
      <PageHeader
        title={t("nav.docs")}
        subtitle={t("docs.subtitle")}
        actions={
          canEdit && (
            <button type="button" className="primary" onClick={() => setCreating(true)}>
              <PlusIcon /> {t("docs.new")}
            </button>
          )
        }
      />
      {isLoading ? (
        <Skeleton rows={3} height={120} />
      ) : !spaces.length ? (
        <EmptyState
          icon={BookIcon}
          title={t("docs.empty")}
          hint={t("docs.emptyHint")}
          action={
            canEdit && (
              <button type="button" className="primary" onClick={() => setCreating(true)}>
                <PlusIcon /> {t("docs.new")}
              </button>
            )
          }
        />
      ) : (
        <div className="book-grid">
          {filtered.map((space) => (
            <Link
              key={space.id}
              to={`/docs/${space.id}`}
              className="book-card"
              style={categoryStyle(space.color)}
            >
              <span className="book-spine" aria-hidden="true" />
              <span className="book-icon" aria-hidden="true">
                {space.icon || "📘"}
              </span>
              <span className="book-body">
                <strong dir="auto">
                  {space.title} {space.starred && <StarIcon />}
                </strong>
                {space.description && (
                  <span className="muted small book-description" dir="auto">
                    {space.description}
                  </span>
                )}
                <span className="book-meta">
                  <span>{plural("docs.pages", space.page_count)}</span>
                  {space.version && <span className="chip small">v{space.version}</span>}
                  {categories.find((c) => c.id === space.category_id) && (
                    <span className="chip small">
                      {categories.find((c) => c.id === space.category_id)?.name}
                    </span>
                  )}
                </span>
                {space.tags.length > 0 && (
                  <span className="tag-row">
                    {space.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="tag">
                        #{tag}
                      </span>
                    ))}
                  </span>
                )}
                <span className="muted small">
                  {t("docs.updated", { date: calendar.shortDate(space.updated_at) })}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {creating && <CreateDocDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateDocDialog({ onClose }: { onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { data: categories = [] } = useCategories();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("📘");
  const [color, setColor] = useState<ColorName>("blue");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tags, setTags] = useState("");
  const [template, setTemplate] = useState<DocTemplate>("guide");
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const space = await docsApi.create({
        title: title.trim(),
        description,
        icon,
        color,
        category_id: categoryId,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        template: useAi ? "blank" : template,
      });
      if (useAi) {
        const plan = await aiToolsApi.generate({
          kind: "doc_pages",
          text: `${title}\n${description}`,
          count: 8,
        });
        if (plan.items.length) {
          await docsApi.createPages(
            space.id,
            null,
            plan.items.map((item) => ({
              title: item.title,
              content: item.detail,
              body: {
                type: "doc",
                content: [
                  { type: "paragraph", content: item.detail ? [{ type: "text", text: item.detail }] : [] },
                ],
              },
            })),
          );
        }
      }
      await client.invalidateQueries({ queryKey: docsKey });
      toast(t("docs.created"), "success");
      navigate(`/docs/${space.id}`);
    } catch (err) {
      setError(errorMessage(err, i18n));
      setBusy(false);
    }
  }

  const preview: DocSpaceSummary = {
    id: 0,
    title: title || t("docs.titlePlaceholder"),
    description,
    icon,
    color,
    cover: null,
    category_id: categoryId,
    tags: tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    version: "",
    starred: false,
    page_count: 0,
    created_at: "",
    updated_at: "",
  };

  return (
    <Modal
      title={t("docs.new")}
      icon={BookIcon}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" form="doc-form" className="primary" disabled={busy || !title.trim()}>
            {busy ? (useAi ? t("ai.thinking") : t("common.saving")) : t("common.create")}
          </button>
        </>
      }
    >
      <form id="doc-form" className="modal-split" onSubmit={submit}>
        <aside className="modal-split-aside">
          <div className="book-card preview" style={categoryStyle(color)}>
            <span className="book-spine" aria-hidden="true" />
            <span className="book-icon">{icon}</span>
            <span className="book-body">
              <strong dir="auto">{preview.title}</strong>
              <span className="muted small" dir="auto">
                {description || t("docs.descriptionPlaceholder")}
              </span>
              {preview.tags.length > 0 && (
                <span className="tag-row">
                  {preview.tags.map((tag) => (
                    <span key={tag} className="tag">
                      #{tag}
                    </span>
                  ))}
                </span>
              )}
            </span>
          </div>
          <div className="field">
            <span className="field-label">{t("categories.emoji")}</span>
            <div className="emoji-grid">
              {ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="emoji-option"
                  aria-pressed={icon === emoji}
                  onClick={() => setIcon(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">{t("categories.color")}</span>
            <ColorPicker label={t("categories.color")} size="sm" value={color} onChange={setColor} />
          </div>
        </aside>
        <div className="stack">
          <label className="field">
            <span className="field-label">{t("docs.title")}</span>
            <input
              data-autofocus
              required
              maxLength={120}
              placeholder={t("docs.titlePlaceholder")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">{t("docs.description")}</span>
            <textarea
              rows={2}
              maxLength={500}
              placeholder={t("docs.descriptionPlaceholder")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="form-grid">
            <div className="field">
              <span className="field-label">{t("common.category")}</span>
              <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
            </div>
            <label className="field">
              <span className="field-label">{t("docs.tags")}</span>
              <input
                value={tags}
                placeholder={t("docs.tagsPlaceholder")}
                onChange={(event) => setTags(event.target.value)}
              />
            </label>
          </div>
          <div className="field">
            <span className="field-label">{t("docs.startWith")}</span>
            <div className="template-grid">
              <button
                type="button"
                className="template-option ai"
                aria-pressed={useAi}
                onClick={() => setUseAi(true)}
              >
                <strong>
                  <SparkleIcon /> {t("docs.template.ai")}
                </strong>
                <span className="muted small">{t("docs.template.aiHint")}</span>
              </button>
              {TEMPLATES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="template-option"
                  aria-pressed={!useAi && template === item.id}
                  onClick={() => {
                    setUseAi(false);
                    setTemplate(item.id);
                  }}
                >
                  <strong>{t(item.label)}</strong>
                  <span className="muted small">{t(item.hint)}</span>
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
