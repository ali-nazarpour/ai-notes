/** Small presentational building blocks shared across pages. */
import { useRef, useState, type ReactNode } from "react";

import { useDismiss } from "../hooks/useDismiss";
import { useI18n } from "../i18n";
import { COLORS, paletteColor } from "../lib/palette";
import type { ColorName, Theme, User } from "../types";
import { CheckIcon, type IconComponent, MonitorIcon, MoonIcon, StarIcon, SunIcon } from "./Icons";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner-dot" aria-hidden="true" />
      {label}
    </div>
  );
}

export function Skeleton({ rows = 3, height = 44 }: { rows?: number; height?: number }) {
  const { t } = useI18n();
  return (
    <div className="skeleton-list" role="status" aria-label={t("common.loading")}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: EmptyIcon,
  title,
  hint,
  action,
}: {
  icon: IconComponent;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <EmptyIcon />
      </span>
      <h2>{title}</h2>
      {hint && <p className="muted">{hint}</p>}
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function fullName(user: User): string {
  return [user.first_name, user.last_name]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

export function displayName(user: User): string {
  return user.display_name.trim() || fullName(user) || user.email.split("@")[0];
}

export function initials(user: User): string {
  const source = displayName(user);
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 1)).toUpperCase();
}

export function Avatar({ user, size = "md" }: { user: User; size?: "sm" | "md" | "lg" | "xl" }) {
  const color = paletteColor(user.accent_color);
  const [broken, setBroken] = useState(false);
  if (user.avatar && !broken) {
    return (
      <img
        className={`avatar avatar-${size} avatar-image`}
        src={user.avatar}
        alt=""
        aria-hidden="true"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ background: color.hex, color: color.onColor }}
      aria-hidden="true"
    >
      {initials(user)}
    </span>
  );
}

export function FavoriteButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const label = active ? t("notes.unfavorite") : t("notes.favorite");
  return (
    <button
      type="button"
      className="icon-button favorite-button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <StarIcon filled={active} />
    </button>
  );
}

export function ColorPicker({
  value,
  onChange,
  label,
  size = "md",
}: {
  value: ColorName;
  onChange: (color: ColorName) => void;
  label: string;
  size?: "sm" | "md";
}) {
  const { t } = useI18n();
  return (
    <div
      className={`swatches swatches-${size}`}
      role="radiogroup"
      aria-label={label}
      style={{ "--cols": Math.ceil(COLORS.length / 2) } as React.CSSProperties}
    >
      {COLORS.map((color) => (
        <button
          key={color.name}
          type="button"
          role="radio"
          aria-checked={value === color.name}
          aria-label={t(`color.${color.name}`)}
          title={t(`color.${color.name}`)}
          className="swatch"
          style={{ background: color.hex, color: color.onColor }}
          onClick={() => onChange(color.name)}
        >
          {value === color.name && <CheckIcon />}
        </button>
      ))}
    </div>
  );
}

const THEME_OPTIONS: { value: Theme; icon: IconComponent }[] = [
  { value: "system", icon: MonitorIcon },
  { value: "light", icon: SunIcon },
  { value: "dark", icon: MoonIcon },
];

/** System / Light / Dark with a thumb that slides to the chosen option. */
export function ThemeSwitch({
  theme,
  onChange,
  size = "normal",
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
  size?: "compact" | "normal" | "large";
}) {
  const { t } = useI18n();
  return (
    <div
      className={`theme-switch theme-switch-${size}`}
      role="group"
      aria-label={t("settings.theme")}
      data-value={theme}
    >
      <span className="theme-thumb" aria-hidden="true" />
      {THEME_OPTIONS.map(({ value, icon: OptionIcon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          aria-label={t(`theme.${value}`)}
          title={t(`theme.${value}`)}
          onClick={() => onChange(value)}
        >
          <span className={`theme-icon theme-icon-${value}`}>
            <OptionIcon />
          </span>
          {size !== "compact" && <span className="theme-label">{t(`theme.${value}`)}</span>}
        </button>
      ))}
    </div>
  );
}

/** A button that opens a floating panel; closes on outside click or Escape. */
export function Popover({
  trigger,
  children,
  label,
  align = "start",
  className = "",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  label: string;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  return (
    <div className={`popover-anchor ${className}`} ref={ref}>
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open && (
        <div className={`popover popover-${align}`} role="dialog" aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
