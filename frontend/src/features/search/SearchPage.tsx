/** Full results of the global search, grouped by section, with filter chips per section. */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import { searchApi } from "../../api/v5";
import { SearchIcon } from "../../components/Icons";
import { EmptyState, PageHeader, Skeleton } from "../../components/ui";
import { usePageQuery } from "../../hooks/usePageQuery";
import { useI18n } from "../../i18n";
import { SEARCH_KINDS } from "../../lib/searchKinds";
import { groupResults, Highlight } from "../../layout/GlobalSearch";

export function SearchPage() {
  const { t, calendar } = useI18n();
  const query = usePageQuery();
  const [kind, setKind] = useState<string | null>(null);
  const { data: results = [], isLoading } = useQuery({
    queryKey: ["search-page", query],
    queryFn: ({ signal }) => searchApi.all(query, 30, signal),
    enabled: query.length > 0,
  });
  const groups = groupResults(results);
  const shown = kind ? groups.filter(([k]) => k === kind) : groups;

  return (
    <div className="page search-page">
      <PageHeader
        title={query ? t("search.resultsFor", { query }) : t("search.title")}
        subtitle={query ? t("search.count", { count: calendar.formatNumber(results.length) }) : undefined}
      />
      {!query ? (
        <EmptyState icon={SearchIcon} title={t("search.title")} hint={t("search.hint")} />
      ) : isLoading ? (
        <Skeleton rows={5} height={64} />
      ) : !results.length ? (
        <EmptyState icon={SearchIcon} title={t("search.nothing")} hint={t("search.nothingHint")} />
      ) : (
        <>
          <div className="chips" role="group" aria-label={t("common.filter")}>
            <button type="button" className="chip" aria-pressed={kind === null} onClick={() => setKind(null)}>
              {t("common.all")}
              <span className="chip-count">{calendar.formatNumber(results.length)}</span>
            </button>
            {groups.map(([k, items]) => {
              const meta = SEARCH_KINDS[k];
              const KindIcon = meta?.icon ?? SearchIcon;
              return (
                <button
                  key={k}
                  type="button"
                  className="chip"
                  aria-pressed={kind === k}
                  onClick={() => setKind(kind === k ? null : k)}
                >
                  <KindIcon />
                  {meta ? t(meta.label) : k}
                  <span className="chip-count">{calendar.formatNumber(items.length)}</span>
                </button>
              );
            })}
          </div>
          <div className="search-results">
            {shown.map(([k, items]) => {
              const meta = SEARCH_KINDS[k];
              const KindIcon = meta?.icon ?? SearchIcon;
              return (
                <section key={k} className="search-section">
                  <h2>
                    <KindIcon /> {meta ? t(meta.label) : k}
                  </h2>
                  <div className="search-section-list">
                    {items.map((item) => (
                      <Link key={`${item.kind}-${item.id}`} to={item.url} className="search-result">
                        <span className="search-hit-icon">
                          {item.icon ? <span aria-hidden="true">{item.icon}</span> : <KindIcon />}
                        </span>
                        <span className="search-hit-text">
                          <strong dir="auto">
                            <Highlight text={item.title || t("notes.untitled")} query={query} />
                          </strong>
                          {item.snippet && (
                            <span className="muted small" dir="auto">
                              <Highlight text={item.snippet} query={query} />
                            </span>
                          )}
                        </span>
                        {item.updated_at && (
                          <span className="muted small search-result-date">
                            {calendar.shortDate(item.updated_at)}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
