import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";

import { adminApi } from "../../api/v4";
import {
  AlertIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderIcon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
} from "../../components/Icons";
import { EmptyState, Skeleton } from "../../components/ui";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { formatBytes } from "../../lib/embeds";
import type { User } from "../../types";
import type { AdminUser } from "../../types4";
import { AccountDialog, CreateAccountDialog } from "./AdminAccountDialog";
import { CreateWorkspaceDialog, WorkspaceDialog } from "./AdminWorkspaceDialog";
import "./admin-directory.css";

export const PAGE_SIZE = 20;
const roles = ["all", "admin", "member"] as const;
const states = ["all", "active", "disabled"] as const;
const sorts = ["newest", "oldest", "activity", "email"] as const;
const workspaceMembers = ["all", "solo", "team"] as const;
const workspaceSorts = ["newest", "oldest", "name", "members"] as const;

function validOption<T extends string>(value: string | null, options: readonly T[]): T {
  return options.find((option) => option === value) ?? options[0]!;
}

export function useDirectoryParams() {
  const [params, setParams] = useSearchParams();
  const search = (params.get("q") ?? "").trim().slice(0, 100);
  const page = Math.min(1_000_000, Math.max(1, Number.parseInt(params.get("page") ?? "", 10) || 1));

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      if (["q", "state", "role", "sort", "members"].includes(key)) next.delete("page");
      setParams(next, { preventScrollReset: true });
    },
    [params, setParams],
  );

  return { params, search, page, update };
}

function DirectoryHeading({
  id,
  title,
  description,
  createLabel,
  onCreate,
}: {
  id: string;
  title: string;
  description: string;
  createLabel: string;
  onCreate: () => void;
}) {
  return (
    <div className="admin-directory-heading">
      <div>
        <h1 id={id}>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      <button type="button" className="primary" onClick={onCreate}>
        <PlusIcon /> {createLabel}
      </button>
    </div>
  );
}

export function DirectoryMetrics({ items }: { items: [string, number][] }) {
  const { calendar } = useI18n();
  return (
    <div className="admin-directory-metrics">
      {items.map(([label, count]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{calendar.formatNumber(count)}</strong>
        </div>
      ))}
    </div>
  );
}

function ManageButton({ label, onClick }: { label: string; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="small admin-manage-button"
      onClick={onClick}
      aria-label={`${t("admin.manageUser")} ${label}`}
    >
      {t("admin.manageUser")} <ChevronRightIcon />
    </button>
  );
}

export function DirectorySearch({
  search,
  label,
  onSearch,
}: {
  search: string;
  label: string;
  onSearch: (value: string) => void;
}) {
  const { t } = useI18n();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(String(new FormData(event.currentTarget).get("q") ?? "").trim());
  }

  return (
    <form role="search" className="admin-directory-search" onSubmit={submit} key={search}>
      <span className="admin-search-input">
        <SearchIcon />
        <input
          type="search"
          name="q"
          defaultValue={search}
          maxLength={100}
          aria-label={label}
          placeholder={label}
          dir="auto"
        />
      </span>
      <button type="submit">{t("search.title")}</button>
      {search && (
        <button type="button" className="ghost" onClick={() => onSearch("")}>
          {t("search.clear")}
        </button>
      )}
    </form>
  );
}

export function DirectoryPagination({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const previous = () => onPage(Math.max(1, page - 1));

  return (
    <div className="admin-pagination">
      <span className="muted small" role="status">
        {t("admin.pagination", { page, pages, total })}
      </span>
      <div>
        <button type="button" className="ghost small" onClick={previous} disabled={page <= 1}>
          <ChevronLeftIcon /> {t("admin.previousPage")}
        </button>
        <button
          type="button"
          className="ghost small"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
        >
          {t("admin.nextPage")} <ChevronRightIcon />
        </button>
      </div>
    </div>
  );
}

export function AdminLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const i18n = useI18n();
  return (
    <div className="card admin-directory-error" role="alert">
      <AlertIcon />
      <div>
        <strong>{i18n.t("admin.loadFailed")}</strong>
        <div className="muted small">{errorMessage(error, i18n)}</div>
      </div>
      <button type="button" className="ghost" onClick={onRetry}>
        {i18n.t("common.retry")}
      </button>
    </div>
  );
}

export function AccountBadge({ user }: { user: AdminUser }) {
  const { t } = useI18n();
  return (
    <span className="admin-account-badge" data-active={user.is_active}>
      {t(user.is_active ? "admin.enabled" : "admin.disabled")}
    </span>
  );
}

