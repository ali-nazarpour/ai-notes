/**
 * Note covers. A cover is either "gradient:<name>" (a built-in preset) or the URL of an
 * uploaded image ("/api/files/<uuid>"). The backend accepts only these two forms.
 */
import type { CSSProperties } from "react";

export const GRADIENTS: Record<string, string> = {
  aurora: "linear-gradient(120deg, #2af598 0%, #009efd 100%)",
  sunset: "linear-gradient(120deg, #ff9a56 0%, #ff5e62 50%, #c2185b 100%)",
  ocean: "linear-gradient(135deg, #0f2027 0%, #2c5364 50%, #4ca1af 100%)",
  candy: "linear-gradient(120deg, #f6d365 0%, #fda085 50%, #f093fb 100%)",
  forest: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)",
  dusk: "linear-gradient(135deg, #2b5876 0%, #4e4376 100%)",
  peach: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
  lavender: "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)",
  midnight: "linear-gradient(135deg, #232526 0%, #414345 100%)",
  mint: "linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)",
  nebula:
    "radial-gradient(circle at 20% 20%, #ff6ec4 0%, transparent 45%), radial-gradient(circle at 80% 30%, #7873f5 0%, transparent 50%), linear-gradient(135deg, #1b1035, #2d1b69)",
  sand: "linear-gradient(135deg, #e6dada 0%, #c9b79c 50%, #a17f5a 100%)",
  alpine: "linear-gradient(160deg, #a1c4fd 0%, #c2e9fb 45%, #e2ebf0 100%)",
  ember: "linear-gradient(135deg, #f12711 0%, #f5af19 100%)",
  royal: "linear-gradient(135deg, #141e30 0%, #243b55 100%)",
  meadow: "linear-gradient(160deg, #56ab2f 0%, #a8e063 100%)",
  berry: "linear-gradient(135deg, #8e2de2 0%, #e94057 100%)",
  citrus: "linear-gradient(135deg, #fdfc47 0%, #24fe41 100%)",
  glacier: "linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)",
  twilight: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
};

export function coverStyle(cover: string | null | undefined): CSSProperties | undefined {
  if (!cover) return undefined;
  if (cover.startsWith("gradient:")) {
    const gradient = GRADIENTS[cover.slice("gradient:".length)];
    return gradient ? { backgroundImage: gradient } : undefined;
  }
  if (cover.startsWith("/api/files/")) {
    return { backgroundImage: `url("${cover}")` };
  }
  return undefined;
}

export function randomGradient(): string {
  const names = Object.keys(GRADIENTS);
  return `gradient:${names[Math.floor(Math.random() * names.length)]}`;
}
