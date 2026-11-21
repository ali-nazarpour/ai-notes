/**
 * The drive's libraries: Music (folders as playlists, a track list played by the music
 * player), Videos (a grid of video thumbnails, played in the viewer), Photos (a gallery
 * with a slideshow) and Documents (a plain list; files open read-only).
 */
import type { MouseEvent, ReactNode } from "react";

import { driveApi } from "../../api/v5";
import {
  FileIcon,
  ImageIcon,
  MusicIcon,
  PlayFilledIcon,
  ShuffleIcon,
  VideoIcon,
} from "../../components/Icons";
import { useI18n, type TranslationKey } from "../../i18n";
import { formatBytes } from "../../lib/embeds";
import type { DriveItem, DriveSection } from "../../types5";
import { FileTypeIcon } from "./FileIcon";
import { trackTitle, useMusic, type Track } from "./MusicPlayer";

const DOCUMENTS =
  ".pdf,.doc,.docx,.odt,.rtf,.txt,.md,.xls,.xlsx,.ods,.csv,.tsv,.ppt,.pptx,.odp,.key,.pages,.numbers,.json,.xml,.zip,.rar,.7z,.epub";

export const SECTIONS: {
  id: Exclude<DriveSection, "files">;
  label: TranslationKey;
  icon: () => React.JSX.Element;
  accept: string;
  empty: TranslationKey;
  emptyHint: TranslationKey;
  upload: TranslationKey;
}[] = [
  {
    id: "music",
    label: "drive.section.music",
    icon: MusicIcon,
    accept: "audio/*",
    empty: "drive.music.empty",
    emptyHint: "drive.music.emptyHint",
    upload: "drive.music.upload",
  },
  {
    id: "videos",
    label: "drive.section.videos",
    icon: VideoIcon,
    accept: "video/*",
    empty: "drive.videos.empty",
    emptyHint: "drive.videos.emptyHint",
    upload: "drive.videos.upload",
  },
  {
    id: "photos",
    label: "drive.section.photos",
    icon: ImageIcon,
    accept: "image/*",
    empty: "drive.photos.empty",
    emptyHint: "drive.photos.emptyHint",
    upload: "drive.photos.upload",
  },
  {
    id: "documents",
    label: "drive.section.documents",
    icon: FileIcon,
    accept: DOCUMENTS,
    empty: "drive.documents.empty",
    emptyHint: "drive.documents.emptyHint",
    upload: "drive.documents.upload",
  },
];

export function rootUrl(section: DriveSection): string {
  return section === "files" ? "/drive" : `/drive/${section}`;
}

export function folderUrl(section: DriveSection, id: number): string {
  return section === "files" ? `/drive/folders/${id}` : `/drive/${section}/folders/${id}`;
}

export function toTracks(items: DriveItem[], album = ""): Track[] {
  return items
    .filter((i) => !i.is_folder && i.url)
    .map((i) => ({ id: i.id, name: i.name, url: i.url!, album }));
}

interface Props {
  section: "music" | "videos" | "photos";
  folders: DriveItem[];
  files: DriveItem[];
  folderName?: string;
  selected: Set<number>;
  onOpen: (item: DriveItem) => void;
  onSelect: (item: DriveItem, event: MouseEvent) => void;
  onMenu: (event: MouseEvent, item: DriveItem) => void;
  onSlideshow?: (first: DriveItem) => void;
  moreButton: (item: DriveItem) => ReactNode;
}

export function SectionView(props: Props) {
  return (
    <div className="library" data-section={props.section}>
      {props.folders.length > 0 && <LibraryFolders {...props} />}
      {props.section === "music" && <TrackList {...props} />}
      {props.section === "videos" && <VideoGrid {...props} />}
      {props.section === "photos" && <PhotoGrid {...props} />}
    </div>
  );
}

function LibraryFolders({ section, folders, onOpen, onMenu, moreButton }: Props) {
  const { t, calendar } = useI18n();
  const music = useMusic();
  const Icon = SECTIONS.find((s) => s.id === section)!.icon;
  return (
    <>
      <h2 className="drive-section-title">
        {section === "music" ? t("music.playlists") : t("drive.folders")}
      </h2>
      <div className="library-folders">
        {folders.map((folder) => (
          <div
            key={folder.id}
            className="library-folder"
            role="button"
            tabIndex={0}
            onClick={() => onOpen(folder)}
            onKeyDown={(event) => event.key === "Enter" && onOpen(folder)}
            onContextMenu={(event) => onMenu(event, folder)}
            style={folder.color ? ({ "--folder": folder.color } as React.CSSProperties) : undefined}
          >
            <span className="library-folder-art">
              <Icon />
              {section === "music" && folder.item_count > 0 && (
                <button
                  type="button"
                  className="library-folder-play"
                  aria-label={t("music.playFolder", { name: folder.name })}
                  onClick={async (event) => {
                    event.stopPropagation();
                    const listing = await driveApi.list("folder", folder.id, "", "music");
                    music.play(toTracks(listing.items, folder.name));
                  }}
                >
                  <PlayFilledIcon />
                </button>
              )}
            </span>
            <span className="library-folder-text">
              <strong dir="auto">{folder.name}</strong>
              <span className="muted small">
                {t("drive.itemCount", { count: calendar.formatNumber(folder.item_count) })}
              </span>
            </span>
            {moreButton(folder)}
          </div>
        ))}
      </div>
    </>
  );
}

