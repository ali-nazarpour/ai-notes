/** Projects: cards with progress, deadline and budget; filters; a wide "new project" dialog. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { projectsApi } from "../../api/v4";
import { DatePicker } from "../../components/DatePicker";
import { useToast } from "../../components/Feedback";
import {
  ArchiveIcon,
  CalendarIcon,
  MoneyIcon,
  PlusIcon,
  RocketIcon,
  StarIcon,
  UsersIcon,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { ColorPicker, EmptyState, PageHeader, Skeleton } from "../../components/ui";
import { matchesQuery, usePageQuery } from "../../hooks/usePageQuery";
import { useI18n, type TranslationKey } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { coverStyle } from "../../lib/covers";
import { categoryStyle } from "../../lib/palette";
import type { ColorName } from "../../types";
import type { ProjectKind, ProjectStatus, ProjectSummary } from "../../types4";
import { useWorkspace } from "../workspace/WorkspaceContext";

export const projectsKey = ["projects"] as const;

export const STATUSES: ProjectStatus[] = ["idea", "planning", "active", "on_hold", "completed", "cancelled"];
export const KINDS: { id: ProjectKind; icon: string; label: TranslationKey }[] = [
  { id: "software", icon: "💻", label: "projects.kind.software" },
  { id: "design", icon: "🎨", label: "projects.kind.design" },
  { id: "marketing", icon: "📣", label: "projects.kind.marketing" },
  { id: "research", icon: "🔬", label: "projects.kind.research" },
  { id: "event", icon: "🎉", label: "projects.kind.event" },
  { id: "business", icon: "💼", label: "projects.kind.business" },
  { id: "general", icon: "🚀", label: "projects.kind.general" },
];

export function money(value: number | string | null | undefined, currency: string, locale: string): string {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(
      amount,
    );
  } catch {
    return `${new Intl.NumberFormat(locale).format(amount)} ${currency}`;
  }
}

export function daysLeft(end: string | null): number | null {
  if (!end) return null;
  const ms = new Date(`${end}T23:59:59`).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export function ProgressRing({ value, size = 44 }: { value: number; size?: number }) {
  const { calendar } = useI18n();
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      className="progress-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <circle cx={size / 2} cy={size / 2} r={radius} className="ring-track" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className="ring-value"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.min(Math.max(value, 0), 100) / 100)}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">
        {calendar.formatNumber(Math.round(value))}
      </text>
    </svg>
  );
}

export function ProjectsPage() {
  const { t, calendar } = useI18n();
  const locale = calendar.locale;
  const { canEdit } = useWorkspace();
  const [archived, setArchived] = useState(false);
  const { data: projects = [], isLoading } = useQuery({
    queryKey: [...projectsKey, archived],
    queryFn: () => projectsApi.list(archived),
  });
  const [status, setStatus] = useState<ProjectStatus | "all">("all");
  const query = usePageQuery();
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(
    () =>
      projects.filter(
        (p) =>
          (status === "all" || p.status === status) &&
          matchesQuery(query, p.name, p.client, p.summary, p.tags.join(" ")),
      ),
    [projects, status, query],
  );
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: projects.length };
    projects.forEach((p) => (result[p.status] = (result[p.status] ?? 0) + 1));
    return result;
  }, [projects]);

  return (
    <div className="page projects-page">
      <PageHeader
        title={t("nav.projects")}
        subtitle={t("projects.subtitle")}
        actions={
          <>
            <button
              type="button"
              className={archived ? "ghost active" : "ghost"}
              aria-pressed={archived}
              onClick={() => setArchived(!archived)}
            >
              <ArchiveIcon /> {t("projects.archived")}
            </button>
            {canEdit && (
              <button type="button" className="primary" onClick={() => setCreating(true)}>
                <PlusIcon /> {t("projects.new")}
              </button>
            )}
          </>
        }
      />
      <div className="blog-toolbar">
        <div className="segmented scroll" role="tablist">
          {(["all", ...STATUSES] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={status === id}
              onClick={() => setStatus(id)}
            >
              {id === "all" ? t("common.all") : t(`projects.status.${id}`)}
              <span className="count">{calendar.formatNumber(counts[id] ?? 0)}</span>
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <Skeleton rows={3} height={150} />
      ) : !projects.length ? (
        <EmptyState
          icon={RocketIcon}
          title={archived ? t("projects.noArchived") : t("projects.empty")}
          hint={archived ? undefined : t("projects.emptyHint")}
          action={
            canEdit &&
            !archived && (
              <button type="button" className="primary" onClick={() => setCreating(true)}>
                <PlusIcon /> {t("projects.new")}
              </button>
            )
          }
        />
      ) : (
        <div className="project-grid">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} locale={locale} />
          ))}
        </div>
      )}
      {creating && <CreateProjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function ProjectCard({ project, locale }: { project: ProjectSummary; locale: string }) {
  const { t, calendar, plural } = useI18n();
  const left = daysLeft(project.end_date);
  const budget = project.budget != null ? Number(project.budget) : null;
  const spent = Number(project.spent ?? 0);
  return (
    <Link to={`/projects/${project.id}`} className="project-card" style={categoryStyle(project.color)}>
      <span className="project-cover" style={project.cover ? coverStyle(project.cover) : undefined}>
        <span className="project-icon">{project.icon || "🚀"}</span>
        {project.starred && (
          <span className="project-star">
            <StarIcon />
          </span>
        )}
      </span>
      <span className="project-body">
        <span className="row-between">
          <span className={`badge status-${project.status}`}>{t(`projects.status.${project.status}`)}</span>
          <span className={`priority priority-${project.priority}`}>
            {t(`projects.priority.${project.priority}`)}
          </span>
        </span>
        <strong dir="auto">{project.name}</strong>
        {project.summary && (
          <span className="muted small project-summary" dir="auto">
            {project.summary}
          </span>
        )}
        <span className="project-progress">
          <span className="bar">
            <span style={{ width: `${project.progress}%` }} />
          </span>
          <span className="small">{t("projects.percent", { value: project.progress })}</span>
        </span>
        <span className="project-facts muted small">
          {project.end_date && (
            <span data-late={left != null && left < 0 && project.status !== "completed"}>
              <CalendarIcon />{" "}
              {left != null && project.status !== "completed"
                ? left < 0
                  ? t("projects.overdue", { count: -left })
                  : t("projects.daysLeft", { count: left })
                : calendar.shortDate(project.end_date)}
            </span>
          )}
          {budget != null && (
            <span>
              <MoneyIcon /> {money(spent, project.currency, locale)} /{" "}
              {money(budget, project.currency, locale)}
            </span>
          )}
          {project.member_count > 0 && (
            <span>
              <UsersIcon /> {plural("projects.members", project.member_count)}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [kind, setKind] = useState<ProjectKind>("software");
  const [color, setColor] = useState<ColorName>("indigo");
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const icon = KINDS.find((k) => k.id === kind)?.icon ?? "🚀";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const project = await projectsApi.create({
        name: name.trim(),
        summary,
        kind,
        color,
        icon,
        status: "planning",
        start_date: start,
        end_date: end,
      });
      await client.invalidateQueries({ queryKey: projectsKey });
      toast(t("projects.created"), "success");
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(errorMessage(err, i18n));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("projects.new")}
      icon={RocketIcon}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" form="project-form" className="primary" disabled={busy || !name.trim()}>
            {busy ? t("common.saving") : t("common.create")}
          </button>
        </>
      }
    >
      <form id="project-form" className="modal-split" onSubmit={submit}>
        <aside className="modal-split-aside">
          <div className="project-card preview" style={categoryStyle(color)}>
            <span className="project-cover">
              <span className="project-icon">{icon}</span>
            </span>
            <span className="project-body">
              <span className="badge status-planning">{t("projects.status.planning")}</span>
              <strong dir="auto">{name || t("projects.namePlaceholder")}</strong>
              <span className="muted small" dir="auto">
                {summary || t("projects.summaryPlaceholder")}
              </span>
              <span className="project-progress">
                <span className="bar">
                  <span style={{ width: "8%" }} />
                </span>
              </span>
            </span>
          </div>
          <div className="field">
            <span className="field-label">{t("categories.color")}</span>
            <ColorPicker label={t("categories.color")} size="sm" value={color} onChange={setColor} />
          </div>
        </aside>
        <div className="stack">
          <label className="field">
            <span className="field-label">{t("projects.name")}</span>
            <input
              data-autofocus
              required
              maxLength={120}
              placeholder={t("projects.namePlaceholder")}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">{t("projects.summary")}</span>
            <textarea
              rows={2}
              maxLength={300}
              placeholder={t("projects.summaryPlaceholder")}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <div className="field">
            <span className="field-label">{t("projects.kindLabel")}</span>
            <div className="kind-grid">
              {KINDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="kind-option"
                  aria-pressed={kind === item.id}
                  onClick={() => setKind(item.id)}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {t(item.label)}
                </button>
              ))}
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <span className="field-label">{t("projects.start")}</span>
              <DatePicker value={start} onChange={setStart} />
            </div>
            <div className="field">
              <span className="field-label">{t("projects.end")}</span>
              <DatePicker value={end} onChange={setEnd} />
            </div>
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
