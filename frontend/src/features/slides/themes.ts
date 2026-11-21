/** Presentation themes, slide helpers and the backgrounds a slide can have. */
import type { CSSProperties } from "react";

import type { TranslationKey } from "../../i18n";
import { GRADIENTS } from "../../lib/covers";
import type { Slide, SlideLayout, SlideTheme } from "../../types5";

export interface ThemeSpec {
  label: TranslationKey;
  background: string;
  text: string;
  muted: string;
  accent: string;
  surface: string;
  font: string;
  /** Solid colors for PowerPoint, which cannot draw CSS gradients. */
  pptx: { background: string; text: string; accent: string };
}

const SANS = "'Vazirmatn Variable', 'Inter', system-ui, sans-serif";
const SERIF = "Georgia, 'Vazirmatn Variable', serif";

export const THEMES: Record<SlideTheme, ThemeSpec> = {
  aurora: {
    label: "slides.theme.aurora",
    background: "linear-gradient(135deg, #0f172a 0%, #312e81 55%, #0e7490 100%)",
    text: "#f8fafc",
    muted: "#cbd5e1",
    accent: "#5eead4",
    surface: "rgba(255,255,255,0.08)",
    font: SANS,
    pptx: { background: "1E1B4B", text: "F8FAFC", accent: "5EEAD4" },
  },
  midnight: {
    label: "slides.theme.midnight",
    background: "radial-gradient(circle at 80% 0%, #1e293b 0%, #020617 70%)",
    text: "#e2e8f0",
    muted: "#94a3b8",
    accent: "#f59e0b",
    surface: "rgba(148,163,184,0.12)",
    font: SANS,
    pptx: { background: "020617", text: "E2E8F0", accent: "F59E0B" },
  },
  paper: {
    label: "slides.theme.paper",
    background: "linear-gradient(180deg, #fffdf7 0%, #f6f1e7 100%)",
    text: "#1f2937",
    muted: "#6b7280",
    accent: "#b45309",
    surface: "rgba(180,83,9,0.07)",
    font: SERIF,
    pptx: { background: "FBF8F1", text: "1F2937", accent: "B45309" },
  },
  sunset: {
    label: "slides.theme.sunset",
    background: "linear-gradient(135deg, #ff9a56 0%, #ff5e62 45%, #7b1fa2 100%)",
    text: "#ffffff",
    muted: "#ffe4e6",
    accent: "#fff3b0",
    surface: "rgba(255,255,255,0.14)",
    font: SANS,
    pptx: { background: "E0475B", text: "FFFFFF", accent: "FFF3B0" },
  },
  forest: {
    label: "slides.theme.forest",
    background: "linear-gradient(135deg, #0b3d2e 0%, #14532d 50%, #3f6212 100%)",
    text: "#f0fdf4",
    muted: "#bbf7d0",
    accent: "#facc15",
    surface: "rgba(255,255,255,0.1)",
    font: SANS,
    pptx: { background: "14532D", text: "F0FDF4", accent: "FACC15" },
  },
  ocean: {
    label: "slides.theme.ocean",
    background: "linear-gradient(160deg, #e0f2fe 0%, #bae6fd 40%, #7dd3fc 100%)",
    text: "#0c4a6e",
    muted: "#0369a1",
    accent: "#0284c7",
    surface: "rgba(255,255,255,0.55)",
    font: SANS,
    pptx: { background: "E0F2FE", text: "0C4A6E", accent: "0284C7" },
  },
  mono: {
    label: "slides.theme.mono",
    background: "#ffffff",
    text: "#111111",
    muted: "#666666",
    accent: "#111111",
    surface: "#f4f4f5",
    font: SANS,
    pptx: { background: "FFFFFF", text: "111111", accent: "111111" },
  },
  candy: {
    label: "slides.theme.candy",
    background: "linear-gradient(135deg, #fdf2f8 0%, #ede9fe 50%, #e0f2fe 100%)",
    text: "#3b0764",
    muted: "#7e22ce",
    accent: "#db2777",
    surface: "rgba(255,255,255,0.6)",
    font: SANS,
    pptx: { background: "F5EEFC", text: "3B0764", accent: "DB2777" },
  },
};

