/** Desktop sidebar (collapsible) and phone bottom navigation with a "More" sheet. */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link, NavLink, useLocation, useSearchParams } from "react-router";

import { useCategories } from "../api/queries";
import { CategoryDialog } from "../components/CategoryDialog";
import {
  AlarmIcon,
  BoardIcon,
  BookIcon,
  BotIcon,
  CalendarIcon,
  CheckCircleIcon,
  CollapseIcon,
  DriveIcon,
  GraduationIcon,
  HomeIcon,
  type IconComponent,
  KeyIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  MoreIcon,
  NotesIcon,
  PenIcon,
  PlusIcon,
  RocketIcon,
  SettingsIcon,
  ShareIcon,
  ShieldUserIcon,
  SlidesIcon,
  TrashIcon,
} from "../components/Icons";
import { WorkspaceSwitcher } from "../features/workspace/WorkspaceSwitcher";
import { useAccounts } from "../store/accounts";
import { ThemeSwitch } from "../components/ui";
import { useI18n, type TranslationKey } from "../i18n";
import { categoryStyle } from "../lib/palette";
import type { Theme } from "../types";

interface Page {
  to: string;
  label: TranslationKey;
  icon: IconComponent;
  end?: boolean;
}

export const PAGES: Page[] = [
  { to: "/", label: "nav.home", icon: HomeIcon, end: true },
  { to: "/notes", label: "nav.notes", icon: NotesIcon },
  { to: "/tasks", label: "nav.tasks", icon: CheckCircleIcon },
  { to: "/boards", label: "nav.boards", icon: BoardIcon },
  { to: "/docs", label: "nav.docs", icon: BookIcon },
  { to: "/projects", label: "nav.projects", icon: RocketIcon },
  { to: "/blog", label: "nav.blog", icon: PenIcon },
  { to: "/slides", label: "nav.slides", icon: SlidesIcon },
  { to: "/learn", label: "nav.learn", icon: GraduationIcon },
  { to: "/calendar", label: "nav.calendar", icon: CalendarIcon },
  { to: "/passwords", label: "nav.passwords", icon: KeyIcon },
  { to: "/alarms", label: "nav.alarms", icon: AlarmIcon },
  // Drive is second to last and the chatbot last (users can reorder by dragging).
  { to: "/drive", label: "nav.drive", icon: DriveIcon },
  // The chatbot is always the last page.
  { to: "/chat", label: "nav.ask", icon: BotIcon },
];

const ORDER_KEY = "nav.order";

/**
 * The sidebar pages in the user's own order (dragged in the sidebar, kept in this browser).
 * Pages added in later versions appear at their default place.
 */
export function usePageOrder(userId: number): [Page[], (order: string[] | null) => void, boolean] {
  const key = `${ORDER_KEY}.${userId}`;
  const [stored, setStored] = useState<string[] | null>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      return null;
    }
  });
  const pages = useMemo(() => {
    if (!stored) return PAGES;
    const known = stored.filter((to) => PAGES.some((p) => p.to === to));
    const result = known.map((to) => PAGES.find((p) => p.to === to)!);
    PAGES.forEach((page, index) => {
      if (!known.includes(page.to)) result.splice(Math.min(index, result.length), 0, page);
    });
    return result;
  }, [stored]);
  const setOrder = useCallback(
    (order: string[] | null) => {
      setStored(order);
      try {
        if (order) localStorage.setItem(key, JSON.stringify(order));
        else localStorage.removeItem(key);
      } catch {
        /* private mode */
      }
    },
    [key],
  );
  return [pages, setOrder, stored !== null];
}

/** The click that ends a drag must not open the page under the pointer. */
function suppressNextClick() {
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 400);
}

const restrictToVertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

