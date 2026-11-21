/**
 * One project, in tabs: overview (description, key facts, AI brief / status report /
 * risks), timeline (milestones), budget (expenses), team, links (repositories, social
 * media, websites), files (with folders) and important notes, plus settings.
 * Every change is saved right away (text fields after a short pause).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/react";
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { boardsApi, filesApi } from "../../api/endpoints";
import { useCategories } from "../../api/queries";
import { aiToolsApi, docsApi, projectsApi } from "../../api/v4";
import { CategorySelect } from "../../components/CategoryBits";
import { DatePicker } from "../../components/DatePicker";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  ArchiveIcon,
  BackIcon,
  BoardIcon,
  BookIcon,
  BranchIcon,
  CalendarIcon,
  CheckIcon,
  DownloadIcon,
  FileIcon,
  FlagIcon,
  FolderIcon,
  GlobeIcon,
  InboxIcon,
  LayersIcon,
  LinkIcon,
  MoneyIcon,
  NotesIcon,
  PinIcon,
  PlusIcon,
  SettingsIcon,
  ShareIcon,
  SparkleIcon,
  StarIcon,
  TargetIcon,
  TrashIcon,
  UploadIcon,
  UsersIcon,
} from "../../components/Icons";
import { ColorPicker, EmptyState, Skeleton } from "../../components/ui";
import { useAutosave } from "../../hooks/useAutosave";
import { useI18n, type TranslationKey } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { newId } from "../../lib/boards";
import { coverStyle } from "../../lib/covers";
import { formatBytes } from "../../lib/embeds";
import { markdownToContent, plainTextToDoc } from "../../lib/markdown";
import { categoryStyle } from "../../lib/palette";
import type { ColorName } from "../../types";
import type {
  Expense,
  Milestone,
  Priority,
  Project,
  ProjectChanges,
  ProjectFile,
  ProjectLink,
  ProjectMember,
  ProjectNote,
  ProjectStatus,
  Repository,
} from "../../types4";
import { AiSuggestDialog } from "../ai/AiSuggestDialog";
import { NoteEditor } from "../editor/NoteEditor";
import { CoverPicker } from "../notes/CoverPicker";
import { ShareDialog } from "../sharing/ShareDialog";
import { ProjectConnections } from "./ProjectConnections";
import { daysLeft, KINDS, money, ProgressRing, projectsKey, STATUSES } from "./ProjectsPage";

type Tab =
  "overview" | "connected" | "timeline" | "budget" | "team" | "links" | "files" | "notes" | "settings";
const TABS: { id: Tab; label: TranslationKey; icon: () => React.JSX.Element }[] = [
  { id: "overview", label: "projects.tab.overview", icon: TargetIcon },
  { id: "connected", label: "projects.tab.connected", icon: LayersIcon },
  { id: "timeline", label: "projects.tab.timeline", icon: FlagIcon },
  { id: "budget", label: "projects.tab.budget", icon: MoneyIcon },
  { id: "team", label: "projects.tab.team", icon: UsersIcon },
  { id: "links", label: "projects.tab.links", icon: LinkIcon },
  { id: "files", label: "projects.tab.files", icon: FolderIcon },
  { id: "notes", label: "projects.tab.notes", icon: PinIcon },
  { id: "settings", label: "projects.tab.settings", icon: SettingsIcon },
];
const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
const projectKey = (id: number) => ["project", id] as const;

export function ProjectPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const { t } = useI18n();
  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: projectKey(projectId),
    queryFn: () => projectsApi.get(projectId),
  });
  if (isLoading) return <Skeleton rows={6} />;
  if (error || !project) {
    return (
      <EmptyState
        icon={InboxIcon}
        title={t("errors.project_not_found")}
        action={
          <Link to="/projects" className="button">
            {t("common.back")}
          </Link>
        }
      />
    );
  }
  return <ProjectView project={project} />;
}

interface Ctx {
  project: Project;
  canEdit: boolean;
  patch: (changes: ProjectChanges) => Promise<void>;
  later: (changes: ProjectChanges) => void;
}

function ProjectView({ project }: { project: Project }) {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const client = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [sharing, setSharing] = useState(false);
  const canEdit = project.role !== "viewer";
  const locale = calendar.locale;

  const apply = (saved: Project) => {
    client.setQueryData(projectKey(project.id), saved);
    void client.invalidateQueries({ queryKey: projectsKey });
  };
  const patch = async (changes: ProjectChanges) => {
    client.setQueryData<Project>(projectKey(project.id), (old) =>
      old ? ({ ...old, ...changes } as Project) : old,
    );
    try {
      apply(await projectsApi.update(project.id, changes));
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
      void client.invalidateQueries({ queryKey: projectKey(project.id) });
    }
  };
  const { schedule } = useAutosave<ProjectChanges>(async (changes) =>
    apply(await projectsApi.update(project.id, changes)),
  );
  const later = (changes: ProjectChanges) => {
    client.setQueryData<Project>(projectKey(project.id), (old) =>
      old ? ({ ...old, ...changes } as Project) : old,
    );
    schedule(changes);
  };
  const ctx: Ctx = { project, canEdit, patch, later };
  const left = daysLeft(project.end_date);
  const budget = project.budget != null ? Number(project.budget) : null;
  const spent = Number(project.spent);

  return (
    <div className="project-page" style={categoryStyle(project.color)}>
      <header className="project-hero" style={project.cover ? coverStyle(project.cover) : undefined}>
        <div className="project-hero-inner">
          <Link to="/projects" className="icon-button" aria-label={t("nav.projects")}>
            <BackIcon />
          </Link>
          <span className="project-hero-icon">{project.icon || "🚀"}</span>
          <div className="project-hero-text">
            <input
              className="project-title-input"
              value={project.name}
              readOnly={!canEdit}
              maxLength={120}
              aria-label={t("projects.name")}
              onChange={(event) => later({ name: event.target.value })}
            />
            <input
              className="project-summary-input"
              value={project.summary}
              readOnly={!canEdit}
              maxLength={300}
              placeholder={canEdit ? t("projects.summaryPlaceholder") : ""}
              onChange={(event) => later({ summary: event.target.value })}
            />
          </div>
          <div className="project-hero-actions">
            <button
              type="button"
              className="icon-button"
              aria-pressed={project.starred}
              title={t("projects.star")}
              disabled={!canEdit}
              onClick={() => void patch({ starred: !project.starred })}
            >
              <StarIcon />
            </button>
            {!project.shared && canEdit && (
              <button type="button" className="ghost small" onClick={() => setSharing(true)}>
                <ShareIcon /> {t("page.share")}
              </button>
            )}
          </div>
        </div>
        <div className="project-hero-stats">
          <ProgressRing value={project.progress} size={56} />
          <div className="hero-stat">
            <span className="muted small">{t("projects.statusLabel")}</span>
            <select
              value={project.status}
              disabled={!canEdit}
              onChange={(event) => void patch({ status: event.target.value as ProjectStatus })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`projects.status.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="hero-stat">
            <span className="muted small">{t("projects.deadline")}</span>
            <strong data-late={left != null && left < 0 && project.status !== "completed"}>
              {project.end_date
                ? left != null && project.status !== "completed"
                  ? left < 0
                    ? t("projects.overdue", { count: -left })
                    : t("projects.daysLeft", { count: left })
                  : calendar.shortDate(project.end_date)
                : "—"}
            </strong>
          </div>
          <div className="hero-stat">
            <span className="muted small">{t("projects.tab.budget")}</span>
            <strong>
              {budget != null
                ? `${money(spent, project.currency, locale)} / ${money(budget, project.currency, locale)}`
                : "—"}
            </strong>
          </div>
          <div className="hero-stat">
            <span className="muted small">{t("projects.milestonesLabel")}</span>
            <strong>
              {calendar.formatNumber(project.milestones_done)} /{" "}
              {calendar.formatNumber(project.milestone_count)}
            </strong>
          </div>
        </div>
      </header>

      <nav className="project-tabs" role="tablist">
        {TABS.map(({ id, label, icon: TabIcon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            <TabIcon /> {t(label)}
          </button>
        ))}
      </nav>

      <div className="project-content">
        {tab === "overview" && <Overview ctx={ctx} />}
        {tab === "connected" && <ProjectConnections project={project} canEdit={ctx.canEdit} />}
        {tab === "timeline" && <Timeline ctx={ctx} />}
        {tab === "budget" && <Budget ctx={ctx} />}
        {tab === "team" && <Team ctx={ctx} />}
        {tab === "links" && <Links ctx={ctx} />}
        {tab === "files" && <Files ctx={ctx} />}
        {tab === "notes" && <ImportantNotes ctx={ctx} />}
        {tab === "settings" && <Settings ctx={ctx} />}
      </div>
      {sharing && (
        <ShareDialog
          kind="project"
          itemId={project.id}
          title={project.name}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}

function Card({
  title,
  icon: CardIcon,
  actions,
  children,
}: {
  title: string;
  icon?: () => React.JSX.Element;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card project-card-section">
      <div className="row-between">
        <h2 className="section-title">
          {CardIcon && <CardIcon />} {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- overview

function projectFacts(project: Project): string {
  return [
    `Project: ${project.name}`,
    project.summary,
    `Type: ${project.kind}. Status: ${project.status}. Priority: ${project.priority}.`,
    project.client && `Client: ${project.client}`,
    `Dates: ${project.start_date ?? "?"} to ${project.end_date ?? "?"}`,
    project.budget != null && `Budget: ${project.budget} ${project.currency}, spent ${project.spent}`,
    ...project.milestones.map(
      (m) => `Milestone: ${m.title} (${m.date ?? "no date"}, ${m.done ? "done" : "open"})`,
    ),
    ...project.members.map((m) => `Member: ${m.name} - ${m.role}`),
    ...project.notes.map((n) => `Note: ${n.text}`),
    project.description_text,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 11000);
}

function Overview({ ctx }: { ctx: Ctx }) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const { project, canEdit, later } = ctx;
  const [ai, setAi] = useState<{ kind: "project_brief" | "status_report"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [risks, setRisks] = useState(false);
  const insert = useRef<((markdown: string) => void) | null>(null);
  const initial = useMemo<JSONContent>(
    () => (project.description as JSONContent | null) ?? plainTextToDoc(project.description_text),
    // Only on first render: the editor is uncontrolled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function generate(kind: "project_brief" | "status_report") {
    setBusy(kind);
    try {
      const result = await aiToolsApi.generate({ kind, text: projectFacts(project) });
      setAi({ kind, text: result.text });
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="project-overview">
      <Card
        title={t("projects.description")}
        icon={NotesIcon}
        actions={
          canEdit && (
            <div className="row-actions">
              <button
                type="button"
                className="ghost small"
                disabled={busy !== null}
                onClick={() => void generate("project_brief")}
              >
                <SparkleIcon /> {busy === "project_brief" ? t("ai.thinking") : t("projects.aiBrief")}
              </button>
              <button
                type="button"
                className="ghost small"
                disabled={busy !== null}
                onClick={() => void generate("status_report")}
              >
                <SparkleIcon /> {busy === "status_report" ? t("ai.thinking") : t("projects.aiStatus")}
              </button>
              <button type="button" className="ghost small" onClick={() => setRisks(true)}>
                <SparkleIcon /> {t("projects.aiRisks")}
              </button>
            </div>
          )
        }
      >
        {ai && (
          <div className="ai-box">
            <div className="row-between">
              <strong>
                <SparkleIcon /> {t(ai.kind === "project_brief" ? "projects.aiBrief" : "projects.aiStatus")}
              </strong>
              <div className="row-actions">
                {canEdit && (
                  <button
                    type="button"
                    className="primary small"
                    onClick={() => {
                      insert.current?.(ai.text);
                      setAi(null);
                    }}
                  >
                    {t("ai.insert")}
                  </button>
                )}
                <button type="button" className="ghost small" onClick={() => setAi(null)}>
                  {t("common.close")}
                </button>
              </div>
            </div>
            <pre className="ai-result" dir="auto">
              {ai.text}
            </pre>
          </div>
        )}
        <div className="project-description">
          <NoteEditor
            initialContent={initial}
            editable={canEdit}
            onChange={(description, description_text) => later({ description, description_text })}
            onReady={(editor) => {
              insert.current = (markdown) =>
                editor.chain().focus("end").insertContent(markdownToContent(markdown)).run();
            }}
          />
        </div>
      </Card>
      <div className="project-side">
        <Card title={t("projects.keyFacts")} icon={TargetIcon}>
          <dl className="facts">
            <dt>{t("projects.kindLabel")}</dt>
            <dd>
              {KINDS.find((k) => k.id === project.kind)?.icon} {t(`projects.kind.${project.kind}`)}
            </dd>
            <dt>{t("projects.priorityLabel")}</dt>
            <dd>
              <span className={`priority priority-${project.priority}`}>
                {t(`projects.priority.${project.priority}`)}
              </span>
            </dd>
            <dt>{t("projects.client")}</dt>
            <dd dir="auto">{project.client || "—"}</dd>
            <dt>{t("projects.tab.team")}</dt>
            <dd>{project.members.map((m) => m.name).join(", ") || "—"}</dd>
          </dl>
          {project.tags.length > 0 && (
            <div className="tag-row">
              {project.tags.map((tag) => (
                <span key={tag} className="tag">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </Card>
        <LinkedWork project={project} />
        {project.notes.some((n) => n.pinned) && (
          <Card title={t("projects.pinned")} icon={PinIcon}>
            {project.notes
              .filter((n) => n.pinned)
              .map((note) => (
                <p key={note.id} className="sticky small" data-color={note.color} dir="auto">
                  {note.text}
                </p>
              ))}
          </Card>
        )}
      </div>
      {risks && (
        <AiSuggestDialog
          kind="risks"
          title={t("projects.aiRisks")}
          initialText={projectFacts(project)}
          count={5}
          confirmLabel={t("projects.saveAsNotes")}
          onClose={() => setRisks(false)}
          onAccept={async (items) => {
            await ctx.patch({
              notes: [
                ...project.notes,
                ...items.map((item) => ({
                  id: newId(),
                  text: `⚠️ ${item.title}: ${item.detail}`,
                  color: "red",
                  pinned: false,
                })),
              ],
            });
          }}
        />
      )}
    </div>
  );
}

function LinkedWork({ project }: { project: Project }) {
  const { t } = useI18n();
  const board = useQuery({
    queryKey: ["board-mini", project.board_id],
    queryFn: () => boardsApi.get(project.board_id as number),
    enabled: project.board_id != null,
  });
  const space = useQuery({
    queryKey: ["doc-mini", project.doc_space_id],
    queryFn: () => docsApi.get(project.doc_space_id as number),
    enabled: project.doc_space_id != null,
  });
  if (!project.board_id && !project.doc_space_id) return null;
  return (
    <Card title={t("projects.linked")} icon={LinkIcon}>
      {board.data && (
        <Link to={`/boards/${board.data.id}`} className="linked-item">
          <BoardIcon /> <span dir="auto">{board.data.title}</span>
          <span className="muted small">
            {t("projects.cards", { count: board.data.lists.reduce((n, l) => n + l.cards.length, 0) })}
          </span>
        </Link>
      )}
      {space.data && (
        <Link to={`/docs/${space.data.id}`} className="linked-item">
          <BookIcon /> <span dir="auto">{space.data.title}</span>
          <span className="muted small">{t("projects.pagesCount", { count: space.data.pages.length })}</span>
        </Link>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- timeline

function Timeline({ ctx }: { ctx: Ctx }) {
  const { t, calendar } = useI18n();
  const { project, canEdit, patch } = ctx;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [suggest, setSuggest] = useState(false);
  const milestones = [...project.milestones].sort((a, b) =>
    (a.date ?? "9999").localeCompare(b.date ?? "9999"),
  );
  const save = (next: Milestone[]) => void patch({ milestones: next });
  const start = project.start_date ? new Date(project.start_date).getTime() : null;
  const end = project.end_date ? new Date(project.end_date).getTime() : null;
  const position = (iso: string | null) =>
    iso && start != null && end != null && end > start
      ? Math.min(100, Math.max(0, ((new Date(iso).getTime() - start) / (end - start)) * 100))
      : null;
  const today = position(new Date().toISOString().slice(0, 10));

  function add(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    save([...project.milestones, { id: newId(), title: title.trim(), date, done: false }]);
    setTitle("");
    setDate(null);
  }

  return (
    <div className="stack">
      <Card
        title={t("projects.tab.timeline")}
        icon={CalendarIcon}
        actions={
          canEdit && (
            <button type="button" className="ghost small" onClick={() => setSuggest(true)}>
              <SparkleIcon /> {t("projects.aiMilestones")}
            </button>
          )
        }
      >
        <div className="form-grid">
          <div className="field">
            <span className="field-label">{t("projects.start")}</span>
            <DatePicker
              value={project.start_date}
              onChange={(start_date) => canEdit && void patch({ start_date })}
            />
          </div>
          <div className="field">
            <span className="field-label">{t("projects.end")}</span>
            <DatePicker
              value={project.end_date}
              onChange={(end_date) => canEdit && void patch({ end_date })}
            />
          </div>
        </div>
        {start != null && end != null && (
          <div className="timeline-bar" aria-hidden="true">
            <span className="timeline-fill" style={{ width: `${project.progress}%` }} />
            {today != null && <span className="timeline-today" style={{ insetInlineStart: `${today}%` }} />}
            {milestones.map((m) => {
              const at = position(m.date);
              return at == null ? null : (
                <span
                  key={m.id}
                  className="timeline-dot"
                  data-done={m.done}
                  style={{ insetInlineStart: `${at}%` }}
                  title={m.title}
                />
              );
            })}
          </div>
        )}
      </Card>
      <Card title={t("projects.milestonesLabel")} icon={FlagIcon}>
        <ul className="milestone-list">
          {milestones.map((milestone) => (
            <li key={milestone.id} data-done={milestone.done}>
              <input
                type="checkbox"
                checked={milestone.done}
                disabled={!canEdit}
                aria-label={milestone.title}
                onChange={() =>
                  save(project.milestones.map((m) => (m.id === milestone.id ? { ...m, done: !m.done } : m)))
                }
              />
              <span className="milestone-title" dir="auto">
                {milestone.title}
              </span>
              <span className="muted small">{milestone.date ? calendar.shortDay(milestone.date) : "—"}</span>
              {canEdit && (
                <button
                  type="button"
                  className="icon-button small danger"
                  aria-label={t("common.delete")}
                  onClick={() => save(project.milestones.filter((m) => m.id !== milestone.id))}
                >
                  <TrashIcon />
                </button>
              )}
            </li>
          ))}
          {!milestones.length && <li className="muted small">{t("projects.noMilestones")}</li>}
        </ul>
        {canEdit && (
          <form className="inline-form" onSubmit={add}>
            <input
              value={title}
              maxLength={200}
              placeholder={t("projects.newMilestone")}
              onChange={(event) => setTitle(event.target.value)}
            />
            <DatePicker value={date} onChange={setDate} compact />
            <button type="submit" className="button" disabled={!title.trim()}>
              <PlusIcon /> {t("common.add")}
            </button>
          </form>
        )}
      </Card>
      {suggest && (
        <AiSuggestDialog
          kind="milestones"
          title={t("projects.aiMilestones")}
          initialText={projectFacts(project)}
          count={6}
          showDates
          onClose={() => setSuggest(false)}
          onAccept={async (items) => {
            await patch({
              milestones: [
                ...project.milestones,
                ...items.map((item) => ({ id: newId(), title: item.title, date: item.date, done: false })),
              ],
            });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- budget

function Budget({ ctx }: { ctx: Ctx }) {
  const { t, calendar } = useI18n();
  const { project, canEdit, patch, later } = ctx;
  const locale = calendar.locale;
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState<string | null>(new Date().toISOString().slice(0, 10));
  const budget = project.budget != null ? Number(project.budget) : 0;
  const spent = Number(project.spent);
  const ratio = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const byCategory = useMemo(() => {
    const totals = new Map<string, number>();
    project.expenses.forEach((e) =>
      totals.set(
        e.category || t("projects.uncategorized"),
        (totals.get(e.category || t("projects.uncategorized")) ?? 0) + Number(e.amount),
      ),
    );
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [project.expenses, t]);

  function add(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!title.trim() || !Number.isFinite(value) || value < 0) return;
    void patch({
      expenses: [
        ...project.expenses,
        { id: newId(), title: title.trim(), amount: value, date, category: category.trim() } as Expense,
      ],
    });
    setTitle("");
    setAmount("");
  }

  return (
    <div className="budget-layout">
      <Card title={t("projects.tab.budget")} icon={MoneyIcon}>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">{t("projects.budgetTotal")}</span>
            <input
              type="number"
              min={0}
              step="any"
              dir="ltr"
              disabled={!canEdit}
              value={project.budget ?? ""}
              onChange={(event) => later({ budget: event.target.value === "" ? null : event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">{t("projects.currency")}</span>
            <select
              value={project.currency}
              disabled={!canEdit}
              onChange={(event) => void patch({ currency: event.target.value })}
            >
              {["IRR", "IRT", "USD", "EUR", "GBP", "AED", "TRY"].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="budget-meter" data-over={spent > budget && budget > 0}>
          <div className="row-between small">
            <span>{t("projects.spent", { amount: money(spent, project.currency, locale) })}</span>
            <span>
              {t("projects.remaining", {
                amount: money(Math.max(budget - spent, 0), project.currency, locale),
              })}
            </span>
          </div>
          <span className="bar">
            <span style={{ width: `${ratio}%` }} />
          </span>
          {spent > budget && budget > 0 && <p className="error-text small">{t("projects.overBudget")}</p>}
        </div>
        {byCategory.length > 0 && (
          <ul className="category-breakdown">
            {byCategory.map(([name, total]) => (
              <li key={name}>
                <span dir="auto">{name}</span>
                <span className="bar small">
                  <span style={{ width: `${spent ? (total / spent) * 100 : 0}%` }} />
                </span>
                <span className="small">{money(total, project.currency, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t("projects.expenses")} icon={FileIcon}>
        <table className="data-table compact">
          <tbody>
            {project.expenses.map((expense) => (
              <tr key={expense.id}>
                <td dir="auto">{expense.title}</td>
                <td className="muted small">{expense.category}</td>
                <td className="muted small">{expense.date ? calendar.shortDay(expense.date) : ""}</td>
                <td>{money(expense.amount, project.currency, locale)}</td>
                <td>
                  {canEdit && (
                    <button
                      type="button"
                      className="icon-button small danger"
                      aria-label={t("common.delete")}
                      onClick={() =>
                        void patch({ expenses: project.expenses.filter((e) => e.id !== expense.id) })
                      }
                    >
                      <TrashIcon />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!project.expenses.length && <p className="muted small">{t("projects.noExpenses")}</p>}
        {canEdit && (
          <form className="inline-form wrap" onSubmit={add}>
            <input
              value={title}
              placeholder={t("projects.expenseTitle")}
              onChange={(event) => setTitle(event.target.value)}
            />
            <input
              type="number"
              min={0}
              step="any"
              dir="ltr"
              value={amount}
              placeholder={t("projects.amount")}
              onChange={(event) => setAmount(event.target.value)}
            />
            <input
              value={category}
              placeholder={t("projects.expenseCategory")}
              onChange={(event) => setCategory(event.target.value)}
            />
            <DatePicker value={date} onChange={setDate} compact />
            <button type="submit" className="button" disabled={!title.trim() || !amount}>
              <PlusIcon /> {t("common.add")}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- team

function Team({ ctx }: { ctx: Ctx }) {
  const { t } = useI18n();
  const { project, canEdit, patch } = ctx;
  const [draft, setDraft] = useState({ name: "", role: "", email: "" });

  function add(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    void patch({
      members: [
        ...project.members,
        {
          id: newId(),
          name: draft.name.trim(),
          role: draft.role.trim(),
          email: draft.email.trim(),
          user_id: null,
        } as ProjectMember,
      ],
    });
    setDraft({ name: "", role: "", email: "" });
  }

  return (
    <Card title={t("projects.tab.team")} icon={UsersIcon}>
      <div className="member-grid">
        {project.members.map((member) => (
          <div key={member.id} className="member-card">
            <span className="avatar avatar-md" aria-hidden="true">
              {member.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="member-text">
              <strong dir="auto">{member.name}</strong>
              <span className="muted small" dir="auto">
                {member.role || "—"}
              </span>
              {member.email && (
                <a href={`mailto:${member.email}`} className="small" dir="ltr">
                  {member.email}
                </a>
              )}
            </span>
            {canEdit && (
              <button
                type="button"
                className="icon-button small danger"
                aria-label={t("common.delete")}
                onClick={() => void patch({ members: project.members.filter((m) => m.id !== member.id) })}
              >
                <TrashIcon />
              </button>
            )}
          </div>
        ))}
        {!project.members.length && <p className="muted small">{t("projects.noMembers")}</p>}
      </div>
      {canEdit && (
        <form className="inline-form wrap" onSubmit={add}>
          <input
            value={draft.name}
            placeholder={t("projects.memberName")}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
          <input
            value={draft.role}
            placeholder={t("projects.memberRole")}
            onChange={(event) => setDraft({ ...draft, role: event.target.value })}
          />
          <input
            type="email"
            dir="ltr"
            value={draft.email}
            placeholder={t("auth.email")}
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
          />
          <button type="submit" className="button" disabled={!draft.name.trim()}>
            <PlusIcon /> {t("common.add")}
          </button>
        </form>
      )}
      <p className="hint">{t("projects.teamHint")}</p>
    </Card>
  );
}

// ---------------------------------------------------------------- links

const SOCIALS = [
  "website",
  "github",
  "gitlab",
  "instagram",
  "telegram",
  "linkedin",
  "x",
  "youtube",
  "dribbble",
  "behance",
  "figma",
  "other",
];

function providerOf(url: string): string {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  if (host.includes("github")) return "github";
  if (host.includes("gitlab")) return "gitlab";
  if (host.includes("bitbucket")) return "bitbucket";
  return host.split(".")[0] || "git";
}

function Links({ ctx }: { ctx: Ctx }) {
  const { t } = useI18n();
  const { project, canEdit, patch } = ctx;
  const [repo, setRepo] = useState({ url: "", branch: "" });
  const [link, setLink] = useState({ url: "", title: "", kind: "website" });
  const valid = (url: string) => /^https?:\/\/\S+$/.test(url.trim());

  return (
    <div className="links-layout">
      <Card title={t("projects.repositories")} icon={BranchIcon}>
        <ul className="link-list">
          {project.repositories.map((r) => (
            <li key={r.id}>
              <span className="badge">{r.provider}</span>
              <a href={r.url} target="_blank" rel="noopener noreferrer" dir="ltr">
                {r.name || r.url.replace(/^https?:\/\//, "")}
              </a>
              {r.branch && (
                <span className="chip small" dir="ltr">
                  <BranchIcon /> {r.branch}
                </span>
              )}
              {canEdit && (
                <button
                  type="button"
                  className="icon-button small danger"
                  aria-label={t("common.delete")}
                  onClick={() =>
                    void patch({ repositories: project.repositories.filter((x) => x.id !== r.id) })
                  }
                >
                  <TrashIcon />
                </button>
              )}
            </li>
          ))}
          {!project.repositories.length && <li className="muted small">{t("projects.noRepos")}</li>}
        </ul>
        {canEdit && (
          <form
            className="inline-form wrap"
            onSubmit={(event) => {
              event.preventDefault();
              if (!valid(repo.url)) return;
              const name = repo.url.replace(/^https?:\/\/[^/]+\//, "").replace(/\.git$/, "");
              void patch({
                repositories: [
                  ...project.repositories,
                  {
                    id: newId(),
                    url: repo.url.trim(),
                    name,
                    branch: repo.branch.trim(),
                    provider: providerOf(repo.url),
                  } as Repository,
                ],
              });
              setRepo({ url: "", branch: "" });
            }}
          >
            <input
              dir="ltr"
              type="url"
              placeholder="https://github.com/user/repo"
              value={repo.url}
              onChange={(event) => setRepo({ ...repo, url: event.target.value })}
            />
            <input
              dir="ltr"
              placeholder="main"
              value={repo.branch}
              onChange={(event) => setRepo({ ...repo, branch: event.target.value })}
            />
            <button type="submit" className="button" disabled={!valid(repo.url)}>
              <PlusIcon /> {t("common.add")}
            </button>
          </form>
        )}
      </Card>
      <Card title={t("projects.socialLinks")} icon={GlobeIcon}>
        <ul className="link-list">
          {project.links.map((l) => (
            <li key={l.id}>
              <span className="badge">{t(`projects.social.${l.kind}` as TranslationKey)}</span>
              <a href={l.url} target="_blank" rel="noopener noreferrer" dir="auto">
                {l.title || l.url.replace(/^https?:\/\//, "")}
              </a>
              {canEdit && (
                <button
                  type="button"
                  className="icon-button small danger"
                  aria-label={t("common.delete")}
                  onClick={() => void patch({ links: project.links.filter((x) => x.id !== l.id) })}
                >
                  <TrashIcon />
                </button>
              )}
            </li>
          ))}
          {!project.links.length && <li className="muted small">{t("projects.noLinks")}</li>}
        </ul>
        {canEdit && (
          <form
            className="inline-form wrap"
            onSubmit={(event) => {
              event.preventDefault();
              if (!valid(link.url)) return;
              void patch({
                links: [
                  ...project.links,
                  {
                    id: newId(),
                    url: link.url.trim(),
                    title: link.title.trim(),
                    kind: link.kind,
                  } as ProjectLink,
                ],
              });
              setLink({ url: "", title: "", kind: link.kind });
            }}
          >
            <select value={link.kind} onChange={(event) => setLink({ ...link, kind: event.target.value })}>
              {SOCIALS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`projects.social.${kind}` as TranslationKey)}
                </option>
              ))}
            </select>
            <input
              dir="ltr"
              type="url"
              placeholder="https://"
              value={link.url}
              onChange={(event) => setLink({ ...link, url: event.target.value })}
            />
            <input
              placeholder={t("projects.linkTitle")}
              value={link.title}
              onChange={(event) => setLink({ ...link, title: event.target.value })}
            />
            <button type="submit" className="button" disabled={!valid(link.url)}>
              <PlusIcon /> {t("common.add")}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- files

function Files({ ctx }: { ctx: Ctx }) {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const { project, canEdit, patch } = ctx;
  const input = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState<string>("");
  const [progress, setProgress] = useState<number | null>(null);
  const folders = useMemo(
    () => [...new Set(project.files.map((f) => f.folder).filter(Boolean))].sort(),
    [project.files],
  );
  const shown = project.files.filter((f) => !folder || f.folder === folder);

  async function upload(files: File[]) {
    const added: ProjectFile[] = [];
    for (const file of files) {
      try {
        setProgress(0);
        const stored = await filesApi.upload(file, setProgress);
        added.push({
          id: newId(),
          url: stored.url,
          name: file.name.slice(0, 255),
          size: stored.size,
          content_type: stored.content_type,
          folder,
          uploaded_at: new Date().toISOString(),
        });
      } catch (err) {
        toast(errorMessage(err, i18n), "error");
      }
    }
    setProgress(null);
    if (added.length) await patch({ files: [...project.files, ...added] });
  }

  return (
    <Card
      title={t("projects.tab.files")}
      icon={FolderIcon}
      actions={
        canEdit && (
          <button type="button" className="primary small" onClick={() => input.current?.click()}>
            <UploadIcon /> {t("projects.upload")}
          </button>
        )
      }
    >
      <div className="folder-bar">
        <button type="button" className="chip" aria-pressed={!folder} onClick={() => setFolder("")}>
          {t("common.all")}
        </button>
        {folders.map((name) => (
          <button
            key={name}
            type="button"
            className="chip"
            aria-pressed={folder === name}
            onClick={() => setFolder(name)}
          >
            <FolderIcon /> {name}
          </button>
        ))}
        {canEdit && (
          <button
            type="button"
            className="chip ghost"
            onClick={() => {
              const name = window.prompt(t("projects.newFolder"))?.trim();
              if (name) setFolder(name.slice(0, 60));
            }}
          >
            <PlusIcon /> {t("projects.newFolder")}
          </button>
        )}
      </div>
      {progress !== null && (
        <div className="upload-progress">
          <span>{t("editor.uploading")}</span>
          <span className="upload-bar">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        </div>
      )}
      <div
        className="file-drop"
        onDragOver={(event) => canEdit && event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (canEdit) void upload(Array.from(event.dataTransfer.files));
        }}
      >
        {shown.length ? (
          <ul className="file-list">
            {shown.map((file) => (
              <li key={file.id}>
                {file.content_type.startsWith("image/") ? (
                  <img src={file.url} alt="" className="file-thumb" loading="lazy" />
                ) : (
                  <span className="file-thumb icon">
                    <FileIcon />
                  </span>
                )}
                <span className="file-text">
                  <a href={file.url} target="_blank" rel="noreferrer" dir="auto">
                    {file.name}
                  </a>
                  <span className="muted small">
                    {formatBytes(file.size, calendar.formatNumber)}
                    {file.uploaded_at && ` · ${calendar.shortDate(file.uploaded_at)}`}
                    {file.folder && ` · ${file.folder}`}
                  </span>
                </span>
                <a
                  href={file.url}
                  download={file.name}
                  className="icon-button small"
                  aria-label={t("common.download")}
                >
                  <DownloadIcon />
                </a>
                {canEdit && (
                  <button
                    type="button"
                    className="icon-button small danger"
                    aria-label={t("common.delete")}
                    onClick={() => void patch({ files: project.files.filter((f) => f.id !== file.id) })}
                  >
                    <TrashIcon />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">{canEdit ? t("projects.dropFiles") : t("projects.noFiles")}</p>
        )}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) void upload(files);
        }}
      />
    </Card>
  );
}

// ---------------------------------------------------------------- notes

const NOTE_COLORS = ["amber", "blue", "green", "red", "violet", "slate"];

function ImportantNotes({ ctx }: { ctx: Ctx }) {
  const { t } = useI18n();
  const { project, canEdit, patch } = ctx;
  const [text, setText] = useState("");
  const [color, setColor] = useState("amber");
  const notes = [...project.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const save = (next: ProjectNote[]) => void patch({ notes: next });

  return (
    <Card title={t("projects.tab.notes")} icon={PinIcon}>
      {canEdit && (
        <form
          className="sticky-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) return;
            save([...project.notes, { id: newId(), text: text.trim(), color, pinned: false }]);
            setText("");
          }}
        >
          <textarea
            rows={2}
            maxLength={2000}
            value={text}
            placeholder={t("projects.notePlaceholder")}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="row-between">
            <div className="color-dots">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="color-dot"
                  data-color={c}
                  aria-pressed={color === c}
                  aria-label={c}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <button type="submit" className="button small" disabled={!text.trim()}>
              <PlusIcon /> {t("common.add")}
            </button>
          </div>
        </form>
      )}
      <div className="sticky-grid">
        {notes.map((note) => (
          <div key={note.id} className="sticky" data-color={note.color} data-pinned={note.pinned}>
            <p dir="auto">{note.text}</p>
            {canEdit && (
              <div className="sticky-actions">
                <button
                  type="button"
                  className="icon-button small"
                  aria-pressed={note.pinned}
                  title={note.pinned ? t("projects.unpin") : t("projects.pin")}
                  onClick={() =>
                    save(project.notes.map((n) => (n.id === note.id ? { ...n, pinned: !n.pinned } : n)))
                  }
                >
                  <PinIcon />
                </button>
                <button
                  type="button"
                  className="icon-button small"
                  aria-label={t("common.delete")}
                  onClick={() => save(project.notes.filter((n) => n.id !== note.id))}
                >
                  <TrashIcon />
                </button>
              </div>
            )}
          </div>
        ))}
        {!notes.length && <p className="muted small">{t("projects.noNotes")}</p>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- settings

function Settings({ ctx }: { ctx: Ctx }) {
  const { t } = useI18n();
  const { project, canEdit, patch, later } = ctx;
  const confirm = useConfirm();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { data: categories = [] } = useCategories();
  const boards = useQuery({ queryKey: ["boards"], queryFn: boardsApi.list });
  const docs = useQuery({ queryKey: ["docs"], queryFn: docsApi.list });
  const [tags, setTags] = useState(project.tags.join(", "));

  async function remove() {
    const ok = await confirm({
      title: t("projects.delete"),
      message: t("projects.deleteMessage", { name: project.name }),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    await projectsApi.remove(project.id);
    await client.invalidateQueries({ queryKey: projectsKey });
    navigate("/projects");
  }

  return (
    <div className="settings-grid-2">
      <Card title={t("projects.tab.settings")} icon={SettingsIcon}>
        <fieldset disabled={!canEdit} className="stack">
          <div className="form-grid">
            <label className="field">
              <span className="field-label">{t("projects.priorityLabel")}</span>
              <select
                value={project.priority}
                onChange={(event) => void patch({ priority: event.target.value as Priority })}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`projects.priority.${p}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">{t("projects.kindLabel")}</span>
              <select
                value={project.kind}
                onChange={(event) => void patch({ kind: event.target.value as Project["kind"] })}
              >
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.icon} {t(k.label)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">{t("projects.client")}</span>
              <input
                maxLength={120}
                value={project.client}
                onChange={(event) => later({ client: event.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">{t("projects.progressManual")}</span>
              <input
                type="number"
                min={0}
                max={100}
                placeholder={t("projects.progressAuto")}
                value={project.manual_progress ?? ""}
                onChange={(event) =>
                  later({
                    progress:
                      event.target.value === ""
                        ? null
                        : Math.min(100, Math.max(0, Number(event.target.value))),
                  })
                }
              />
            </label>
            <div className="field">
              <span className="field-label">{t("common.category")}</span>
              <CategorySelect
                categories={categories}
                value={project.category_id}
                onChange={(category_id) => void patch({ category_id })}
              />
            </div>
            <label className="field">
              <span className="field-label">{t("categories.emoji")}</span>
              <input
                className="emoji-input"
                maxLength={8}
                value={project.icon}
                onChange={(event) => later({ icon: event.target.value })}
              />
            </label>
          </div>
          <label className="field">
            <span className="field-label">{t("docs.tags")}</span>
            <input
              value={tags}
              placeholder={t("docs.tagsPlaceholder")}
              onChange={(event) => setTags(event.target.value)}
              onBlur={() =>
                void patch({
                  tags: tags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <div className="field">
            <span className="field-label">{t("categories.color")}</span>
            <ColorPicker
              label={t("categories.color")}
              size="sm"
              value={project.color as ColorName}
              onChange={(color) => void patch({ color })}
            />
          </div>
          <div className="field">
            <span className="field-label">{t("projects.cover")}</span>
            <CoverPicker
              cover={project.cover}
              onChange={(cover) => void patch({ cover })}
              triggerLabel={project.cover ? t("notes.changeCover") : t("notes.addCover")}
              triggerClassName="ghost small"
              align="start"
            />
          </div>
        </fieldset>
      </Card>
      <div className="stack">
        <Card title={t("projects.linked")} icon={LinkIcon}>
          <fieldset disabled={!canEdit} className="stack">
            <label className="field">
              <span className="field-label">
                <BoardIcon /> {t("nav.boards")}
              </span>
              <select
                value={project.board_id ?? ""}
                onChange={(event) =>
                  void patch({ board_id: event.target.value ? Number(event.target.value) : null })
                }
              >
                <option value="">{t("projects.none")}</option>
                {(boards.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">
                <BookIcon /> {t("nav.docs")}
              </span>
              <select
                value={project.doc_space_id ?? ""}
                onChange={(event) =>
                  void patch({ doc_space_id: event.target.value ? Number(event.target.value) : null })
                }
              >
                <option value="">{t("projects.none")}</option>
                {(docs.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.icon} {d.title}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        </Card>
        {canEdit && (
          <Card title={t("settings.section.danger")} icon={TrashIcon}>
            <button
              type="button"
              className="ghost"
              onClick={() => void patch({ archived: !project.archived })}
            >
              <ArchiveIcon /> {project.archived ? t("projects.unarchive") : t("projects.archive")}
            </button>
            <button type="button" className="danger-outline" onClick={() => void remove()}>
              <TrashIcon /> {t("projects.delete")}
            </button>
          </Card>
        )}
        {project.archived && (
          <p className="hint">
            <CheckIcon /> {t("projects.isArchived")}
          </p>
        )}
      </div>
    </div>
  );
}
