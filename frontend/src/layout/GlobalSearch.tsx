/**
 * The app's only search: a wide box in the top bar that opens a search window (like the
 * Tailwind CSS docs). It searches every section of the workspace on the server, plus
 * pages and actions of the app and — while the password manager is unlocked — the names
 * of saved passwords. On list pages, the first result filters that page (the `q` URL
 * parameter). Open with a click, Ctrl/⌘+K or "/". Arrow keys move, Enter opens.
 */
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useSearchParams } from "react-router";

import { searchApi } from "../api/v5";
import {
  AlarmIcon,
  ClockRecentIcon,
  CloseIcon,
  DriveIcon,
  FilterIcon,
  KeyIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SlidesIcon,
  TrashIcon,
  ShareIcon,
} from "../components/Icons";
import { useCreateNote } from "../features/notes/useCreateNote";
import { vaultHints } from "../features/vault/vaultHints";
import { matchesQuery, normalizeSearch, searchScope } from "../hooks/usePageQuery";
import { useI18n, type TranslationKey } from "../i18n";
import { SEARCH_KINDS } from "../lib/searchKinds";
import { useAccounts } from "../store/accounts";
import { useVaultKey } from "../store/vaultSession";
import type { SearchResult } from "../types5";
import { PAGES } from "./Navigation";

export const SEARCH_INPUT_ID = "global-search";
const OPEN_EVENT = "app:open-search";
const RECENT_KEY = "search.recent";

/** Opens the search window from anywhere (keyboard shortcuts, buttons). */
export function openSearch(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Groups results by kind, keeping the server's order (the most relevant section first). */
export function groupResults(results: SearchResult[]): [string, SearchResult[]][] {
  const groups = new Map<string, SearchResult[]>();
  for (const result of results) groups.set(result.kind, [...(groups.get(result.kind) ?? []), result]);
  return [...groups.entries()];
}

/** Highlights the words of the query inside a text (ignoring Persian letter variants). */
export function Highlight({ text, query }: { text: string; query: string }) {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (!words.length || !text) return <>{text}</>;
  const lower = normalizeSearch(text).length === text.length ? normalizeSearch(text) : text.toLowerCase();
  const marks: [number, number][] = [];
  for (const word of words) {
    let from = 0;
    for (;;) {
      const index = lower.indexOf(word, from);
      if (index < 0) break;
      marks.push([index, index + word.length]);
      from = index + word.length;
    }
  }
  if (!marks.length) return <>{text}</>;
  marks.sort((a, b) => a[0] - b[0]);
  const parts: ReactNode[] = [];
  let last = 0;
  marks.forEach(([start, end], i) => {
    if (start < last) return;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(<mark key={i}>{text.slice(start, end)}</mark>);
    last = end;
  });
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function saveRecent(query: string): void {
  const list = [query, ...readRecent().filter((q) => q !== query)].slice(0, 6);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private mode */
  }
}

interface Item {
  key: string;
  group: string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  hint?: string;
  run: () => void;
  removable?: () => void;
}

export function GlobalSearch() {
  const { t } = useI18n();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const scope = searchScope(location.pathname);
  const filter = scope ? (params.get("q") ?? "") : "";
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    const show = () => setOpen(true);
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener(OPEN_EVENT, show);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, show);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const placeholder = scope
    ? t("search.placeholderIn", { section: t(scope as TranslationKey) })
    : t("search.placeholderAll");

  return (
    <div className="global-search">
      <button
        type="button"
        id={SEARCH_INPUT_ID}
        className="search-box search-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <SearchIcon />
        {filter ? (
          <span className="search-trigger-filter" dir="auto">
            <FilterIcon /> {filter}
          </span>
        ) : (
          <span className="search-trigger-text">{placeholder}</span>
        )}
        {filter ? (
          <span
            role="button"
            tabIndex={0}
            className="icon-button small search-trigger-clear"
            aria-label={t("search.clear")}
            onClick={(event) => {
              event.stopPropagation();
              const next = new URLSearchParams(params);
              next.delete("q");
              setParams(next, { replace: true });
            }}
          >
            <CloseIcon />
          </span>
        ) : (
          <kbd className="kbd-hint search-kbd" aria-hidden="true">
            {isMac ? "⌘" : "Ctrl"} K
          </kbd>
        )}
      </button>
      {open && <SearchPalette initial={filter} scope={scope} onClose={() => setOpen(false)} />}
    </div>
  );
}

