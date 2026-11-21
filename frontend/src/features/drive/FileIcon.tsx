/** Colored file-type badges (like Google Drive's), drawn as small inline SVGs. */
import type { CSSProperties } from "react";

import { TYPE_COLORS, type FileType } from "./fileTypes";

const GLYPHS: Partial<Record<FileType, string>> = {
  image: "M7 16l3-4 2.5 3 2-2.5L17 16zM9 9.5a1.2 1.2 0 110-.01",
  video: "M9.5 8.5v7l6-3.5z",
  audio:
    "M10 15.5V8l6-1.5v7.5M10 15.5a1.6 1.6 0 11-1.6-1.6A1.6 1.6 0 0110 15.5zM16 14a1.6 1.6 0 11-1.6-1.6A1.6 1.6 0 0116 14z",
  pdf: "M8 15.5v-6h2a1.6 1.6 0 010 3.2H8M13 9.5v6h1.2a2.2 2.2 0 002.2-2.2v-1.6a2.2 2.2 0 00-2.2-2.2z",
  doc: "M7.5 9h9M7.5 12h9M7.5 15h6",
  sheet: "M7 8.5h10v7H7zM7 12h10M11 8.5v7",
  slides: "M7 9h10v6H7z",
  archive: "M12 7v2M12 10.5v2M12 14h0M10.8 14h2.4v2.2h-2.4z",
  code: "M10 9l-2.5 3 2.5 3M14 9l2.5 3-2.5 3",
  text: "M8 9h8M8 12h8M8 15h5",
  font: "M8.5 16l3.5-8 3.5 8M9.8 13h4.4",
  app: "M8 8h8v8H8zM8 11h8",
  other: "M8.5 9h7M8.5 12h7M8.5 15h4",
};

export function FileTypeIcon({
  type,
  size = 22,
  color,
}: {
  type: FileType;
  size?: number;
  color?: string | null;
}) {
  const fill = color || TYPE_COLORS[type];
  if (type === "folder") {
    return (
      <svg className="file-type-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill={fill}
          d="M2.5 6.2A1.7 1.7 0 014.2 4.5h4.6a1.7 1.7 0 011.25.55l1.6 1.75h8.15a1.7 1.7 0 011.7 1.7v10.3a1.7 1.7 0 01-1.7 1.7H4.2a1.7 1.7 0 01-1.7-1.7z"
        />
      </svg>
    );
  }
  return (
    <svg className="file-type-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3.2" fill={fill} />
      <path
        d={GLYPHS[type] ?? GLYPHS.other}
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function typeStyle(type: FileType, color?: string | null): CSSProperties {
  return { "--file-color": color || TYPE_COLORS[type] } as CSSProperties;
}
