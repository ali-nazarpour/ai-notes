/**
 * Square (1:1) crop for profile pictures: drag to position, zoom with the slider or the
 * mouse wheel, rotate in 90° steps. The result is drawn on a 512×512 canvas in the browser
 * and uploaded as a small image, so the original photo never leaves the device.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { CameraIcon, RotateIcon, ZoomInIcon } from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { useI18n } from "../../i18n";

const VIEW = 280; // crop frame size on screen (px)
const OUTPUT = 512; // saved picture size (px)

interface Props {
  file: File;
  onCancel: () => void;
  onDone: (file: File) => Promise<void> | void;
}

export function AvatarCropper({ file, onCancel, onDone }: Props) {
  const { t } = useI18n();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; start: { x: number; y: number } } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const turned = rotation % 180 !== 0;
  const width = image ? (turned ? image.naturalHeight : image.naturalWidth) : 1;
  const height = image ? (turned ? image.naturalWidth : image.naturalHeight) : 1;
  const base = Math.max(VIEW / width, VIEW / height); // "cover" the frame at zoom 1
  const scale = base * zoom;

  const clamp = (next: { x: number; y: number }, s = scale) => {
    const maxX = Math.max(0, (width * s - VIEW) / 2);
    const maxY = Math.max(0, (height * s - VIEW) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const setZoomClamped = (value: number) => {
    const next = Math.min(4, Math.max(1, value));
    setZoom(next);
    setOffset((current) => clamp(current, base * next));
  };

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, start: offset };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const { x, y, start } = drag.current;
    setOffset(clamp({ x: start.x + event.clientX - x, y: start.y + event.clientY - y }));
  }

  async function save() {
    if (!image) return;
    setBusy(true);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const k = OUTPUT / VIEW;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);
    ctx.imageSmoothingQuality = "high";
    ctx.translate(OUTPUT / 2 + offset.x * k, OUTPUT / 2 + offset.y * k);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale * k, scale * k);
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) {
      setBusy(false);
      return;
    }
    try {
      await onDone(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("profile.cropTitle")}
      icon={CameraIcon}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <button type="button" className="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="button" className="primary" onClick={() => void save()} disabled={!image || busy}>
            {busy ? t("common.saving") : t("profile.usePhoto")}
          </button>
        </>
      }
    >
      <p className="hint">{t("profile.cropHint")}</p>
      <div
        className="cropper"
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(event) => setZoomClamped(zoom - event.deltaY * 0.0015)}
        tabIndex={0}
        role="application"
        aria-label={t("profile.cropArea")}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 20 : 5;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [step, 0],
            ArrowRight: [-step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
          };
          const move = moves[event.key];
          if (move) {
            event.preventDefault();
            setOffset((current) => clamp({ x: current.x + move[0], y: current.y + move[1] }));
          } else if (event.key === "+" || event.key === "=") setZoomClamped(zoom + 0.1);
          else if (event.key === "-") setZoomClamped(zoom - 0.1);
        }}
      >
        {image && (
          <img
            src={image.src}
            alt=""
            draggable={false}
            style={{
              width: image.naturalWidth,
              height: image.naturalHeight,
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${scale})`,
            }}
          />
        )}
        <span className="cropper-ring" aria-hidden="true" />
      </div>
      <div className="cropper-controls">
        <ZoomInIcon />
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          aria-label={t("profile.zoom")}
          onChange={(event) => setZoomClamped(Number(event.target.value))}
        />
        <button
          type="button"
          className="icon-button"
          onClick={() => {
            setRotation((value) => (value + 90) % 360);
            setOffset({ x: 0, y: 0 });
          }}
          aria-label={t("profile.rotate")}
          title={t("profile.rotate")}
        >
          <RotateIcon />
        </button>
      </div>
    </Modal>
  );
}
