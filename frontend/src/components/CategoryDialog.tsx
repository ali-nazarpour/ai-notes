/** Create or edit a category: name, emoji and color, with a live preview. */
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { categoriesApi } from "../api/endpoints";
import { queryKeys } from "../api/queries";
import { useI18n } from "../i18n";
import { errorMessage } from "../i18n/errors";
import { categoryStyle } from "../lib/palette";
import type { Category, CategoryInput } from "../types";
import { useToast } from "./Feedback";
import { TagIcon } from "./Icons";
import { Modal } from "./Modal";
import { ColorPicker } from "./ui";

const EMOJIS = [
  "📚",
  "🛒",
  "✅",
  "💼",
  "🏠",
  "💡",
  "🎯",
  "✈️",
  "💪",
  "🎨",
  "🎵",
  "❤️",
  "💰",
  "🧪",
  "📝",
  "⭐",
];

export function CategoryDialog({
  category,
  onClose,
  onSaved,
}: {
  category?: Category;
  onClose: () => void;
  onSaved?: (category: Category) => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const client = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<CategoryInput>({
    name: category?.name ?? "",
    color: category?.color ?? "teal",
    icon: category?.icon ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const input = { ...draft, name: draft.name.trim(), icon: draft.icon.trim() };
      const saved = category
        ? await categoriesApi.update(category.id, input)
        : await categoriesApi.create(input);
      await client.invalidateQueries({ queryKey: queryKeys.categories });
      toast(category ? t("settings.saved") : t("categories.created"), "success");
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(errorMessage(err, i18n));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={category ? t("categories.edit") : t("categories.new")}
      icon={TagIcon}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form="category-form"
            className="primary"
            disabled={busy || !draft.name.trim()}
          >
            {busy ? t("common.saving") : category ? t("common.save") : t("common.create")}
          </button>
        </>
      }
    >
      <form id="category-form" className="modal-split" onSubmit={submit}>
        <aside className="modal-split-aside">
          <div className="category-preview" style={categoryStyle(draft.color)}>
            <span className="category-preview-icon" aria-hidden="true">
              {draft.icon || <span className="cat-dot" />}
            </span>
            <span className="category-preview-name">
              {draft.name.trim() || t("categories.namePlaceholder")}
            </span>
          </div>
          <div className="field">
            <span className="field-label">{t("categories.color")}</span>
            <ColorPicker
              label={t("categories.color")}
              size="sm"
              value={draft.color}
              onChange={(color) => setDraft({ ...draft, color })}
            />
          </div>
        </aside>
        <div className="stack">
          <label className="field">
            <span className="field-label">{t("categories.name")}</span>
            <input
              type="text"
              data-autofocus
              maxLength={50}
              required
              placeholder={t("categories.namePlaceholder")}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>

          <div className="field">
            <span className="field-label">{t("categories.emoji")}</span>
            <div className="emoji-grid" role="radiogroup" aria-label={t("categories.emoji")}>
              <button
                type="button"
                role="radio"
                aria-checked={!draft.icon}
                className="emoji-option"
                onClick={() => setDraft({ ...draft, icon: "" })}
                title={t("categories.noEmoji")}
              >
                <span className="cat-dot" style={categoryStyle(draft.color)} />
              </button>
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  role="radio"
                  aria-checked={draft.icon === emoji}
                  className="emoji-option"
                  onClick={() => setDraft({ ...draft, icon: emoji })}
                >
                  {emoji}
                </button>
              ))}
              <input
                className="emoji-input"
                aria-label={t("categories.customEmoji")}
                placeholder="🙂"
                maxLength={8}
                value={EMOJIS.includes(draft.icon) ? "" : draft.icon}
                onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
              />
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
