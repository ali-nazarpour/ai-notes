import { useQuery } from "@tanstack/react-query";

import { adminApi } from "../../api/v4";
import { InboxIcon, MailIcon } from "../../components/Icons";
import { EmptyState, Skeleton } from "../../components/ui";
import { useI18n } from "../../i18n";
import {
  AdminLoadError,
  DirectoryMetrics,
  DirectoryPagination,
  DirectorySearch,
  PAGE_SIZE,
  useDirectoryParams,
} from "./AdminDirectory";

const statuses = ["sent", "failed", "skipped"] as const;

export function AdminEmailLog() {
  const { t, calendar } = useI18n();
  const { params, search, page, update } = useDirectoryParams();
  const query = useQuery({ queryKey: ["admin-emails"], queryFn: adminApi.emails });
  const { data } = query;
  const requestedStatus = params.get("state");
  const status = statuses.find((value) => value === requestedStatus) ?? "all";
  const term = search.toLowerCase();
  const filtered = (data ?? []).filter(
    (row) =>
      (status === "all" || row.status === status) &&
      (row.to_email.toLowerCase().includes(term) || row.subject.toLowerCase().includes(term)),
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const start = (currentPage - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  return (
    <section className="stack admin-directory" aria-labelledby="admin-email-log-heading">
      <div className="admin-directory-heading">
        <div>
          <h1 id="admin-email-log-heading">{t("admin.log")}</h1>
          <p className="muted">{t("admin.logHint")}</p>
        </div>
      </div>
      {data && (
        <DirectoryMetrics
          items={statuses.map((value) => [
            t(`admin.status.${value}`),
            data.filter((row) => row.status === value).length,
          ])}
        />
      )}
      <div className="admin-directory-panel" aria-busy={query.isFetching}>
        <div className="admin-directory-toolbar">
          <DirectorySearch
            search={search}
            label={t("admin.logSearch")}
            onSearch={(value) => update("q", value)}
          />
          <div className="admin-directory-filters">
            <label>
              <span>{t("admin.logStatus")}</span>
              <select value={status} onChange={(event) => update("state", event.target.value)}>
                <option value="all">{t("admin.allStates")}</option>
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {t(`admin.status.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {query.isError && <AdminLoadError error={query.error} onRetry={() => void query.refetch()} />}
        {query.isPending && <Skeleton rows={4} />}
        {data &&
          (rows.length ? (
            <>
              <table
                className="admin-directory-table admin-email-log-table"
                role="table"
                aria-labelledby="admin-email-log-heading"
              >
                <thead role="rowgroup">
                  <tr role="row">
                    <th scope="col" role="columnheader">
                      {t("admin.logSubject")} / {t("admin.logTo")}
                    </th>
                    <th scope="col" role="columnheader">
                      {t("admin.logWhen")}
                    </th>
                    <th scope="col" role="columnheader">
                      {t("admin.logStatus")}
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {rows.map((row) => (
                    <tr key={row.id} role="row">
                      <td role="cell" className="admin-directory-primary">
                        <div className="admin-directory-person">
                          <span className="admin-directory-avatar" aria-hidden="true">
                            <MailIcon />
                          </span>
                          <div>
                            <strong dir="auto">{row.subject || t("admin.logNoSubject")}</strong>
                            <bdi className="muted small" dir="ltr">
                              {row.to_email}
                            </bdi>
                          </div>
                        </div>
                      </td>
                      <td role="cell" data-label={t("admin.logWhen")}>
                        <time className="small" dateTime={row.created_at}>
                          {calendar.dateTime(row.created_at)}
                        </time>
                      </td>
                      <td role="cell" data-label={t("admin.logStatus")}>
                        <span className={`badge status-${row.status}`}>
                          {t(`admin.status.${row.status}`)}
                        </span>
                        {row.error && (
                          <span className="muted small admin-email-log-error" dir="auto">
                            {row.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <DirectoryPagination
                page={currentPage}
                total={filtered.length}
                onPage={(value) => update("page", String(value))}
              />
            </>
          ) : (
            <EmptyState icon={InboxIcon} title={t(data.length ? "admin.logNoMatches" : "admin.logEmpty")} />
          ))}
      </div>
    </section>
  );
}