function SearchPalette({
  initial,
  scope,
  onClose,
}: {
  initial: string;
  scope: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { createNote } = useCreateNote();
  const userId = useAccounts().active?.user.id ?? 0;
  const vaultKey = useVaultKey(userId);
  const [value, setValue] = useState(initial);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(readRecent);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const query = useDebounced(value.trim(), 180);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["global-search", query],
    queryFn: ({ signal }) => searchApi.all(query, 6, signal),
    enabled: query.length > 0,
    staleTime: 15_000,
  });
  const { data: vault = [] } = useQuery({
    queryKey: ["search-vault", userId, !!vaultKey],
    queryFn: () => vaultHints(vaultKey),
    enabled: !!vaultKey,
    staleTime: 30_000,
  });

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  const go = useCallback(
    (url: string, remember = true) => {
      if (remember && value.trim()) saveRecent(value.trim());
      onClose();
      navigate(url);
    },
    [navigate, onClose, value],
  );

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const text = value.trim();
    const pages = [
      ...PAGES.map((p) => ({ to: p.to, label: t(p.label), icon: <p.icon /> })),
      { to: "/shared", label: t("nav.shared"), icon: <ShareIcon /> },
      { to: "/trash", label: t("nav.trash"), icon: <TrashIcon /> },
      { to: "/settings", label: t("nav.settings"), icon: <SettingsIcon /> },
    ];
    const actions: Item[] = [
      {
        key: "a-note",
        group: t("search.actions"),
        icon: <PlusIcon />,
        title: t("notes.new"),
        hint: "N",
        run: () => {
          onClose();
          createNote();
        },
      },
      {
        key: "a-alarm",
        group: t("search.actions"),
        icon: <AlarmIcon />,
        title: t("alarms.new"),
        run: () => go("/alarms?new=1", false),
      },
      {
        key: "a-deck",
        group: t("search.actions"),
        icon: <SlidesIcon />,
        title: t("slides.blank"),
        run: () => go("/slides", false),
      },
      {
        key: "a-upload",
        group: t("search.actions"),
        icon: <DriveIcon />,
        title: t("drive.uploadFiles"),
        run: () => go("/drive", false),
      },
    ];

    if (!text) {
      recent.forEach((q) =>
        out.push({
          key: `r-${q}`,
          group: t("search.recent"),
          icon: <ClockRecentIcon />,
          title: q,
          run: () => setValue(q),
          removable: () => {
            const next = recent.filter((r) => r !== q);
            setRecent(next);
            try {
              localStorage.setItem(RECENT_KEY, JSON.stringify(next));
            } catch {
              /* ignore */
            }
          },
        }),
      );
      out.push(...actions);
      pages.forEach((p) =>
        out.push({
          key: `p-${p.to}`,
          group: t("search.goTo"),
          icon: p.icon,
          title: p.label,
          run: () => go(p.to, false),
        }),
      );
      return out;
    }

    if (scope) {
      out.push({
        key: "filter",
        group: t("search.thisPage"),
        icon: <FilterIcon />,
        title: t("search.filterPage", { section: t(scope as TranslationKey), query: text }),
        run: () => {
          saveRecent(text);
          const next = new URLSearchParams(params);
          next.set("q", text);
          setParams(next, { replace: location.search.includes("q=") });
          onClose();
        },
      });
    }
    groupResults(results).forEach(([kind, hits]) => {
      const meta = SEARCH_KINDS[kind];
      const KindIcon = meta?.icon ?? SearchIcon;
      hits.forEach((hit) =>
        out.push({
          key: `${kind}-${hit.id}`,
          group: meta ? t(meta.label) : kind,
          icon: hit.icon ? <span className="search-emoji">{hit.icon}</span> : <KindIcon />,
          title: hit.title || t("notes.untitled"),
          subtitle: hit.snippet && hit.snippet !== hit.title ? hit.snippet : undefined,
          run: () => go(hit.url),
        }),
      );
    });
    vault
      .filter((v) => matchesQuery(text, v.title, v.username, v.url, v.folder))
      .slice(0, 5)
      .forEach((v) =>
        out.push({
          key: `v-${v.id}`,
          group: t("nav.passwords"),
          icon: <KeyIcon />,
          title: v.title,
          subtitle: [v.username, v.url].filter(Boolean).join(" · "),
          run: () => go(`/passwords?q=${encodeURIComponent(v.title)}`),
        }),
      );
    [
      ...actions,
      ...pages.map((p) => ({
        key: `p-${p.to}`,
        group: t("search.goTo"),
        icon: p.icon,
        title: p.label,
        run: () => go(p.to, false),
      })),
    ]
      .filter((item) => matchesQuery(text, item.title))
      .forEach((item) => out.push(item));
    return out;
  }, [value, results, vault, recent, scope, params, setParams, location.search, t, go, onClose, createNote]);

  useEffect(() => setActive(0), [value, results.length]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const searching = value.trim().length > 0 && (isFetching || query !== value.trim());
  const groups: [string, (Item & { index: number })[]][] = [];
  items.forEach((item, index) => {
    const last = groups[groups.length - 1];
    if (last && last[0] === item.group) last[1].push({ ...item, index });
    else groups.push([item.group, [{ ...item, index }]]);
  });

  return createPortal(
    <div
      className="palette-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label={t("search.title")}>
        <div className="palette-input">
          <SearchIcon />
          <input
            ref={input}
            type="search"
            dir="auto"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `palette-${active}` : undefined}
            placeholder={t("search.paletteHint")}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((i) => (items.length ? (i + 1) % items.length : 0));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (items[active]) items[active].run();
                else if (value.trim()) go(`/search?q=${encodeURIComponent(value.trim())}`);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
          />
          {searching && <span className="palette-spinner" aria-hidden="true" />}
          <button type="button" className="palette-esc" onClick={onClose}>
            Esc
          </button>
        </div>
        <div className="palette-body" id="palette-list" role="listbox" ref={list}>
          {groups.map(([group, groupItems]) => (
            <section key={group} className="palette-group">
              <h3>{group}</h3>
              {groupItems.map((item) => (
                <div
                  key={item.key}
                  id={`palette-${item.index}`}
                  data-index={item.index}
                  role="option"
                  aria-selected={active === item.index}
                  className="palette-item"
                  onMouseMove={() => setActive(item.index)}
                  onClick={() => item.run()}
                >
                  <span className="palette-item-icon">{item.icon}</span>
                  <span className="palette-item-text">
                    <strong dir="auto">
                      <Highlight text={item.title} query={value} />
                    </strong>
                    {item.subtitle && (
                      <span dir="auto">
                        <Highlight text={item.subtitle} query={value} />
                      </span>
                    )}
                  </span>
                  {item.removable ? (
                    <button
                      type="button"
                      className="icon-button small palette-remove"
                      aria-label={t("common.delete")}
                      onClick={(event) => {
                        event.stopPropagation();
                        item.removable?.();
                      }}
                    >
                      <CloseIcon />
                    </button>
                  ) : (
                    <span className="palette-enter" aria-hidden="true">
                      ↵
                    </span>
                  )}
                </div>
              ))}
            </section>
          ))}
          {value.trim() && !searching && !results.length && !items.some((i) => i.key.startsWith("v-")) && (
            <div className="palette-empty">
              <SearchIcon />
              <p>{t("search.noResultsFor", { query: value.trim() })}</p>
              <span className="muted small">{t("search.nothingHint")}</span>
            </div>
          )}
        </div>
        <footer className="palette-foot">
          <span>
            <kbd>↵</kbd> {t("search.keySelect")}
          </span>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t("search.keyMove")}
          </span>
          <span>
            <kbd>Esc</kbd> {t("search.keyClose")}
          </span>
          {value.trim() && (
            <button
              type="button"
              className="palette-all"
              onClick={() => go(`/search?q=${encodeURIComponent(value.trim())}`)}
            >
              {t("search.seeAll", { query: value.trim() })}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
