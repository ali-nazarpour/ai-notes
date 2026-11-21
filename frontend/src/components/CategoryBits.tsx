/** Showing and choosing categories. Each element sets --cat; the CSS mixes tints from it. */
import { useState } from "react";

import { useI18n } from "../i18n";
import { categoryStyle } from "../lib/palette";
import type { Category } from "../types";
import { CategoryDialog } from "./CategoryDialog";
import { CheckIcon, ChevronDownIcon, PlusIcon, StarIcon } from "./Icons";
import { Popover } from "./ui";

function CategoryMark({ category }: { category: Category }) {
  return category.icon ? (
    <span aria-hidden="true">{category.icon}</span>
  ) : (
    <span className="cat-dot" aria-hidden="true" />
  );
}

export function CategoryBadge({ category }: { category: Category | undefined }) {
  if (!category) return null;
  return (
    <span className="cat-badge" style={categoryStyle(category.color)}>
      <CategoryMark category={category} />
      <span>{category.name}</span>
    </span>
  );
}

interface FilterChipsProps {
  categories: Category[];
  categoryId: number | null;
  favoritesOnly?: boolean;
  showFavorites?: boolean;
  onChange: (filter: { categoryId: number | null; favoritesOnly: boolean }) => void;
  countOf?: (category: Category) => number;
}

export function FilterChips({
  categories,
  categoryId,
  favoritesOnly = false,
  showFavorites = false,
  onChange,
  countOf,
}: FilterChipsProps) {
  const { t, calendar } = useI18n();
  return (
    <div className="chips" role="group" aria-label={t("common.filter")}>
      <button
        type="button"
        className="chip"
        aria-pressed={categoryId === null && !favoritesOnly}
        onClick={() => onChange({ categoryId: null, favoritesOnly: false })}
      >
        {t("common.all")}
      </button>
      {showFavorites && (
        <button
          type="button"
          className="chip chip-favorite"
          aria-pressed={favoritesOnly}
          onClick={() => onChange({ categoryId: null, favoritesOnly: !favoritesOnly })}
        >
          <StarIcon filled={favoritesOnly} />
          {t("notes.favorites")}
        </button>
      )}
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          className="chip chip-category"
          style={categoryStyle(category.color)}
          aria-pressed={categoryId === category.id}
          onClick={() =>
            onChange({
              categoryId: categoryId === category.id ? null : category.id,
              favoritesOnly: false,
            })
          }
        >
          <CategoryMark category={category} />
          {category.name}
          {countOf && <span className="chip-count">{calendar.formatNumber(countOf(category))}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * Compact category dropdown with a color dot (task rows, quick add, note toolbar, forms).
 * The last item creates a new category and selects it.
 */
export function CategorySelect({
  categories,
  value,
  onChange,
  canCreate = true,
}: {
  categories: Category[];
  value: number | null;
  onChange: (categoryId: number | null) => void;
  canCreate?: boolean;
}) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const current = categories.find((category) => category.id === value);
  return (
    <>
      <Popover
        label={t("common.category")}
        className="category-select"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            className="select-pill"
            style={categoryStyle(current?.color ?? "slate")}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={t("common.category")}
            title={t("common.category")}
            onClick={toggle}
          >
            {current?.icon ? (
              <span aria-hidden="true">{current.icon}</span>
            ) : (
              <span className="cat-dot" aria-hidden="true" />
            )}
            <span className="select-pill-text" dir="auto">
              {current?.name ?? t("common.noCategory")}
            </span>
            <ChevronDownIcon />
          </button>
        )}
      >
        {(close) => (
          <div className="category-menu" role="listbox" aria-label={t("common.category")}>
            {[null, ...categories].map((category) => (
              <button
                key={category?.id ?? "none"}
                type="button"
                role="option"
                aria-selected={(category?.id ?? null) === value}
                className="menu-item"
                style={categoryStyle(category?.color ?? "slate")}
                onClick={() => {
                  close();
                  onChange(category?.id ?? null);
                }}
              >
                {category?.icon ? (
                  <span className="category-menu-icon" aria-hidden="true">
                    {category.icon}
                  </span>
                ) : (
                  <span className="category-menu-icon" aria-hidden="true">
                    <span className="cat-dot" />
                  </span>
                )}
                <span className="menu-item-text" dir="auto">
                  {category?.name ?? t("common.noCategory")}
                </span>
                {(category?.id ?? null) === value && <CheckIcon />}
              </button>
            ))}
            {canCreate && (
              <>
                <div className="menu-separator" />
                <button
                  type="button"
                  className="menu-item category-menu-new"
                  onClick={() => {
                    close();
                    setCreating(true);
                  }}
                >
                  <span className="category-menu-icon" aria-hidden="true">
                    <PlusIcon />
                  </span>
                  <span className="menu-item-text">{t("categories.new")}</span>
                </button>
              </>
            )}
          </div>
        )}
      </Popover>
      {creating && (
        <CategoryDialog onClose={() => setCreating(false)} onSaved={(saved) => onChange(saved.id)} />
      )}
    </>
  );
}
