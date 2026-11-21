/** One task row: round checkbox, title (click to edit in place), date and category. */
import { useState, type FormEvent, type KeyboardEvent } from "react";

import { CategoryBadge, CategorySelect } from "../../components/CategoryBits";
import { DatePicker } from "../../components/DatePicker";
import { CalendarIcon, CheckIcon, EditIcon, TrashIcon } from "../../components/Icons";
import { useI18n } from "../../i18n";
import { categoryStyle } from "../../lib/palette";
import { isOverdue } from "../../lib/tasks";
import type { Category, Task, TaskChanges } from "../../types";

interface TaskItemProps {
  task: Task;
  categories: Category[];
  onToggle: (task: Task) => void;
  onChange: (task: Task, changes: TaskChanges) => void;
  onDelete: (task: Task) => void;
  showDate?: boolean;
}

export function TaskItem({ task, categories, onToggle, onChange, onDelete, showDate = true }: TaskItemProps) {
  const { t, relativeDay } = useI18n();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(task.due_date);
  const [categoryId, setCategoryId] = useState(task.category_id);
  const category = categories.find((item) => item.id === task.category_id);
  const overdue = isOverdue(task);

  function startEditing() {
    setTitle(task.title);
    setDueDate(task.due_date);
    setCategoryId(task.category_id);
    setEditing(true);
  }

  function save(event?: FormEvent) {
    event?.preventDefault();
    const changes: TaskChanges = {};
    if (title.trim() && title.trim() !== task.title) changes.title = title.trim();
    if (dueDate !== task.due_date) changes.due_date = dueDate;
    if (categoryId !== task.category_id) changes.category_id = categoryId;
    if (Object.keys(changes).length) onChange(task, changes);
    setEditing(false);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") setEditing(false);
  }

  const toggleLabel = task.is_done
    ? t("tasks.markUndone", { title: task.title })
    : t("tasks.markDone", { title: task.title });

  return (
    <li className="task" data-done={task.is_done} style={categoryStyle(category?.color ?? "slate")}>
      <button
        type="button"
        role="checkbox"
        aria-checked={task.is_done}
        aria-label={toggleLabel}
        className="check"
        onClick={() => onToggle(task)}
      >
        <CheckIcon />
      </button>

      {editing ? (
        <form className="task-edit" onSubmit={save} onKeyDown={onKeyDown}>
          <input
            type="text"
            aria-label={t("tasks.title")}
            value={title}
            maxLength={300}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
          />
          <div className="task-edit-row">
            <DatePicker value={dueDate} onChange={setDueDate} />
            <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
            <div className="actions">
              <button type="button" className="ghost small" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="primary small">
                {t("common.save")}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="task-body">
          <button type="button" className="task-title" dir="auto" onClick={startEditing}>
            {task.title}
          </button>
          {((showDate && task.due_date) || category) && (
            <div className="task-meta">
              {showDate && task.due_date && (
                <span className={overdue ? "date-badge overdue" : "date-badge"}>
                  <CalendarIcon />
                  {overdue
                    ? t("tasks.overdueOn", { date: relativeDay(task.due_date) })
                    : relativeDay(task.due_date)}
                </span>
              )}
              <CategoryBadge category={category} />
            </div>
          )}
        </div>
      )}

      {!editing && (
        <div className="task-actions">
          <button
            type="button"
            className="icon-button small"
            onClick={startEditing}
            aria-label={t("tasks.edit")}
            title={t("common.edit")}
          >
            <EditIcon />
          </button>
          <button
            type="button"
            className="icon-button small danger"
            onClick={() => onDelete(task)}
            aria-label={t("tasks.delete")}
            title={t("common.delete")}
          >
            <TrashIcon />
          </button>
        </div>
      )}
    </li>
  );
}
