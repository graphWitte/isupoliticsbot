import Link from "next/link";
import type { Task, User } from "@prisma/client";
import { cx } from "@/lib/cx";
import { KIND, SKILL } from "@/lib/labels";
import { formatRelative } from "@/lib/relative";
import { formatDateIn } from "@/lib/tz-input";
import { Avatar, Chip, StatusPill } from "./ui";

const DAY_MS = 24 * 60 * 60_000;

/** Какой срок важен сейчас, зависит от статуса: свободному — «взять до», взятому — «сдать до». */
function relevantDeadline(task: Task): { label: string; date: Date } | null {
  switch (task.status) {
    case "DRAFT":
    case "OPEN":
      return task.claimBy && { label: "взять", date: task.claimBy };
    case "EXPIRED":
      return task.claimBy && { label: "истёк", date: task.claimBy };
    case "CLAIMED":
    case "REVISION":
    case "SUBMITTED":
      return task.dueAt && { label: "сдать", date: task.dueAt };
    case "DONE":
      return task.doneAt && { label: "готово", date: task.doneAt };
    default:
      return null;
  }
}

export function Deadline({ task, now, tz }: { task: Task; now: Date; tz: string }) {
  const deadline = relevantDeadline(task);
  if (!deadline) return null;

  const left = deadline.date.getTime() - now.getTime();
  const live = task.status !== "DONE" && task.status !== "EXPIRED";
  const tone = !live
    ? "text-faint"
    : left < 0
      ? "text-rose-300"
      : left < DAY_MS
        ? "text-amber-300"
        : "text-muted";

  return (
    <div className={cx("flex items-center gap-1 text-xs", tone)} title={formatDateIn(deadline.date, tz)}>
      <span>{live && left < 0 ? "🔥" : "⏱"}</span>
      <span>
        {deadline.label} {formatRelative(deadline.date, now)}
      </span>
    </div>
  );
}

export function TaskCard({
  task,
  now,
  tz,
}: {
  task: Task & { assignee: User | null };
  now: Date;
  tz: string;
}) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="group block rounded-xl border border-border bg-surface p-3 transition hover:border-border-strong hover:bg-surface-2"
    >
      <div className="flex gap-2">
        <span aria-hidden>{KIND[task.kind].emoji}</span>
        <span className="line-clamp-2 text-sm font-medium leading-snug">{task.title}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(task.status === "REVISION" || task.status === "EXPIRED") && <StatusPill status={task.status} />}
        {task.skills.map((s) => (
          <Chip key={s}>
            {SKILL[s].emoji} {SKILL[s].label}
          </Chip>
        ))}
        <Chip>⭐ {task.points}</Chip>
      </div>

      {(task.assignee || relevantDeadline(task)) && (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <Deadline task={task} now={now} tz={tz} />
          {task.assignee && (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
              <Avatar name={task.assignee.firstName} className="size-5 text-[10px]" />
              <span className="truncate">{task.assignee.firstName}</span>
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
