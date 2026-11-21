/** A publicly shared drive file or folder (/d/:token): browse, preview and download, no sign-in. */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams, useSearchParams } from "react-router";

import { driveApi } from "../../api/v5";
import { ChevronRightIcon, DownloadIcon, DriveIcon } from "../../components/Icons";
import { EmptyState, Skeleton } from "../../components/ui";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { formatBytes } from "../../lib/embeds";
import type { DriveItem } from "../../types5";
import { DrivePreview } from "./DrivePreview";
import { FileTypeIcon } from "./FileIcon";
import { fileType, TYPE_LABELS } from "./fileTypes";

export function PublicDrivePage() {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const { token = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const folder = Number(params.get("folder")) || null;
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-drive", token, folder],
    queryFn: () => driveApi.publicView(token, folder),
  });
  const [preview, setPreview] = useState<DriveItem | null>(null);
  const fmt = (bytes: number) => formatBytes(bytes, calendar.formatNumber);
  const goTo = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id && id !== data?.root.id) next.set("folder", String(id));
    else next.delete("folder");
    setParams(next);
  };

  if (isLoading) {
    return (
      <div className="public-drive">
        <Skeleton rows={5} height={56} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="public-drive">
        <EmptyState
          icon={DriveIcon}
          title={t("drive.linkInvalid")}
          hint={error ? errorMessage(error, i18n) : undefined}
        />
      </div>
    );
  }

  const single = !data.root.is_folder;
  const files = data.items.filter((i) => !i.is_folder);

  return (
    <div className="public-drive">
      <header className="public-drive-head">
        <span className="public-drive-brand">
          <DriveIcon /> {data.workspace_name}
        </span>
        {!single && (
          <a className="button primary small" href={driveApi.publicZipUrl(token, folder)}>
            <DownloadIcon /> {t("drive.downloadAll")}
          </a>
        )}
      </header>
      {single ? (
        <div className="public-drive-file">
          <FileTypeIcon type={fileType(data.root)} size={84} />
          <h1 dir="auto">{data.root.name}</h1>
          <p className="muted">
            {t(TYPE_LABELS[fileType(data.root)])} · {fmt(data.root.size)}
          </p>
          <div className="row">
            {data.root.url && (
              <a className="button primary" href={data.root.url} download={data.root.name}>
                <DownloadIcon /> {t("common.download")}
              </a>
            )}
            <button type="button" className="ghost" onClick={() => setPreview(data.root)}>
              {t("drive.preview")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <nav className="drive-crumbs public-crumbs">
            {data.path.map((crumb, index) => (
              <span key={crumb.id} className="drive-crumb-wrap">
                {index > 0 && (
                  <span className="drive-crumb-sep" aria-hidden="true">
                    <ChevronRightIcon />
                  </span>
                )}
                {index === data.path.length - 1 ? (
                  <span className="drive-crumb current" dir="auto">
                    {crumb.name}
                  </span>
                ) : (
                  <button type="button" className="drive-crumb" dir="auto" onClick={() => goTo(crumb.id)}>
                    {crumb.name}
                  </button>
                )}
              </span>
            ))}
          </nav>
          {!data.items.length ? (
            <EmptyState icon={DriveIcon} title={t("drive.emptyFolder")} />
          ) : (
            <div className="drive-table">
              {data.items.map((item) => {
                const type = fileType(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="drive-row public-row"
                    onClick={() => (item.is_folder ? goTo(item.id) : setPreview(item))}
                  >
                    <span className="drive-col-name">
                      <FileTypeIcon type={type} color={item.is_folder ? item.color : null} size={22} />
                      <span className="drive-name" dir="auto">
                        {item.name}
                      </span>
                    </span>
                    <span className="drive-col-date muted small">{calendar.shortDate(item.updated_at)}</span>
                    <span className="drive-col-size muted small">
                      {item.is_folder
                        ? t("drive.itemCount", { count: calendar.formatNumber(item.item_count) })
                        : fmt(item.size)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      <p className="public-drive-foot muted small">{t("drive.publicFooter")}</p>
      {preview && (
        <DrivePreview
          item={preview}
          items={single ? [preview] : files}
          onNavigate={setPreview}
          onClose={() => setPreview(null)}
          publicMode
        />
      )}
    </div>
  );
}
