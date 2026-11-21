/**
 * Full-screen preview of a drive file: images, video, audio, PDF and text/code. Arrow
 * keys move to the previous/next file of the folder. Other files show a download card.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { authHeaders } from "../../api/client";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIcon,
  InfoIcon,
  PauseFilledIcon,
  PlayFilledIcon,
  ShareIcon,
} from "../../components/Icons";
import { useI18n } from "../../i18n";
import { formatBytes } from "../../lib/embeds";
import type { DriveItem } from "../../types5";
import { FileTypeIcon } from "./FileIcon";
import { canPreview, fileType, TYPE_LABELS } from "./fileTypes";

function useBlobUrl(
  url: string | null,
  enabled: boolean,
): { blob: string | null; text: string | null; failed: boolean } {
  const [state, setState] = useState<{ blob: string | null; text: string | null; failed: boolean }>({
    blob: null,
    text: null,
    failed: false,
  });
  useEffect(() => {
    if (!url || !enabled) return;
    let alive = true;
    let objectUrl: string | null = null;
    setState({ blob: null, text: null, failed: false });
    fetch(url, { headers: authHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        if (!alive) return;
        if (blob.type.startsWith("application/pdf") || url.endsWith(".pdf")) {
          objectUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
          setState({ blob: objectUrl, text: null, failed: false });
        } else {
          const text = await blob.slice(0, 400_000).text();
          if (alive) setState({ blob: null, text, failed: false });
        }
      })
      .catch(() => alive && setState({ blob: null, text: null, failed: true }));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, enabled]);
  return state;
}

export function DrivePreview({
  item,
  items,
  onNavigate,
  onClose,
  onShare,
  onDetails,
  publicMode = false,
  slideshow = false,
}: {
  item: DriveItem;
  items: DriveItem[];
  onNavigate: (item: DriveItem) => void;
  onClose: () => void;
  onShare?: () => void;
  onDetails?: () => void;
  publicMode?: boolean;
  /** Start playing the images one after another. */
  slideshow?: boolean;
}) {
  const { t, calendar } = useI18n();
  const [playing, setPlaying] = useState(slideshow);
  const type = fileType(item);
  const previewable = canPreview(type, item);
  const files = items.filter((i) => !i.is_folder);
  const index = files.findIndex((i) => i.id === item.id);
  const prev = index > 0 ? files[index - 1] : null;
  const next = index >= 0 && index < files.length - 1 ? files[index + 1] : null;
  const images = files.filter((f) => fileType(f) === "image");

  // Slideshow: the next photo every few seconds, starting over at the end.
  useEffect(() => {
    if (!playing || type !== "image" || images.length < 2) return;
    const at = images.findIndex((f) => f.id === item.id);
    const timer = setTimeout(() => onNavigate(images[(at + 1) % images.length]), 3500);
    return () => clearTimeout(timer);
  }, [playing, type, images, item.id, onNavigate]);
  const needsFetch = previewable && (type === "pdf" || type === "text" || type === "code");
  const fetched = useBlobUrl(item.url, needsFetch);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      const rtl = document.documentElement.dir === "rtl";
      if (event.key === (rtl ? "ArrowLeft" : "ArrowRight") && next) onNavigate(next);
      if (event.key === (rtl ? "ArrowRight" : "ArrowLeft") && prev) onNavigate(prev);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [next, prev, onClose, onNavigate]);

  let body: React.ReactNode;
  if (previewable && type === "image") {
    body = <img key={item.id} className="preview-image" src={item.url!} alt={item.name} />;
  } else if (previewable && type === "video") {
    body = <video key={item.id} className="preview-video" src={item.url!} controls autoPlay playsInline />;
  } else if (previewable && type === "audio") {
    body = (
      <div className="preview-audio">
        <FileTypeIcon type="audio" size={96} />
        <strong dir="auto">{item.name}</strong>
        <audio key={item.id} src={item.url!} controls autoPlay />
      </div>
    );
  } else if (previewable && type === "pdf" && fetched.blob) {
    body = <iframe className="preview-pdf" src={fetched.blob} title={item.name} />;
  } else if (previewable && (type === "text" || type === "code") && fetched.text !== null) {
    body = (
      <pre className="preview-text" dir="auto">
        {fetched.text}
      </pre>
    );
  } else if (needsFetch && !fetched.failed) {
    body = <div className="preview-loading">{t("common.loading")}</div>;
  } else {
    body = (
      <div className="preview-none">
        <FileTypeIcon type={type} size={88} />
        <strong dir="auto">{item.name}</strong>
        <span className="muted">
          {t(TYPE_LABELS[type])} · {formatBytes(item.size, calendar.formatNumber)}
        </span>
        <p className="muted">{t("drive.noPreview")}</p>
        {item.url && (
          <a className="button primary" href={item.url} download={item.name}>
            <DownloadIcon /> {t("common.download")}
          </a>
        )}
      </div>
    );
  }

  return createPortal(
    <div className="drive-preview" role="dialog" aria-modal="true" aria-label={item.name}>
      <header className="drive-preview-bar">
        <button type="button" className="icon-button" onClick={onClose} aria-label={t("common.close")}>
          <CloseIcon />
        </button>
        <FileTypeIcon type={type} size={22} />
        <strong className="drive-preview-name" dir="auto">
          {item.name}
        </strong>
        <span className="drive-preview-actions">
          {images.length > 1 && type === "image" && (
            <button
              type="button"
              className="icon-button preview-slideshow"
              aria-pressed={playing}
              onClick={() => setPlaying(!playing)}
              title={playing ? t("slides.pause") : t("drive.photos.slideshow")}
              aria-label={playing ? t("slides.pause") : t("drive.photos.slideshow")}
            >
              {playing ? <PauseFilledIcon /> : <PlayFilledIcon />}
            </button>
          )}
          {!publicMode && onShare && (
            <button type="button" className="icon-button" onClick={onShare} title={t("page.share")}>
              <ShareIcon />
            </button>
          )}
          {!publicMode && onDetails && (
            <button type="button" className="icon-button" onClick={onDetails} title={t("drive.details")}>
              <InfoIcon />
            </button>
          )}
          {item.url && (
            <a className="icon-button" href={item.url} download={item.name} title={t("common.download")}>
              <DownloadIcon />
            </a>
          )}
        </span>
      </header>
      <div
        className="drive-preview-stage"
        onClick={(event) => event.target === event.currentTarget && onClose()}
      >
        {prev && (
          <button
            type="button"
            className="preview-nav preview-prev"
            onClick={() => onNavigate(prev)}
            aria-label={t("drive.previous")}
          >
            <ChevronLeftIcon />
          </button>
        )}
        {body}
        {next && (
          <button
            type="button"
            className="preview-nav preview-next"
            onClick={() => onNavigate(next)}
            aria-label={t("drive.next")}
          >
            <ChevronRightIcon />
          </button>
        )}
      </div>
      {files.length > 1 && index >= 0 && (
        <footer className="drive-preview-count">
          {calendar.formatNumber(index + 1)} / {calendar.formatNumber(files.length)}
        </footer>
      )}
    </div>,
    document.body,
  );
}