export function AdminUsers({ me }: { me: User }) {
  const { t, calendar } = useI18n();
  const { params, search, page, update } = useDirectoryParams();
  const role = validOption(params.get("role"), roles);
  const state = validOption(params.get("state"), states);
  const sort = validOption(params.get("sort"), sorts);
  const selected = Number(params.get("user"));
  const [creating, setCreating] = useState(false);
  const query = useQuery({
    queryKey: ["admin-users", { search, role, state, sort, page }],
    queryFn: () =>
      adminApi.users(
        new URLSearchParams({ search, role, state, sort, page: String(page), limit: String(PAGE_SIZE) }),
      ),
  });
  const data = query.data;

  useEffect(() => {
    if (data && page > Math.max(1, Math.ceil(data.total / PAGE_SIZE))) update("page", "");
  }, [data, page, update]);

  return (
    <section className="stack admin-directory" aria-labelledby="admin-users-heading">
      <DirectoryHeading
        id="admin-users-heading"
        title={t("admin.users")}
        description={t("admin.accountsHint")}
        createLabel={t("admin.createUser")}
        onCreate={() => setCreating(true)}
      />
      {data && (
        <DirectoryMetrics
          items={[
            [t("admin.stat.users"), data.all_users],
            [t("admin.stat.admins"), data.admins],
            [t("admin.disabled"), data.disabled],
          ]}
        />
      )}
      <div className="admin-directory-panel" aria-busy={query.isFetching}>
        <div className="admin-directory-toolbar">
          <DirectorySearch
            search={search}
            label={t("admin.searchUsers")}
            onSearch={(value) => update("q", value)}
          />
          <div className="admin-directory-filters">
            <label>
              <span>{t("admin.role")}</span>
              <select value={role} onChange={(event) => update("role", event.target.value)}>
                <option value="all">{t("admin.allRoles")}</option>
                <option value="admin">{t("admin.isAdmin")}</option>
                <option value="member">{t("admin.isUser")}</option>
              </select>
            </label>
            <label>
              <span>{t("admin.accountStatus")}</span>
              <select value={state} onChange={(event) => update("state", event.target.value)}>
                <option value="all">{t("admin.allStates")}</option>
                <option value="active">{t("admin.enabled")}</option>
                <option value="disabled">{t("admin.disabled")}</option>
              </select>
            </label>
            <label>
              <span>{t("admin.sortOrder")}</span>
              <select value={sort} onChange={(event) => update("sort", event.target.value)}>
                <option value="newest">{t("admin.newest")}</option>
                <option value="oldest">{t("admin.oldest")}</option>
                <option value="activity">{t("admin.lastActive")}</option>
                <option value="email">{t("admin.emailOrder")}</option>
              </select>
            </label>
          </div>
        </div>
        {query.isError && <AdminLoadError error={query.error} onRetry={() => void query.refetch()} />}
        {query.isPending && <Skeleton rows={4} />}
        {data &&
          (data.items.length ? (
            <table className="admin-directory-table" role="table" aria-labelledby="admin-users-heading">
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">
                    {t("admin.tableIdentity")}
                  </th>
                  <th scope="col" role="columnheader">
                    {t("admin.accountStatus")}
                  </th>
                  <th scope="col" role="columnheader">
                    {t("admin.lastActive")}
                  </th>
                  <th scope="col" role="columnheader">
                    {t("admin.usage")}
                  </th>
                  <th scope="col" role="columnheader">
                    {t("common.actions")}
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {data.items.map((row) => (
                  <tr key={row.id} role="row">
                    <td className="admin-directory-primary" role="cell">
                      <div className="admin-directory-person">
                        <span className="admin-directory-avatar" aria-hidden="true">
                          {row.name.trim().slice(0, 1).toLocaleUpperCase()}
                        </span>
                        <div>
                          <strong dir="auto">{row.name}</strong>
                          <bdi className="muted small">{row.email}</bdi>
                        </div>
                      </div>
                    </td>
                    <td data-label={t("admin.accountStatus")} role="cell">
                      <div className="admin-directory-badges">
                        <AccountBadge user={row} />
                        <span className={row.is_admin ? "badge accent" : "badge"}>
                          {t(row.is_admin ? "admin.isAdmin" : "admin.isUser")}
                        </span>
                        {row.id === me.id && <span className="muted small">{t("admin.you")}</span>}
                      </div>
                    </td>
                    <td data-label={t("admin.lastActive")} role="cell">
                      <span className="small">
                        {row.last_active ? calendar.dateTime(row.last_active) : t("admin.neverActive")}
                      </span>
                    </td>
                    <td data-label={t("admin.usage")} role="cell">
                      <span className="muted small">
                        {t("admin.usageValue", {
                          notes: row.notes,
                          workspaces: row.workspaces,
                          size: formatBytes(row.storage_bytes, calendar.formatNumber),
                        })}
                      </span>
                    </td>
                    <td className="admin-directory-action" role="cell">
                      <ManageButton label={row.email} onClick={() => update("user", String(row.id))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={UsersIcon} title={t("admin.noUsers")} />
          ))}
        {data && (
          <DirectoryPagination
            page={page}
            total={data.total}
            onPage={(value) => update("page", String(value))}
          />
        )}
      </div>
      {creating && (
        <CreateAccountDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            update("user", String(id));
          }}
        />
      )}
      {Number.isSafeInteger(selected) && selected > 0 && (
        <AccountDialog
          key={selected}
          id={selected}
          isSelf={selected === me.id}
          onClose={() => update("user", "")}
        />
      )}
    </section>
  );
}

export function AdminWorkspaces({ ownerEmail }: { ownerEmail: string }) {
  const { t, calendar } = useI18n();
  const { params, search, page, update } = useDirectoryParams();
  const members = validOption(params.get("members"), workspaceMembers);
  const sort = validOption(params.get("sort"), workspaceSorts);
  const selected = Number(params.get("workspace"));
  const [creating, setCreating] = useState(false);
  const query = useQuery({
    queryKey: ["admin-workspaces", { search, members, sort, page }],
    queryFn: () =>
      adminApi.workspaces(
        new URLSearchParams({ search, members, sort, page: String(page), limit: String(PAGE_SIZE) }),
      ),
  });
  const data = query.data;

  useEffect(() => {
    if (data && page > Math.max(1, Math.ceil(data.total / PAGE_SIZE))) update("page", "");
  }, [data, page, update]);

  return (
    <section className="stack admin-directory" aria-labelledby="admin-workspaces-heading">
      <DirectoryHeading
        id="admin-workspaces-heading"
        title={t("admin.stat.workspaces")}
        description={t("admin.workspacesHint")}
        createLabel={t("admin.createWorkspace")}
        onCreate={() => setCreating(true)}
      />
      {data && (
        <DirectoryMetrics
          items={[
            [t("admin.stat.workspaces"), data.all_workspaces],
            [t("admin.soloWorkspace"), data.solo],
            [t("admin.teamWorkspace"), data.team],
          ]}
        />
      )}
      <div className="admin-directory-panel" aria-busy={query.isFetching}>
        <div className="admin-directory-toolbar">
          <DirectorySearch
            search={search}
            label={t("admin.searchWorkspaces")}
            onSearch={(value) => update("q", value)}
          />
          <div className="admin-directory-filters">
            <label>
              <span>{t("admin.members")}</span>
              <select value={members} onChange={(event) => update("members", event.target.value)}>
                <option value="all">{t("admin.allMemberCounts")}</option>
                <option value="solo">{t("admin.soloWorkspace")}</option>
                <option value="team">{t("admin.teamWorkspace")}</option>
              </select>
            </label>
            <label>
              <span>{t("admin.sortOrder")}</span>
              <select value={sort} onChange={(event) => update("sort", event.target.value)}>
                <option value="newest">{t("admin.newest")}</option>
                <option value="oldest">{t("admin.oldest")}</option>
                <option value="name">{t("admin.workspaceNameOrder")}</option>
                <option value="members">{t("admin.workspaceMembersOrder")}</option>
              </select>
            </label>
          </div>
        </div>
        {query.isError && <AdminLoadError error={query.error} onRetry={() => void query.refetch()} />}
        {query.isPending && <Skeleton rows={4} />}
        {query.data &&
          (query.data.items.length ? (
            <table className="admin-directory-table" role="table" aria-labelledby="admin-workspaces-heading">
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">
                    {t("admin.stat.workspaces")}
                  </th>
                  <th scope="col" role="columnheader">
                    {t("admin.owner")}
                  </th>
                  <th scope="col" role="columnheader">
                    {t("admin.members")}
                  </th>
                  <th scope="col" role="columnheader">
                    {t("admin.workspaceCreatedAt")}
                  </th>
                  <th scope="col" role="columnheader">
                    {t("common.actions")}
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {query.data.items.map((space) => (
                  <tr key={space.id} role="row">
                    <td className="admin-directory-primary" role="cell">
                      <div className="admin-directory-person">
                        <span className="admin-directory-avatar">
                          <FolderIcon />
                        </span>
                        <div>
                          <strong dir="auto">{space.name}</strong>
                          <bdi className="small muted">{space.slug}</bdi>
                        </div>
                      </div>
                    </td>
                    <td data-label={t("admin.owner")} role="cell">
                      <div className="admin-directory-owner">
                        <Link to={`/users?user=${space.owner_id}`} dir="auto">
                          {space.owner_name}
                        </Link>
                        <bdi className="small muted">{space.owner_email}</bdi>
                      </div>
                    </td>
                    <td data-label={t("admin.members")} role="cell">
                      {calendar.formatNumber(space.member_count)}
                    </td>
                    <td data-label={t("admin.workspaceCreatedAt")} role="cell">
                      <span className="small">{calendar.dateTime(space.created_at)}</span>
                    </td>
                    <td className="admin-directory-action" role="cell">
                      <ManageButton
                        label={space.name}
                        onClick={() => update("workspace", String(space.id))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={FolderIcon} title={t("admin.noWorkspaces")} />
          ))}
        {query.data && (
          <DirectoryPagination
            page={page}
            total={query.data.total}
            onPage={(value) => update("page", String(value))}
          />
        )}
      </div>
      {creating && (
        <CreateWorkspaceDialog
          ownerEmail={ownerEmail}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            update("workspace", String(id));
          }}
        />
      )}
      {Number.isSafeInteger(selected) && selected > 0 && (
        <WorkspaceDialog
          key={selected}
          id={selected}
          onClose={() => update("workspace", "")}
          onRemoved={() => update("workspace", "")}
        />
      )}
    </section>
  );
}
