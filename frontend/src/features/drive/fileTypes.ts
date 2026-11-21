/** What kind of file an item is (for icons, colors and previews), from its name and type. */
import type { TranslationKey } from "../../i18n";
import type { DriveItem } from "../../types5";

export type FileType =
  | "folder"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "doc"
  | "sheet"
  | "slides"
  | "archive"
  | "code"
  | "text"
  | "font"
  | "app"
  | "other";

const EXT: Record<string, FileType> = {};
const add = (type: FileType, list: string) => list.split(" ").forEach((ext) => (EXT[ext] = type));
add("image", "png jpg jpeg gif webp avif bmp svg ico heic tif tiff");
add("video", "mp4 webm mov mkv avi m4v wmv");
add("audio", "mp3 m4a ogg wav flac aac opus wma");
add("pdf", "pdf");
add("doc", "doc docx odt rtf pages");
add("sheet", "xls xlsx ods csv numbers tsv");
add("slides", "ppt pptx odp key");
add("archive", "zip rar 7z tar gz tgz bz2 xz");
add("code", "js ts tsx jsx py java c cpp h cs go rs rb php html css scss json xml yml yaml sql sh kt swift");
add("text", "txt md log ini conf");
add("font", "ttf otf woff woff2");
add("app", "exe msi dmg apk deb rpm bat cmd appimage iso");

export function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function fileType(item: Pick<DriveItem, "is_folder" | "name" | "kind" | "content_type">): FileType {
  if (item.is_folder) return "folder";
  if (item.kind === "image" || item.kind === "video" || item.kind === "audio") return item.kind;
  if (item.content_type === "application/pdf") return "pdf";
  return EXT[extension(item.name)] ?? "other";
}

/** Brand-like colors per type (Google Drive style). */
export const TYPE_COLORS: Record<FileType, string> = {
  folder: "#5f6368",
  image: "#e94235",
  video: "#d93025",
  audio: "#9334e6",
  pdf: "#ea4335",
  doc: "#4285f4",
  sheet: "#0f9d58",
  slides: "#f4b400",
  archive: "#795548",
  code: "#00897b",
  text: "#607d8b",
  font: "#3949ab",
  app: "#455a64",
  other: "#80868b",
};

export const TYPE_LABELS: Record<FileType, TranslationKey> = {
  folder: "drive.type.folder",
  image: "drive.type.image",
  video: "drive.type.video",
  audio: "drive.type.audio",
  pdf: "drive.type.pdf",
  doc: "drive.type.doc",
  sheet: "drive.type.sheet",
  slides: "drive.type.slides",
  archive: "drive.type.archive",
  code: "drive.type.code",
  text: "drive.type.text",
  font: "drive.type.font",
  app: "drive.type.app",
  other: "drive.type.other",
};

/** Can the browser show this file without downloading it? */
export function canPreview(type: FileType, item: DriveItem): boolean {
  if (!item.url) return false;
  return ["image", "video", "audio", "pdf", "text", "code"].includes(type) && item.size <= 50 * 1024 * 1024;
}

/** Folder colors a user can choose. */
export const FOLDER_COLORS = [
  "#5f6368",
  "#ea4335",
  "#f4511e",
  "#f6bf26",
  "#c0ca33",
  "#0b8043",
  "#33b679",
  "#009688",
  "#00acc1",
  "#039be5",
  "#3f51b5",
  "#7986cb",
  "#673ab7",
  "#8e24aa",
  "#d81b60",
  "#e67c73",
  "#ad1457",
  "#795548",
  "#a1887f",
  "#212121",
];