function SortableNavLink({
  id,
  to,
  end,
  title,
  dragHint,
  active,
  onClickCapture,
  children,
}: {
  id: string;
  to: string;
  end?: boolean;
  title: string;
  dragHint: string;
  active: (isActive: boolean) => boolean;
  onClickCapture: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <NavLink
      ref={setNodeRef}
      to={to}
      end={end}
      draggable={false}
      className={({ isActive }) => (active(isActive) ? "nav-item active" : "nav-item")}
      title={`${title} — ${dragHint}`}
      data-dragging={isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClickCapture={onClickCapture}
      {...attributes}
      {...listeners}
      role="link"
    >
      {children}
    </NavLink>
  );
}

/** Phones show four pages in the bar; the rest live in the "More" sheet. */
const PHONE_BAR = ["/", "/notes", "/tasks", "/boards"];

interface SidebarProps {
  collapsed: boolean;
  theme: Theme;
  openTaskCount: number;
  onToggleCollapsed: () => void;
  onNewNote: () => void;
  onThemeChange: (theme: Theme) => void;
}

export function Sidebar({
  collapsed,
  theme,
  openTaskCount,
  onToggleCollapsed,
  onNewNote,
  onThemeChange,
}: SidebarProps) {
  const { t, calendar } = useI18n();
  const { data: categories = [] } = useCategories();
  const location = useLocation();
  const [params] = useSearchParams();
  const activeCategory = location.pathname === "/notes" ? params.get("category") : null;
  const [addingCategory, setAddingCategory] = useState(false);
  const isAdmin = useAccounts().active?.user.is_admin ?? false;
  const userId = useAccounts().active?.user.id ?? 0;
  const [pages, setOrder, customOrder] = usePageOrder(userId);
  // When the last drag ended: the click that ends a drag must not open the page.
  const dragged = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <aside className="sidebar" aria-label={t("nav.sidebar")}>
      <div className="sidebar-header">
        <WorkspaceSwitcher collapsed={collapsed} />
        <button
          type="button"
          className="icon-button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          aria-expanded={!collapsed}
          title={collapsed ? t("nav.expand") : t("nav.collapse")}
        >
          <CollapseIcon />
        </button>
      </div>

      <button type="button" className="primary new-note" onClick={onNewNote} title={t("notes.new")}>
        <PlusIcon />
        <span className="label">{t("notes.new")}</span>
      </button>

      <nav className="nav" aria-label={t("nav.pages")}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVertical]}
          onDragStart={() => (dragged.current = Infinity)}
          onDragCancel={() => {
            dragged.current = Date.now();
            suppressNextClick();
          }}
          onDragEnd={(event) => {
            dragged.current = Date.now();
            suppressNextClick();
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const ids = pages.map((p) => p.to);
            setOrder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
          }}
        >
          <SortableContext items={pages.map((p) => p.to)} strategy={verticalListSortingStrategy}>
            {pages.map(({ to, label, icon: PageIcon, end }) => (
              <SortableNavLink
                key={to}
                id={to}
                to={to}
                end={end}
                title={t(label)}
                dragHint={t("nav.dragHint")}
                active={(isActive) => isActive && !(to === "/notes" && activeCategory)}
                onClickCapture={(event) => {
                  // A drag ends with a click on the item; do not follow the link then.
                  if (Date.now() - dragged.current < 400) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
              >
                <PageIcon />
                <span className="label">{t(label)}</span>
                {to === "/tasks" && openTaskCount > 0 && (
                  <span className="nav-count label">{calendar.formatNumber(openTaskCount)}</span>
                )}
              </SortableNavLink>
            ))}
          </SortableContext>
        </DndContext>
        {customOrder && !collapsed && (
          <button type="button" className="nav-reset label" onClick={() => setOrder(null)}>
            {t("nav.resetOrder")}
          </button>
        )}
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-heading-row">
          <p className="sidebar-heading label">{t("nav.categories")}</p>
          <button
            type="button"
            className="icon-button small sidebar-add"
            onClick={() => setAddingCategory(true)}
            aria-label={t("categories.new")}
            title={t("categories.new")}
          >
            <PlusIcon />
          </button>
        </div>
        <div className="nav">
          {categories.map((category) => (
            <Link
              key={category.id}
              to={`/notes?category=${category.id}`}
              className={
                activeCategory === String(category.id)
                  ? "nav-item nav-category active"
                  : "nav-item nav-category"
              }
              aria-current={activeCategory === String(category.id) ? "page" : undefined}
              style={categoryStyle(category.color)}
              title={category.name}
            >
              <span className="nav-cat-icon" aria-hidden="true">
                {category.icon || <span className="cat-dot" />}
              </span>
              <span className="label" dir="auto">
                {category.name}
              </span>
              <span className="nav-count label">{calendar.formatNumber(category.note_count)}</span>
            </Link>
          ))}
          {!categories.length && (
            <button
              type="button"
              className="nav-item nav-add-category"
              onClick={() => setAddingCategory(true)}
            >
              <PlusIcon />
              <span className="label">{t("categories.new")}</span>
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        <NavLink
          to="/shared"
          className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
          title={t("nav.shared")}
        >
          <ShareIcon />
          <span className="label">{t("nav.shared")}</span>
        </NavLink>
        <NavLink
          to="/trash"
          className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
          title={t("nav.trash")}
        >
          <TrashIcon />
          <span className="label">{t("nav.trash")}</span>
        </NavLink>
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
            title={t("nav.admin")}
          >
            <ShieldUserIcon />
            <span className="label">{t("nav.admin")}</span>
          </NavLink>
        )}
        <NavLink
          to="/settings"
          className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
          title={t("nav.settings")}
        >
          <SettingsIcon />
          <span className="label">{t("nav.settings")}</span>
        </NavLink>
        {collapsed ? (
          <ThemeCycle theme={theme} onChange={onThemeChange} />
        ) : (
          <ThemeSwitch theme={theme} onChange={onThemeChange} />
        )}
      </div>

      {addingCategory && <CategoryDialog onClose={() => setAddingCategory(false)} />}
    </aside>
  );
}

