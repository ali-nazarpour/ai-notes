import type { TranslationKey } from "../i18n";
import type { Task } from "../types";
import { addDays, today } from "./calendar";

/** Same order as the backend: open first, then by due date (undated last), then oldest. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
    if (a.due_date !== b.due_date) {
      if (a.due_date === null) return 1;
      if (b.due_date === null) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    }
    return a.id - b.id;
  });
}

export interface TaskGroup {
  key: string;
  title: TranslationKey;
  tasks: Task[];
  tone?: "danger" | "accent";
}

export function groupTasks(tasks: Task[]): TaskGroup[] {
  const now = today();
  const tomorrow = addDays(now, 1);
  const open = tasks.filter((task) => !task.is_done);
  const groups: TaskGroup[] = [
    {
      key: "overdue",
      title: "tasks.group.overdue",
      tone: "danger",
      tasks: open.filter((t) => t.due_date !== null && t.due_date < now),
    },
    {
      key: "today",
      title: "tasks.group.today",
      tone: "accent",
      tasks: open.filter((t) => t.due_date === now),
    },
    { key: "tomorrow", title: "tasks.group.tomorrow", tasks: open.filter((t) => t.due_date === tomorrow) },
    {
      key: "upcoming",
      title: "tasks.group.upcoming",
      tasks: open.filter((t) => t.due_date !== null && t.due_date > tomorrow),
    },
    { key: "someday", title: "tasks.group.noDate", tasks: open.filter((t) => t.due_date === null) },
  ];
  return groups.filter((group) => group.tasks.length > 0);
}

export function isOverdue(task: Task): boolean {
  return !task.is_done && task.due_date !== null && task.due_date < today();
}
