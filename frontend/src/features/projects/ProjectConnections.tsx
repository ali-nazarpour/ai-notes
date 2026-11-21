/**
 * A project's connected work: its boards, tasks, notes, documents, presentations, its
 * folder in the drive, its saved passwords and its dates in the calendar. Items are
 * linked, not owned — each keeps working on its own page, and unlinking (or deleting the
 * project) leaves it in place. New items can be created here already linked.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { boardsApi, notesApi, tasksApi } from "../../api/endpoints";
import { docsApi } from "../../api/v4";
import { projectLinksApi, slidesApi } from "../../api/v5";
import { useToast } from "../../components/Feedback";
import {
  BoardIcon,
  BookIcon,
  CalendarIcon,
  CheckCircleIcon,
  CloseIcon,
  DriveIcon,
  FolderFilledIcon,
  FolderIcon,
  FolderPlusIcon,
  KeyIcon,
  LinkIcon,
  LockIcon,
  NotesIcon,
  PlusIcon,
  SearchIcon,
  SlidesIcon,
  UnlockIcon,
  type IconComponent,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { useI18n, type TranslationKey } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { useAccounts } from "../../store/accounts";
import { useVaultKey } from "../../store/vaultSession";
import type { Project } from "../../types4";
import type { LinkedItem, LinkKind } from "../../types5";
import { vaultHints } from "../vault/vaultHints";

const SECTIONS: {
  kind: Exclude<LinkKind, "drive">;
  label: TranslationKey;
  icon: IconComponent;
  newLabel: TranslationKey;
}[] = [
  { kind: "board", label: "nav.boards", icon: BoardIcon, newLabel: "projects.conn.newBoard" },
  { kind: "task", label: "nav.tasks", icon: CheckCircleIcon, newLabel: "projects.conn.newTask" },
  { kind: "note", label: "nav.notes", icon: NotesIcon, newLabel: "projects.conn.newNote" },
  { kind: "doc", label: "nav.docs", icon: BookIcon, newLabel: "projects.conn.newDoc" },
  { kind: "deck", label: "nav.slides", icon: SlidesIcon, newLabel: "projects.conn.newDeck" },
];

async function createLinked(kind: Exclude<LinkKind, "drive">, title: string): Promise<number> {
  switch (kind) {
    case "board":
      return (await boardsApi.create(title, "gradient:ocean", "kanban")).id;
    case "task":
      return (await tasksApi.create({ title, due_date: null, category_id: null })).id;
    case "note":
      return (await notesApi.create({ title })).id;
    case "doc":
      return (await docsApi.create({ title, template: "blank" })).id;
    case "deck":
      return (await slidesApi.create({ title })).id;
  }
}

export function ProjectConnections({ project, canEdit }: { project: Project; canEdit: boolean }) {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  const key = ["project-links", project.id];
  const { data: links } = useQuery({ queryKey: key, queryFn: () => projectLinksApi.links(project.id) });
  const [picking, setPicking] = useState<Exclude<LinkKind, "drive"> | null>(null);
  const [creating, setCreating] = useState<Exclude<LinkKind, "drive"> | null>(null);
  const userId = useAccounts().active?.user.id ?? 0;
  const vaultKey = useVaultKey(userId);
  const { data: passwords = [] } = useQuery({
    queryKey: ["project-passwords", project.id, !!vaultKey],
    queryFn: () => vaultHints(vaultKey),
    enabled: !!vaultKey,
  });
  const ownPasswords = passwords.filter((p) => p.project_id === project.id);

  const refresh = () => client.invalidateQueries({ queryKey: key });
  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    } finally {
      await refresh();
    }
  }

  const folder = links?.drive.find((d) => d.icon === "📁") ?? links?.drive[0];
  const dates = [
    project.start_date && { date: project.start_date, title: t("projects.conn.start") },
    ...(project.milestones ?? [])
      .filter((m) => m.date)
      .map((m) => ({ date: m.date!, title: m.title, done: m.done })),
    project.end_date && { date: project.end_date, title: t("projects.conn.end") },
  ].filter(Boolean) as { date: string; title: string; done?: boolean }[];

  return (
    <div className="connections">
      <p className="muted connections-hint">{t("projects.conn.hint")}</p>
      <div className="connections-grid">
        <ConnCard
          kind="drive"
          icon={DriveIcon}
          title={t("projects.conn.drive")}
          count={calendar.formatNumber(folder ? 1 : 0)}
          actions={
            folder ? (
              <Link to={folder.url} className="button small">
                <FolderIcon /> {t("projects.conn.openFolder")}
              </Link>
            ) : canEdit ? (
              <button
                type="button"
                className="small"
                onClick={() =>
                  void run(async () => {
                    const created = await projectLinksApi.driveFolder(project.id);
                    navigate(created.url);
                  })
                }
              >
                <FolderPlusIcon /> {t("projects.conn.createFolder")}
              </button>
            ) : null
          }
        >
          {folder ? (
            <Link to={folder.url} className="conn-folder">
              <span className="conn-folder-icon" aria-hidden="true">
                <FolderFilledIcon />
              </span>
              <span>
                <strong dir="auto">{folder.title}</strong>
                <span className="muted small">{t("nav.drive")}</span>
              </span>
            </Link>
          ) : (
            <ConnEmpty icon={DriveIcon} text={t("projects.conn.noFolder")} />
          )}
        </ConnCard>

        <ConnCard
          kind="calendar"
          icon={CalendarIcon}
          title={t("nav.calendar")}
          count={calendar.formatNumber(dates.length)}
          actions={
            <Link to="/calendar" className="button small">
              <CalendarIcon /> {t("projects.conn.openCalendar")}
            </Link>
          }
        >
          {dates.length ? (
            <ul className="conn-dates">
              {dates
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((d, i) => (
                  <li key={i} data-done={d.done}>
                    <span className="conn-date">{calendar.shortDate(`${d.date}T12:00:00`)}</span>
                    <span className="conn-date-title" dir="auto">
                      {d.title}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <ConnEmpty icon={CalendarIcon} text={t("projects.conn.noDates")} />
          )}
        </ConnCard>

        {SECTIONS.map((section) => {
          const items = links?.[section.kind] ?? [];
          return (
            <ConnCard
              key={section.kind}
              kind={section.kind}
              icon={section.icon}
              title={t(section.label)}
              count={calendar.formatNumber(items.length)}
              actions={
                canEdit && (
                  <>
                    <button type="button" className="small" onClick={() => setCreating(section.kind)}>
                      <PlusIcon /> {t(section.newLabel)}
                    </button>
                    <button type="button" className="small ghost" onClick={() => setPicking(section.kind)}>
                      <LinkIcon /> {t("projects.conn.linkExisting")}
                    </button>
                  </>
                )
              }
            >
              {items.length ? (
                <ul className="conn-list">
                  {items.map((item) => (
                    <li key={item.id} data-done={item.done}>
                      <Link to={item.url} dir="auto">
                        {item.icon && <span aria-hidden="true">{item.icon} </span>}
                        {item.title || t("notes.untitled")}
                      </Link>
                      {item.date && (
                        <span className="muted small">{calendar.shortDate(`${item.date}T12:00:00`)}</span>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          className="icon-button small"
                          aria-label={t("projects.conn.unlink")}
                          onClick={() =>
                            void run(() => projectLinksApi.unlink(project.id, item.kind, item.id))
                          }
                        >
                          <CloseIcon />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <ConnEmpty icon={section.icon} text={t("projects.conn.empty")} />
              )}
            </ConnCard>
          );
        })}

        <ConnCard
          kind="password"
          icon={KeyIcon}
          title={t("nav.passwords")}
          count={vaultKey ? calendar.formatNumber(ownPasswords.length) : "—"}
          actions={
            <Link to="/passwords" className="button small">
              {vaultKey ? <KeyIcon /> : <UnlockIcon />}{" "}
              {vaultKey ? t("nav.passwords") : t("projects.conn.unlock")}
            </Link>
          }
        >
          {!vaultKey ? (
            <ConnEmpty icon={LockIcon} text={t("projects.conn.vaultLocked")} />
          ) : ownPasswords.length ? (
            <ul className="conn-list">
              {ownPasswords.map((p) => (
                <li key={p.id}>
                  <Link to={`/passwords?q=${encodeURIComponent(p.title)}`} dir="auto">
                    {p.title}
                  </Link>
                  <span className="muted small" dir="ltr">
                    {p.username}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ConnEmpty icon={KeyIcon} text={t("projects.conn.noPasswords")} />
          )}
        </ConnCard>
      </div>

      {creating && (
        <CreateDialog
          kind={creating}
          onClose={() => setCreating(null)}
          onCreate={async (title) => {
            const id = await createLinked(creating, title);
            await projectLinksApi.link(project.id, creating, id);
            await refresh();
            toast(t("projects.conn.created"), "success");
          }}
        />
      )}
      {picking && (
        <PickDialog
          project={project}
          kind={picking}
          onClose={() => setPicking(null)}
          onPick={async (item) => {
            await run(() => projectLinksApi.link(project.id, item.kind, item.id));
          }}
        />
      )}
    </div>
  );
}

function ConnCard({
  kind,
  icon: Icon,
  title,
  count,
  actions,
  children,
}: {
  kind: string;
  icon: IconComponent;
  title: string;
  count: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="conn-card" data-kind={kind}>
      <header>
        <span className="conn-icon">
          <Icon />
        </span>
        <h3>{title}</h3>
        <span className="conn-count">{count}</span>
      </header>
      <div className="conn-body">{children}</div>
      {actions && <footer className="conn-actions">{actions}</footer>}
    </section>
  );
}

function ConnEmpty({ icon: Icon, text }: { icon: IconComponent; text: string }) {
  return (
    <div className="conn-empty">
      <Icon />
      <span>{text}</span>
    </div>
  );
}

function CreateDialog({
  kind,
  onCreate,
  onClose,
}: {
  kind: Exclude<LinkKind, "drive">;
  onCreate: (title: string) => Promise<void>;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = SECTIONS.find((s) => s.kind === kind)!;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onCreate(title.trim());
      onClose();
    } catch (err) {
      setError(errorMessage(err, i18n));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t(label.newLabel)}
      description={t("projects.conn.createHint")}
      icon={label.icon}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" form="conn-create" className="primary" disabled={busy || !title.trim()}>
            {t("common.create")}
          </button>
        </>
      }
    >
      <form id="conn-create" onSubmit={submit} className="stack">
        <input
          type="text"
          dir="auto"
          data-autofocus
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("projects.conn.titlePlaceholder")}
        />
        {error && <p className="error-text">{error}</p>}
      </form>
    </Modal>
  );
}

function PickDialog({
  project,
  kind,
  onPick,
  onClose,
}: {
  project: Project;
  kind: Exclude<LinkKind, "drive">;
  onPick: (item: LinkedItem) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const {
    data: options = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["link-options", project.id, kind, q],
    queryFn: () => projectLinksApi.options(project.id, kind, q),
  });
  const label = SECTIONS.find((s) => s.kind === kind)!;
  return (
    <Modal
      title={t("projects.conn.linkTitle", { what: t(label.label) })}
      description={t("projects.conn.linkHint")}
      icon={LinkIcon}
      onClose={onClose}
      size="md"
    >
      <label className="search-field conn-search">
        <SearchIcon />
        <input
          dir="auto"
          data-autofocus
          value={q}
          placeholder={t("projects.conn.filter")}
          onChange={(event) => setQ(event.target.value)}
        />
      </label>
      {isLoading ? (
        <p className="muted">{t("common.loading")}</p>
      ) : !options.length ? (
        <p className="muted">{t("common.noResults")}</p>
      ) : (
        <ul className="conn-pick">
          {options.map((item) => (
            <li key={item.id}>
              <span className="conn-pick-text">
                <strong dir="auto">
                  {item.icon} {item.title || t("notes.untitled")}
                </strong>
                {item.project_id && <span className="badge">{t("projects.conn.inOtherProject")}</span>}
              </span>
              <button
                type="button"
                className="small"
                onClick={async () => {
                  await onPick(item);
                  await refetch();
                }}
              >
                <LinkIcon /> {t("projects.conn.link")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
