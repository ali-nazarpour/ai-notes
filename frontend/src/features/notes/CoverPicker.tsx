/** Choose a gradient cover or upload an image. */
import { useRef, useState } from "react";

import { filesApi } from "../../api/endpoints";
import { useToast } from "../../components/Feedback";
import { CheckIcon, ImageIcon, TrashIcon, UploadIcon } from "../../components/Icons";
import { Popover } from "../../components/ui";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { coverStyle, GRADIENTS } from "../../lib/covers";

export function CoverPicker({
  cover,
  onChange,
  triggerLabel,
  triggerClassName = "ghost small",
  align = "end",
}: {
  cover: string | null;
  onChange: (cover: string | null) => void;
  triggerLabel: string;
  triggerClassName?: string;
  align?: "start" | "end";
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  async function upload(file: File, close: () => void) {
    setProgress(0);
    try {
      const stored = await filesApi.upload(file, setProgress);
      if (stored.kind !== "image") {
        toast(t("notes.coverImageOnly"), "error");
        return;
      }
      onChange(stored.url);
      close();
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
    } finally {
      setProgress(null);
    }
  }

  return (
    <Popover
      label={t("notes.cover")}
      align={align}
      className="cover-popover"
      trigger={({ open, toggle }) => (
        <button type="button" className={triggerClassName} aria-expanded={open} onClick={toggle}>
          <ImageIcon />
          {triggerLabel}
        </button>
      )}
    >
      {(close) => (
        <div className="cover-picker">
          <div className="cover-picker-head">
            <span className="cover-picker-icon" aria-hidden="true">
              <ImageIcon />
            </span>
            <p className="cover-picker-title">{t("notes.coverGallery")}</p>
          </div>
          <div className="cover-grid">
            {Object.keys(GRADIENTS).map((name) => {
              const value = `gradient:${name}`;
              return (
                <button
                  key={name}
                  type="button"
                  className="cover-option"
                  style={coverStyle(value)}
                  aria-pressed={cover === value}
                  aria-label={name}
                  title={name}
                  onClick={() => {
                    onChange(value);
                    close();
                  }}
                >
                  {cover === value && <CheckIcon />}
                </button>
              );
            })}
          </div>
          <div className="cover-picker-actions">
            <button
              type="button"
              className="cover-upload"
              onClick={() => input.current?.click()}
              disabled={progress !== null}
            >
              <UploadIcon />
              {progress !== null
                ? t("editor.uploadingPercent", { value: Math.round(progress * 100) })
                : t("notes.uploadCover")}
            </button>
            {cover && (
              <button
                type="button"
                className="ghost small danger"
                onClick={() => {
                  onChange(null);
                  close();
                }}
              >
                <TrashIcon />
                {t("notes.removeCover")}
              </button>
            )}
          </div>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file, close);
            }}
          />
        </div>
      )}
    </Popover>
  );
}
