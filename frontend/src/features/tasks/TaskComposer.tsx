/** Quick "add a task" bar: type, press Enter; the field stays focused for the next one. */
import { useRef, useState, type FormEvent } from "react";

import { CategorySelect } from "../../components/CategoryBits";
import { DatePicker } from "../../components/DatePicker";
import { PlusIcon } from "../../components/Icons";
import { useI18n } from "../../i18n";
import { addDays, today } from "../../lib/calendar";
import type { Category, TaskInput } from "../../types";

interface TaskComposerProps {
  categories: Category[];
  onAdd: (input: TaskInput) => Promise<unknown>;
  defaultDate?: string | null;
  defaultCategoryId?: number | null;
  inputId?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

export function TaskComposer({
  categories,
  onAdd,
  defaultDate = null,
  defaultCategoryId = null,
  inputId,
  placeholder,
  autoFocus = false,
}: TaskComposerProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(defaultDate);
  const [categoryId, setCategoryId] = useState<number | null>(defaultCategoryId);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const now = today();
  const tomorrow = addDays(now, 1);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onAdd({ title: trimmed, due_date: dueDate, category_id: categoryId });
      setTitle("");
    } catch {
      // The error was shown as a toast; keep the text so nothing is lost.
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-main">
        <span className="composer-plus" aria-hidden="true">
          <PlusIcon />
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          placeholder={placeholder ?? t("tasks.addPlaceholder")}
          aria-label={t("tasks.newTask")}
          maxLength={300}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          autoFocus={autoFocus}
        />
        <button type="submit" className="primary small" disabled={busy || !title.trim()}>
          {t("common.add")}
        </button>
      </div>
      <div className="composer-options">
        <div className="mini-chips" role="group" aria-label={t("tasks.dueDate")}>
          <button
            type="button"
            className="mini-chip"
            aria-pressed={dueDate === now}
            onClick={() => setDueDate(now)}
          >
            {t("date.today")}
          </button>
          <button
            type="button"
            className="mini-chip"
            aria-pressed={dueDate === tomorrow}
            onClick={() => setDueDate(tomorrow)}
          >
            {t("date.tomorrow")}
          </button>
          <button
            type="button"
            className="mini-chip"
            aria-pressed={dueDate === null}
            onClick={() => setDueDate(null)}
          >
            {t("tasks.noDate")}
          </button>
          <DatePicker
            value={dueDate !== now && dueDate !== tomorrow ? dueDate : null}
            onChange={setDueDate}
          />
        </div>
        <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
      </div>
    </form>
  );
}