export const THEME_IDS = Object.keys(THEMES) as SlideTheme[];

export const LAYOUTS: { id: SlideLayout; label: TranslationKey }[] = [
  { id: "title", label: "slides.layout.title" },
  { id: "content", label: "slides.layout.content" },
  { id: "two", label: "slides.layout.two" },
  { id: "image", label: "slides.layout.image" },
  { id: "image-text", label: "slides.layout.imageText" },
  { id: "quote", label: "slides.layout.quote" },
  { id: "section", label: "slides.layout.section" },
  { id: "blank", label: "slides.layout.blank" },
];

export const SLIDE_GRADIENTS = Object.keys(GRADIENTS).map((name) => `gradient:${name}`);
/** Light tints (first row) and deep tones (second row). */
export const SLIDE_COLORS = [
  "#ffffff",
  "#f1f5f9",
  "#fef3c7",
  "#fee2e2",
  "#fce7f3",
  "#ede9fe",
  "#e0e7ff",
  "#e0f2fe",
  "#dcfce7",
  "#ecfccb",
  "#111827",
  "#0f172a",
  "#1e293b",
  "#7f1d1d",
  "#7c2d12",
  "#713f12",
  "#14532d",
  "#134e4a",
  "#1e3a8a",
  "#4c1d95",
];
export const SLIDE_BACKGROUNDS = [...SLIDE_GRADIENTS, ...SLIDE_COLORS];

export function newSlideId(): string {
  return Math.random().toString(16).slice(2, 14);
}

export function blankSlide(layout: SlideLayout = "content", extra: Partial<Slide> = {}): Slide {
  return {
    id: newSlideId(),
    layout,
    title: "",
    subtitle: "",
    body: "",
    body2: "",
    image: null,
    image_fit: "cover",
    background: null,
    text_color: null,
    align: layout === "title" || layout === "section" || layout === "quote" ? "center" : "start",
    notes: "",
    duration: 0,
    hidden: false,
    ...extra,
  };
}

/** CSS background for a slide's own background (or nothing to use the theme's). */
export function backgroundCss(background: string | null): string | null {
  if (!background) return null;
  if (background.startsWith("gradient:")) return GRADIENTS[background.slice(9)] ?? null;
  if (background.startsWith("/api/files/") || background.startsWith("data:"))
    return `center / cover no-repeat url("${background}")`;
  if (/^#[0-9a-f]{3,8}$/i.test(background)) return background;
  return null;
}

/** Whether a background is light (for choosing a readable text color). */
export function isLight(background: string | null): boolean | null {
  if (!background) return null;
  const hex = background.startsWith("#")
    ? background
    : background.startsWith("gradient:")
      ? (GRADIENTS[background.slice(9)]?.match(/#[0-9a-f]{6}/i)?.[0] ?? null)
      : null;
  if (!hex) return background.startsWith("/api/files/") ? false : null;
  const value = parseInt(hex.slice(1, 7).padEnd(6, "0"), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

export function themeVars(theme: SlideTheme, slide: Slide): CSSProperties {
  const spec = THEMES[theme] ?? THEMES.aurora;
  const own = backgroundCss(slide.background);
  const light = isLight(slide.background);
  const text = slide.text_color || (light === null ? spec.text : light ? "#111827" : "#ffffff");
  return {
    "--slide-bg": own ?? spec.background,
    "--slide-text": text,
    "--slide-muted": slide.text_color || light !== null ? text : spec.muted,
    "--slide-accent": spec.accent,
    "--slide-surface": spec.surface,
    "--slide-font": spec.font,
  } as CSSProperties;
}

/** Splits body text into bullet points ("- ") and paragraphs. */
export function bodyBlocks(body: string): { bullets: string[]; text: string }[] {
  const blocks: { bullets: string[]; text: string }[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last && last.bullets.length) last.bullets.push(bullet[1]);
      else blocks.push({ bullets: [bullet[1]], text: "" });
    } else if (line.trim()) {
      blocks.push({ bullets: [], text: line.trim() });
    }
  }
  return blocks;
}

export function slideText(slide: Slide): string {
  return [slide.title, slide.subtitle, slide.body, slide.body2].filter(Boolean).join(" ");
}
