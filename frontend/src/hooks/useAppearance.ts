/**
 * Applies theme and accent color to <html>.
 *
 * Theme: data-theme="light|dark", or no attribute for "system" (a media query follows the
 * OS). Accent: the CSS variables --accent-base / --accent-on; every accent shade in the
 * stylesheet is mixed from them. The last values are cached so index.html can apply them
 * before React starts (no flash of wrong colors).
 */
import { useEffect } from "react";

import { paletteColor } from "../lib/palette";
import type { ColorName, Theme } from "../types";

function cached<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useAppearance(theme: Theme | null, accent: ColorName | null): void {
  const effectiveTheme = theme ?? cached<Theme>("notes.theme", "system");
  const effectiveAccent = accent ?? cached<ColorName>("notes.accent", "indigo");

  useEffect(() => {
    const root = document.documentElement;
    if (effectiveTheme === "light" || effectiveTheme === "dark") root.dataset.theme = effectiveTheme;
    else delete root.dataset.theme;

    const color = paletteColor(effectiveAccent);
    root.style.setProperty("--accent-base", color.hex);
    root.style.setProperty("--accent-on", color.onColor);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", effectiveTheme === "dark" ? "#0e1117" : color.hex);
    try {
      localStorage.setItem("notes.theme", JSON.stringify(effectiveTheme));
      localStorage.setItem("notes.accent", JSON.stringify(color.name));
    } catch {
      // Not critical.
    }
  }, [effectiveTheme, effectiveAccent]);
}
