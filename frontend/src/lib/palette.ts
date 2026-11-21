/** Category and accent colors. The backend stores only the name; shades live here. */
import type { CSSProperties } from "react";

import type { ColorName } from "../types";

export interface PaletteColor {
  name: ColorName;
  hex: string;
  /** Readable text color on top of `hex`. */
  onColor: string;
}

/** 20 colors, shown as two rows of 10 in hue order. */
export const COLORS: PaletteColor[] = [
  { name: "red", hex: "#e0453f", onColor: "#ffffff" },
  { name: "orange", hex: "#ea6a1f", onColor: "#ffffff" },
  { name: "amber", hex: "#d99400", onColor: "#1f1600" },
  { name: "yellow", hex: "#e8c214", onColor: "#1f1a00" },
  { name: "lime", hex: "#7cb518", onColor: "#142000" },
  { name: "green", hex: "#2f9e5a", onColor: "#ffffff" },
  { name: "emerald", hex: "#0e8a6a", onColor: "#ffffff" },
  { name: "teal", hex: "#0f9d8f", onColor: "#ffffff" },
  { name: "cyan", hex: "#0aa3c2", onColor: "#ffffff" },
  { name: "sky", hex: "#2b9ae8", onColor: "#ffffff" },
  { name: "blue", hex: "#1f6fd1", onColor: "#ffffff" },
  { name: "indigo", hex: "#4f5bd5", onColor: "#ffffff" },
  { name: "violet", hex: "#7a4fd9", onColor: "#ffffff" },
  { name: "purple", hex: "#a03fc4", onColor: "#ffffff" },
  { name: "fuchsia", hex: "#c93cb4", onColor: "#ffffff" },
  { name: "pink", hex: "#d6417e", onColor: "#ffffff" },
  { name: "rose", hex: "#e8607a", onColor: "#ffffff" },
  { name: "brown", hex: "#8d6248", onColor: "#ffffff" },
  { name: "slate", hex: "#64748b", onColor: "#ffffff" },
  { name: "graphite", hex: "#3c4250", onColor: "#ffffff" },
];

export function paletteColor(name: ColorName | null | undefined): PaletteColor {
  return COLORS.find((color) => color.name === name) ?? COLORS.find((color) => color.name === "indigo")!;
}

/** Sets --cat for an element; the stylesheet mixes category tints from it. */
export function categoryStyle(name: ColorName | null | undefined): CSSProperties {
  return { "--cat": paletteColor(name).hex } as CSSProperties;
}
