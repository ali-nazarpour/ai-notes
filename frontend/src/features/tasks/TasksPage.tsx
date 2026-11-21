/** Tasks grouped by due date, with quick add and a category filter. Completed tasks fold away. */
import { useState } from "react";
import { useSearchParams } from "react-router";

import { useQueryClient } from "@tanstack/react-query";

import { queryKeys, useCategories, useTaskActions, useTasks } from "../../api/queries";
import { aiToolsApi } from "../../api/v4";
import { useToast } from "../../components/Feedback";
import { AiSuggestDialog } from "../ai/AiSuggestDialog";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { FilterChips } from "../../components/CategoryBits";
import { CheckCircleIcon, ChevronDownIcon, SparkleIcon } from "../../components/Icons";
import { EmptyState, PageHeader, Skeleton } from "../../components/ui";
import { matchesQuery, usePageQuery } from "../../hooks/usePageQuery";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { groupTasks } from "../../lib/tasks";
import { TASK_INPUT_ID } from "../../layout/AppShell";
import { TaskComposer } from "./TaskComposer";
import { TaskItem } from "./TaskItem";

export function TasksPage() {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const [params] = useSearchParams();
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(false);
  const { data: tasks = [], isLoading, error, refetch } = useTasks();
  const { data: categories = [] } = useCategories();
  const actions = useTaskActions();
  const client = useQueryClient();
  const toast = useToast();
  const { aiEnabled, canEdit } = useWorkspace();
  const [extracting, setExtracting] = useState(false);

  const query = usePageQuery();
  const visible = tasks.filter(
    (task) => (categoryId === null || task.category_id === categoryId) && matchesQuery(query, task.title),
  );
  const groups = groupTasks(visible);
  const done = visible.filter((task) => task.is_done);
  const openCount = visible.length - done.length;
  const itemProps = {
    categories,
    onToggle: actions.toggle,
    onChange: actions.update,
    onDelete: actions.remove,
  };

  return (
    <section aria-labelledby="page-title">
      <PageHeader
        title={<span id="page-title">{t("nav.tasks")}</span>}
        subtitle={t("tasks.summary", { open: openCount, done: done.length })}
        actions={
          aiEnabled &&
          canEdit && (
            <button type="button" className="ghost" onClick={() => setExtracting(true)}>
              <SparkleIcon /> {t("tasks.aiExtract")}
            </button>
          )
        }
      />
      {extracting && (
        <AiSuggestDialog
          kind="tasks"
          title={t("tasks.aiExtract")}
          hint={t("tasks.aiExtractHint")}
          placeholder={t("tasks.aiExtractPlaceholder")}
          count={12}
          showDates
          onClose={() => setExtracting(false)}
          onAccept={async (items) => {
            await aiToolsApi.createTasks(
              items.map((item) => ({
                title: item.title.slice(0, 300),
                due_date: item.date,
                category_id: categoryId,
              })),
            );
            await client.invalidateQueries({ queryKey: queryKeys.tasks });
            toast(t("tasks.aiAdded", { count: items.length }), "success");
          }}
        />
      )}

      <div className="card composer-card">
        <TaskComposer
          key={categoryId ?? "all"}
          categories={categories}
          onAdd={actions.add}
          defaultCategoryId={categoryId}
          inputId={TASK_INPUT_ID}
          placeholder={t("tasks.placeholder")}
          autoFocus={params.get("new") === "1"}
        />
      </div>

      <FilterChips
        categories={categories}
        categoryId={categoryId}
        onChange={(filter) => setCategoryId(filter.categoryId)}
        countOf={(category) => category.open_task_count}
      />

      {isLoading && <Skeleton rows={4} />}
      {error && (
        <div className="empty-state">
          <p className="error-text" role="alert">
            {errorMessage(error, i18n)}
          </p>
          <button type="button" onClick={() => void refetch()}>
            {t("common.retry")}
          </button>
        </div>
      )}

      {!isLoading && !error && openCount === 0 && (
        <EmptyState
          icon={CheckCircleIcon}
          title={visible.length ? t("tasks.allDone") : t("tasks.empty")}
          hint={visible.length ? t("tasks.allDoneHint") : t("tasks.emptyHint")}
        />
      )}

      {groups.map((group) => (
        <section key={group.key} className="task-group" data-tone={group.tone}>
          <h2 className="group-title">
            {t(group.title)}
            <span className="group-count">{calendar.formatNumber(group.tasks.length)}</span>
          </h2>
          <ul className="task-list">
            {group.tasks.map((task) => (
              <TaskItem key={task.id} task={task} {...itemProps} />
            ))}
          </ul>
        </section>
      ))}

      {done.length > 0 && (
        <section className="task-group">
          <button
            type="button"
            className="group-toggle"
            aria-expanded={showDone}
            onClick={() => setShowDone(!showDone)}
          >
            <ChevronDownIcon />
            {t("tasks.completed")}
            <span className="group-count">{calendar.formatNumber(done.length)}</span>
          </button>
          {showDone && (
            <ul className="task-list">
              {done.map((task) => (
                <TaskItem key={task.id} task={task} {...itemProps} />
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}
