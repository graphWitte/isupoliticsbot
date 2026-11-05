import Link from "next/link";
import type { TaskKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cx } from "@/lib/cx";
import { KIND, KINDS } from "@/lib/labels";
import { tzName } from "@/lib/time";
import { Board } from "@/components/board";
import { btn, PageHeader } from "@/components/ui";

export const metadata = { title: "Доска" };

const DAY_MS = 24 * 60 * 60_000;

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

  const tabs = [
    { key: undefined, label: "Все" },
    ...KINDS.map((k) => ({ key: k, label: `${KIND[k].emoji} ${KIND[k].label}` })),
  ];

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

      <nav className="mb-4 flex flex-wrap gap-1.5">
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

      <Board tasks={tasks} now={now} tz={tzName} />
    </>
  );
}
