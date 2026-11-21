/** Text size preference (per device). index.html applies it before React starts. */
import { useEffect } from "react";

import { useLocalStorage } from "./useLocalStorage";

export const FONT_SCALES = [0.9, 1, 1.1, 1.2] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export function useFontScale(): [FontScale, (scale: FontScale) => void] {
  const [scale, setScale] = useLocalStorage<FontScale>("notes.fontScale", 1);
  useEffect(() => {
    document.documentElement.style.fontSize = scale === 1 ? "" : `${scale * 100}%`;
  }, [scale]);
  return [scale, setScale];
}
