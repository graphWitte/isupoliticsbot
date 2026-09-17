import Link from "next/link";
import type { Task, TaskKind, TaskStatus, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cx } from "@/lib/cx";
import { KIND, KINDS } from "@/lib/labels";
import { TaskCard } from "@/components/task-card";
import { btn, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Доска" };

type BoardTask = Task & { assignee: User | null };

const DAY_MS = 24 * 60 * 60_000;
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
  { title: "Свободны", hint: "ждут, кто возьмёт", statuses: ["OPEN"], sort: (a, b) => time(a.claimBy) - time(b.claimBy) },
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

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const kindFilter = (KINDS as readonly string[]).includes(kind ?? "") ? (kind as TaskKind) : undefined;
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where: {
      kind: kindFilter,
      OR: [
        { status: { in: ["DRAFT", "OPEN", "CLAIMED", "REVISION", "SUBMITTED", "EXPIRED"] } },
        { status: "DONE", doneAt: { gte: new Date(now.getTime() - 14 * DAY_MS) } },
      ],
    },
    include: { assignee: true },
  });

  const expired = tasks.filter((t) => t.status === "EXPIRED");
  const overdue = tasks.filter(
    (t) => (t.status === "CLAIMED" || t.status === "REVISION") && t.dueAt && t.dueAt < now,
  );
  const attention = [...expired, ...overdue];

  const tabs = [{ key: undefined, label: "Все" }, ...KINDS.map((k) => ({ key: k, label: `${KIND[k].emoji} ${KIND[k].label}` }))];

  return (
    <>
      <PageHeader
        title="Доска"
        subtitle={`${tasks.filter((t) => t.status !== "DONE").length} квестов в движении`}
        actions={
          <Link href="/tasks/new" className={btn.primary}>
            ＋ Новый квест
          </Link>
        }
      />

      <nav className="mb-6 flex flex-wrap gap-1.5">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            href={tab.key ? `/?kind=${tab.key}` : "/"}
            className={cx(
              "rounded-full border px-3 py-1 text-sm transition",
              kindFilter === tab.key
                ? "border-accent/50 bg-accent/15 text-fg"
                : "border-border text-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {attention.length > 0 && (
        <section className="mb-8 rounded-xl border border-rose-500/25 bg-rose-500/5 p-4">
          <h2 className="text-sm font-semibold text-rose-200">
            Требует внимания · {attention.length}
          </h2>
          <p className="mt-0.5 text-xs text-rose-200/60">
            {expired.length > 0 && `${expired.length} никто не взял`}
            {expired.length > 0 && overdue.length > 0 && " · "}
            {overdue.length > 0 && `${overdue.length} просрочено исполнителями`}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {attention.map((task) => (
              <TaskCard key={task.id} task={task} now={now} />
            ))}
          </div>
        </section>
      )}

      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div className="grid min-w-[1080px] grid-cols-5 gap-4">
          {COLUMNS.map((column) => {
            const items = tasks.filter((t) => column.statuses.includes(t.status)).sort(column.sort);
            return (
              <section key={column.title} className="min-w-0">
                <div className="mb-3 px-1">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-sm font-semibold">{column.title}</h2>
                    <span className="text-xs text-faint tabular-nums">{items.length}</span>
                  </div>
                  <p className="text-xs text-faint">{column.hint}</p>
                </div>
                <div className="space-y-2">
                  {items.length ? (
                    items.map((task) => <TaskCard key={task.id} task={task} now={now} />)
                  ) : (
                    <Empty>пусто</Empty>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