const THEME_ORDER: Theme[] = ["system", "light", "dark"];
const THEME_ICON: Record<Theme, IconComponent> = { system: MonitorIcon, light: SunIcon, dark: MoonIcon };

/** Collapsed sidebar: one button that cycles system → light → dark. */
function ThemeCycle({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const { t } = useI18n();
  const Icon = THEME_ICON[theme];
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
  return (
    <button
      type="button"
      className="icon-button theme-cycle"
      onClick={() => onChange(next)}
      title={`${t(`theme.${theme}`)} → ${t(`theme.${next}`)}`}
      aria-label={t(`theme.${next}`)}
    >
      <Icon />
    </button>
  );
}

export function BottomNav({ onQuickAdd }: { onQuickAdd: () => void }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  // Pages with their own input at the bottom (chat, editor, boards) hide the button.
  const isAdmin = useAccounts().active?.user.is_admin ?? false;
  const [ordered] = usePageOrder(useAccounts().active?.user.id ?? 0);
  const showFab = ![
    "/chat",
    "/notes/",
    "/boards/",
    "/passwords",
    "/docs/",
    "/blog/",
    "/projects/",
    "/admin",
  ].some((prefix) => pathname.startsWith(prefix));
  const barPages = PAGES.filter((page) => PHONE_BAR.includes(page.to));
  const morePages: Page[] = [
    ...ordered.filter((page) => !PHONE_BAR.includes(page.to) && page.to !== "/chat"),
    { to: "/shared", label: "nav.shared" as TranslationKey, icon: ShareIcon },
    { to: "/trash", label: "nav.trash" as TranslationKey, icon: TrashIcon },
    ...(isAdmin ? [{ to: "/admin", label: "nav.admin" as TranslationKey, icon: ShieldUserIcon }] : []),
    { to: "/settings", label: "nav.settings", icon: SettingsIcon },
    // The chatbot stays last here too.
    { to: "/chat", label: "nav.ask", icon: BotIcon },
  ];
  const moreActive = morePages.some((page) => pathname.startsWith(page.to));

  return (
    <>
      {showFab && (
        <button type="button" className="fab" onClick={onQuickAdd} aria-label={t("quickAdd.title")}>
          <PlusIcon />
        </button>
      )}
      <nav className="bottom-nav" aria-label={t("nav.pages")}>
        {barPages.map(({ to, label, icon: PageIcon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => (isActive ? "bottom-item active" : "bottom-item")}
          >
            <PageIcon />
            <span>{t(label)}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={moreActive ? "bottom-item active" : "bottom-item"}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <MoreIcon />
          <span>{t("nav.more")}</span>
        </button>
      </nav>

      {moreOpen && (
        <div
          className="overlay sheet-overlay"
          onMouseDown={(event) => event.target === event.currentTarget && setMoreOpen(false)}
        >
          <div className="sheet more-sheet" role="dialog" aria-label={t("nav.more")}>
            <div className="sheet-handle" aria-hidden="true" />
            <div className="more-grid">
              {morePages.map(({ to, label, icon: PageIcon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => (isActive ? "more-item active" : "more-item")}
                  onClick={() => setMoreOpen(false)}
                >
                  <span className="more-icon">
                    <PageIcon />
                  </span>
                  <span>{t(label)}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