function TrackList({ files, folderName, onMenu, moreButton }: Props) {
  const { t, calendar } = useI18n();
  const music = useMusic();
  const tracks = toTracks(files, folderName);
  if (!files.length) return null;
  return (
    <section className="tracks">
      <div className="tracks-head">
        <h2 className="drive-section-title">
          {t("music.tracks", { count: calendar.formatNumber(files.length) })}
        </h2>
        <span className="row">
          <button type="button" className="primary" onClick={() => music.play(tracks)}>
            <PlayFilledIcon /> {t("music.playAll")}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => music.play(tracks, Math.floor(Math.random() * tracks.length))}
          >
            <ShuffleIcon /> {t("music.shuffle")}
          </button>
        </span>
      </div>
      <ol className="track-list">
        {files.map((file, index) => {
          const current = music.isCurrent(file.id);
          return (
            <li
              key={file.id}
              className="track"
              data-current={current}
              data-playing={current && music.playing}
              onDoubleClick={() => music.play(tracks, index)}
              onContextMenu={(event) => onMenu(event, file)}
            >
              <button
                type="button"
                className="track-play"
                onClick={() => (current ? music.toggle() : music.play(tracks, index))}
                aria-label={t("slides.play")}
              >
                <span className="track-n">{calendar.formatNumber(index + 1)}</span>
                <span className="track-icon">
                  {current && music.playing ? (
                    <span className="eq">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    <PlayFilledIcon />
                  )}
                </span>
              </button>
              <span className="track-title" dir="auto">
                {trackTitle(file.name)}
                <span className="muted small">{file.name}</span>
              </span>
              <span className="track-size muted small">{formatBytes(file.size, calendar.formatNumber)}</span>
              {moreButton(file)}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function VideoGrid({ files, onOpen, onMenu, moreButton }: Props) {
  const { t, calendar } = useI18n();
  if (!files.length) return null;
  return (
    <>
      <h2 className="drive-section-title">{t("drive.section.videos")}</h2>
      <div className="video-grid">
        {files.map((file) => (
          <div key={file.id} className="video-card" onContextMenu={(event) => onMenu(event, file)}>
            <button type="button" className="video-thumb" onClick={() => onOpen(file)} aria-label={file.name}>
              {file.url ? (
                <video src={`${file.url}#t=1`} preload="metadata" muted playsInline />
              ) : (
                <FileTypeIcon type="video" size={48} />
              )}
              <span className="video-play">
                <PlayFilledIcon />
              </span>
            </button>
            <div className="video-meta">
              <span className="video-text">
                <strong dir="auto">{file.name.replace(/\.[a-z0-9]{2,5}$/i, "")}</strong>
                <span className="muted small">
                  {formatBytes(file.size, calendar.formatNumber)} · {calendar.shortDate(file.updated_at)}
                </span>
              </span>
              {moreButton(file)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function PhotoGrid({ files, selected, onOpen, onMenu, onSlideshow }: Props) {
  const { t, calendar } = useI18n();
  if (!files.length) return null;
  return (
    <>
      <div className="tracks-head">
        <h2 className="drive-section-title">
          {t("drive.photos.count", { count: calendar.formatNumber(files.length) })}
        </h2>
        {onSlideshow && (
          <button type="button" className="primary" onClick={() => onSlideshow(files[0])}>
            <PlayFilledIcon /> {t("drive.photos.slideshow")}
          </button>
        )}
      </div>
      <div className="photo-grid">
        {files.map((file) => (
          <button
            key={file.id}
            type="button"
            className="photo-tile"
            data-selected={selected.has(file.id)}
            onClick={() => onOpen(file)}
            onContextMenu={(event) => onMenu(event, file)}
            aria-label={file.name}
          >
            {file.url && <img src={file.url} alt="" loading="lazy" draggable={false} />}
          </button>
        ))}
      </div>
    </>
  );
}
