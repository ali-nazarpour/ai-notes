/** Version history: list of saved versions, a preview, and "restore this version". */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useConfirm, useToast } from "../../components/Feedback";
import { HistoryIcon, RestoreIcon } from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { Skeleton } from "../../components/ui";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import type { Revision, RevisionSummary } from "../../types4";
import { NoteEditor } from "../editor/NoteEditor";

const noop = () => undefined;

export function RevisionDialog({
  queryKey,
  load,
  loadOne,
  restore,
  onClose,
  onRestored,
}: {
  queryKey: unknown[];
  load: () => Promise<RevisionSummary[]>;
  loadOne: (id: number) => Promise<Revision>;
  restore: (id: number) => Promise<unknown>;
  onClose: () => void;
  onRestored: () => void;
}) {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const confirm = useConfirm();
  const list = useQuery({ queryKey, queryFn: load });
  const [selected, setSelected] = useState<number | null>(null);
  const current = selected ?? list.data?.[0]?.id ?? null;
  const detail = useQuery({
    queryKey: [...queryKey, current],
    queryFn: () => loadOne(current as number),
    enabled: current != null,
  });

  async function doRestore() {
    if (current == null) return;
    const ok = await confirm({
      title: t("history.restoreTitle"),
      message: t("history.restoreMessage"),
      confirmLabel: t("history.restore"),
    });
    if (!ok) return;
    try {
      await restore(current);
      toast(t("history.restored"), "success");
      onRestored();
      onClose();
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  return (
    <Modal
      title={t("history.title")}
      icon={HistoryIcon}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.close")}
          </button>
          <button
            type="button"
            className="primary"
            disabled={current == null}
            onClick={() => void doRestore()}
          >
            <RestoreIcon /> {t("history.restore")}
          </button>
        </>
      }
    >
      {list.isLoading ? (
        <Skeleton rows={4} />
      ) : !list.data?.length ? (
        <p className="muted">{t("history.empty")}</p>
      ) : (
        <div className="history-layout">
          <ul className="history-list">
            {list.data.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="history-item"
                  aria-pressed={item.id === current}
                  onClick={() => setSelected(item.id)}
                >
                  <strong>{calendar.dateTime(item.created_at)}</strong>
                  <span className="muted small">
                    {item.user_name || "—"} · {t("history.chars", { count: item.chars })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="history-preview">
            {detail.isLoading || !detail.data ? (
              <Skeleton rows={6} />
            ) : (
              <>
                <h2 dir="auto">{detail.data.title || t("notes.untitled")}</h2>
                {detail.data.body ? (
                  <NoteEditor
                    key={detail.data.id}
                    initialContent={detail.data.body}
                    onChange={noop}
                    editable={false}
                  />
                ) : (
                  <pre className="history-text" dir="auto">
                    {detail.data.content}
                  </pre>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
