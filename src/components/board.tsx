"use client";

import { useMemo, useState } from "react";
import type { Task, TaskStatus, User } from "@prisma/client";
import { cx } from "@/lib/cx";
import { SKILL } from "@/lib/labels";
import { BoardSearch } from "./board-search";
import { TaskCard } from "./task-card";
import { Empty } from "./ui";

export type BoardTask = Task & { assignee: User | null };

const time = (d: Date | null) => d?.getTime() ?? Number.POSITIVE_INFINITY;

const COLUMNS: {
  title: string;
  hint: string;
  statuses: TaskStatus[];
  sort: (a: BoardTask, b: BoardTask) => number;
}[] = [
  {
    title: "Черновики",
    hint: "в чат ещё не улетели",
    statuses: ["DRAFT"],
    sort: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  },
  {
    title: "Свободны",
    hint: "ждут, кто возьмёт",
    statuses: ["OPEN"],
    sort: (a, b) => time(a.claimBy) - time(b.claimBy),
  },
  {
    title: "В работе",
    hint: "взяты и на доработке",
    statuses: ["CLAIMED", "REVISION"],
    sort: (a, b) => time(a.dueAt) - time(b.dueAt),
  },
  {
    title: "На проверке",
    hint: "ждут твоего решения",
    statuses: ["SUBMITTED"],
    sort: (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime(),
  },
  {
    title: "Готово",
    hint: "за последние 14 дней",
    statuses: ["DONE"],
    sort: (a, b) => time(b.doneAt) - time(a.doneAt),
  },
];

function matches(task: BoardTask, query: string) {
  const haystack = [
    task.title,
    task.brief ?? "",
    task.assignee?.firstName ?? "",
    task.assignee?.username ?? "",
    task.skill ? SKILL[task.skill].label : "",
  ]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function Board({ tasks, now, tz }: { tasks: BoardTask[]; now: Date; tz: string }) {
  const [query, setQuery] = useState("");
  const [mobileColumn, setMobileColumn] = useState(1); // «Свободны» — то, что смотрят чаще всего

  const visible = useMemo(() => (query ? tasks.filter((t) => matches(t, query)) : tasks), [tasks, query]);
  const columns = useMemo(
    () => COLUMNS.map((c) => ({ ...c, items: visible.filter((t) => c.statuses.includes(t.status)).sort(c.sort) })),
    [visible],
  );

  const attention = useMemo(() => {
    const expired = visible.filter((t) => t.status === "EXPIRED");
    const overdue = visible.filter(
      (t) => (t.status === "CLAIMED" || t.status === "REVISION") && t.dueAt && t.dueAt < now,
    );
    return { expired, overdue, all: [...expired, ...overdue] };
  }, [visible, now]);

  const found = visible.length;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <BoardSearch onChange={setQuery} />
        {query && (
          <span className="text-sm text-muted">
            {found === 0 ? "ничего не нашлось" : `найдено: ${found}`}
          </span>
        )}
      </div>

      {attention.all.length > 0 && (
        <section className="mb-8 rounded-xl border border-rose-500/25 bg-rose-500/5 p-4">
          <h2 className="text-sm font-semibold text-rose-200">Требует внимания · {attention.all.length}</h2>
          <p className="mt-0.5 text-xs text-rose-200/60">
            {attention.expired.length > 0 && `${attention.expired.length} никто не взял`}
            {attention.expired.length > 0 && attention.overdue.length > 0 && " · "}
            {attention.overdue.length > 0 && `${attention.overdue.length} просрочено исполнителями`}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {attention.all.map((task) => (
              <TaskCard key={task.id} task={task} now={now} tz={tz} />
            ))}
          </div>
        </section>
      )}

      {/* Телефон: одна колонка за раз. Пять колонок рядом на 375px не живут. */}
      <div className="lg:hidden">
        <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {columns.map((column, i) => (
            <button
              key={column.title}
              onClick={() => setMobileColumn(i)}
              aria-pressed={mobileColumn === i}
              className={cx(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition",
                mobileColumn === i
                  ? "border-accent/50 bg-accent/15 text-fg"
                  : "border-border text-muted hover:border-border-strong",
              )}
            >
              {column.title}
              <span className="text-xs tabular-nums opacity-60">{column.items.length}</span>
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-faint">{columns[mobileColumn].hint}</p>
        <div className="space-y-2">
          {columns[mobileColumn].items.length ? (
            columns[mobileColumn].items.map((task) => <TaskCard key={task.id} task={task} now={now} tz={tz} />)
          ) : (
            <Empty>{query ? "ничего не нашлось" : "пусто"}</Empty>
          )}
        </div>
      </div>

      {/* Десктоп: канбан целиком */}
      <div className="-mx-4 hidden overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:block lg:px-0">
        <div className="grid min-w-[1000px] grid-cols-5 gap-4">
          {columns.map((column) => (
            <section key={column.title} className="min-w-0">
              <div className="mb-3 px-1">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold">{column.title}</h2>
                  <span className="text-xs text-faint tabular-nums">{column.items.length}</span>
                </div>
                <p className="text-xs text-faint">{column.hint}</p>
              </div>
              <div className="space-y-2">
                {column.items.length ? (
                  column.items.map((task) => <TaskCard key={task.id} task={task} now={now} tz={tz} />)
                ) : (
                  <Empty>{query ? "—" : "пусто"}</Empty>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
