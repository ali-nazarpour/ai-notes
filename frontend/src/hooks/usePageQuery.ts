/**
 * The app has one search box (in the top bar). On list pages it filters the page through
 * the `q` URL parameter; pages read it with this hook instead of having their own box.
 */
import { useSearchParams } from "react-router";

/** Lower case, Arabic ي/ك as Persian ی/ک, no zero-width joiners or diacritics. */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064a\u0649]/g, "\u06cc")
    .replace(/\u0643/g, "\u06a9")
    .replace(/\u200c|\u200d/g, "")
    .replace(/[\u064b-\u0652]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when every word of the query appears in one of the texts. */
export function matchesQuery(query: string, ...texts: (string | null | undefined)[]): boolean {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const haystack = normalizeSearch(texts.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}

export function usePageQuery(): string {
  const [params] = useSearchParams();
  return (params.get("q") ?? "").trim();
}

/** Pages whose content the top bar search filters (path patterns). */
export const SEARCH_SCOPES: { pattern: RegExp; label: string }[] = [
  { pattern: /^\/notes$/, label: "nav.notes" },
  { pattern: /^\/tasks$/, label: "nav.tasks" },
  { pattern: /^\/boards(\/\d+)?$/, label: "nav.boards" },
  { pattern: /^\/docs(\/\d+(\/\d+)?)?$/, label: "nav.docs" },
  { pattern: /^\/blog$/, label: "nav.blog" },
  { pattern: /^\/projects$/, label: "nav.projects" },
  { pattern: /^\/passwords$/, label: "nav.passwords" },
  { pattern: /^\/drive(\/.*)?$/, label: "nav.drive" },
  { pattern: /^\/slides$/, label: "nav.slides" },
  { pattern: /^\/learn(\/decks\/\d+)?$/, label: "nav.learn" },
  { pattern: /^\/admin(\/users)?$/, label: "nav.admin" },
  { pattern: /^\/trash$/, label: "nav.trash" },
  { pattern: /^\/shared$/, label: "nav.shared" },
  { pattern: /^\/alarms$/, label: "nav.alarms" },
  { pattern: /^\/search$/, label: "search.everywhere" },
];

export function searchScope(pathname: string): string | null {
  return SEARCH_SCOPES.find((scope) => scope.pattern.test(pathname))?.label ?? null;
}
