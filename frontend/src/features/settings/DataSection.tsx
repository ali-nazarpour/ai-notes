/** Backup: download everything as a ZIP, or add a ZIP backup to this account. */
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type DragEvent } from "react";

import { dataApi } from "../../api/endpoints";
import { useDataSummary } from "../../api/queries";
import { useConfirm, useToast } from "../../components/Feedback";
import { CheckIcon, DatabaseIcon, DownloadIcon, UploadIcon } from "../../components/Icons";
import { useI18n, type TranslationKey } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import type { DataSummary, ImportResult } from "../../types";

const COUNTS: { key: keyof DataSummary; label: TranslationKey }[] = [
  { key: "notes", label: "nav.notes" },
  { key: "tasks", label: "nav.tasks" },
  { key: "boards", label: "nav.boards" },
  { key: "docs", label: "nav.docs" },
  { key: "posts", label: "nav.blog" },
  { key: "projects", label: "nav.projects" },
  { key: "categories", label: "nav.categories" },
  { key: "files", label: "data.files" },
  { key: "chats", label: "data.chats" },
  { key: "vault_items", label: "nav.passwords" },
];

const RESULT_ROWS: { key: keyof ImportResult; label: TranslationKey }[] = [
  { key: "notes", label: "nav.notes" },
  { key: "tasks", label: "nav.tasks" },
  { key: "boards", label: "nav.boards" },
  { key: "cards", label: "data.cards" },
  { key: "docs", label: "nav.docs" },
  { key: "doc_pages", label: "data.docPages" },
  { key: "posts", label: "nav.blog" },
  { key: "projects", label: "nav.projects" },
  { key: "categories", label: "nav.categories" },
  { key: "files", label: "data.files" },
  { key: "chats", label: "data.chats" },
  { key: "vault_items", label: "nav.passwords" },
];

export function DataSection() {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const confirm = useConfirm();
  const client = useQueryClient();
  const { data: summary } = useDataSummary();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function exportData() {
    setExporting(true);
    try {
      const { blob, filename } = await dataApi.exportZip();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(t("data.exported"), "success");
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
    } finally {
      setExporting(false);
    }
  }

  async function importData(file: File) {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast(t("data.zipOnly"), "error");
      return;
    }
    const ok = await confirm({
      title: t("data.importTitle"),
      message: t("data.importMessage", { name: file.name }),
      confirmLabel: t("data.import"),
    });
    if (!ok) return;
    setResult(null);
    setProgress(0);
    try {
      const imported = await dataApi.importZip(file, setProgress);
      setResult(imported);
      await client.invalidateQueries();
      toast(t("data.imported"), "success");
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
    } finally {
      setProgress(null);
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void importData(file);
  };

  return (
    <>
      <section className="card settings-card">
        <h2 className="card-title">{t("data.exportTitle")}</h2>
        <p className="muted small">{t("data.exportHint")}</p>
        <div className="settings-card-body">
          <div className="data-counts">
            {COUNTS.map(({ key, label }) => (
              <span key={key} className="data-count">
                <strong>{summary ? calendar.formatNumber(summary[key] ?? 0) : "–"}</strong>
                {t(label)}
              </span>
            ))}
          </div>
          <div>
            <button type="button" className="primary" onClick={() => void exportData()} disabled={exporting}>
              <DownloadIcon /> {exporting ? t("data.preparing") : t("data.exportButton")}
            </button>
          </div>
        </div>
      </section>

      <section className="card settings-card">
        <h2 className="card-title">{t("data.importTitle")}</h2>
        <p className="muted small">{t("data.importHint")}</p>
        <div className="settings-card-body">
          <div
            className="dropzone"
            data-dragging={dragging}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="dropzone-icon">
              <DatabaseIcon />
            </span>
            <p>{t("data.dropHere")}</p>
            <button type="button" onClick={() => input.current?.click()} disabled={progress !== null}>
              <UploadIcon /> {t("data.chooseFile")}
            </button>
            <input
              ref={input}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importData(file);
              }}
            />
          </div>

          {progress !== null && (
            <div className="upload-progress" role="status">
              <span>{progress < 1 ? t("data.uploading") : t("data.processing")}</span>
              <span className="upload-bar">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </span>
            </div>
          )}

          {result && (
            <div className="import-result" role="status">
              <p className="with-icon">
                <CheckIcon /> {t("data.importDone")}
              </p>
              <ul>
                {RESULT_ROWS.filter(({ key }) => Number(result[key]) > 0).map(({ key, label }) => (
                  <li key={key}>
                    <strong>{calendar.formatNumber(Number(result[key]))}</strong> {t(label)}
                  </li>
                ))}
              </ul>
              {result.vault_skipped && <p className="hint">{t("data.vaultSkipped")}</p>}
              {result.warnings.length > 0 && (
                <p className="hint">{t("data.warnings", { count: result.warnings.length })}</p>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
