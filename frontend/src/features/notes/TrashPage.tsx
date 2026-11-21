/** Notes in the trash: restore or delete for good. */
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { notesApi } from "../../api/endpoints";
import { queryKeys } from "../../api/queries";
import { notesExtraApi } from "../../api/v4";
import { useConfirm, useToast } from "../../components/Feedback";
import { RestoreIcon, TrashIcon } from "../../components/Icons";
import { EmptyState, PageHeader, Skeleton } from "../../components/ui";
import { matchesQuery, usePageQuery } from "../../hooks/usePageQuery";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { useWorkspace } from "../workspace/WorkspaceContext";

export function TrashPage() {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const client = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEdit } = useWorkspace();
  const key = ["notes-trash"];
  const { data: allNotes = [], isLoading } = useQuery({ queryKey: key, queryFn: notesExtraApi.trash });
  const query = usePageQuery();
  const notes = allNotes.filter((note) => matchesQuery(query, note.title, note.excerpt));

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      toast(done, "success");
      await client.invalidateQueries({ queryKey: key });
      await client.invalidateQueries({ queryKey: queryKeys.allNotes });
      await client.invalidateQueries({ queryKey: queryKeys.categories });
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  async function emptyTrash() {
    const ok = await confirm({
      title: t("trash.emptyTitle"),
      message: t("trash.emptyMessage"),
      confirmLabel: t("trash.empty"),
      danger: true,
    });
    if (ok) await run(notesExtraApi.emptyTrash, t("trash.emptied"));
  }

  return (
    <div className="page trash-page">
      <PageHeader
        title={t("nav.trash")}
        subtitle={t("trash.subtitle")}
        actions={
          canEdit && allNotes.length > 0 ? (
            <button type="button" className="danger-outline" onClick={() => void emptyTrash()}>
              <TrashIcon /> {t("trash.empty")}
            </button>
          ) : undefined
        }
      />
      {isLoading ? (
        <Skeleton rows={4} />
      ) : !notes.length ? (
        <EmptyState icon={TrashIcon} title={t("trash.emptyState")} hint={t("trash.emptyHint")} />
      ) : (
        <ul className="trash-list">
          {notes.map((note) => (
            <li key={note.id} className="trash-item">
              <div className="trash-text">
                <strong dir="auto">{note.title || t("notes.untitled")}</strong>
                <span className="muted small" dir="auto">
                  {note.excerpt || t("notes.empty")}
                </span>
                {note.deleted_at && (
                  <span className="muted small">
                    {t("trash.deletedAt", { date: calendar.dateTime(note.deleted_at) })}
                  </span>
                )}
              </div>
              {canEdit && (
                <div className="trash-actions">
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => void run(() => notesExtraApi.restore(note.id), t("trash.restored"))}
                  >
                    <RestoreIcon /> {t("trash.restore")}
                  </button>
                  <button
                    type="button"
                    className="icon-button small danger"
                    title={t("trash.deleteForever")}
                    aria-label={t("trash.deleteForever")}
                    onClick={async () => {
                      const ok = await confirm({
                        title: t("trash.deleteForever"),
                        message: t("notes.deleteMessage", { title: note.title || t("notes.untitled") }),
                        confirmLabel: t("common.delete"),
                        danger: true,
                      });
                      if (ok) await run(() => notesApi.remove(note.id), t("notes.deleted"));
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
