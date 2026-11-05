import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KIND } from "@/lib/labels";
import { formatDate } from "@/lib/time";
import { SubmissionView } from "@/components/submission-view";
import { Chip, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Приёмка" };

export default async function ReviewPage() {
  const now = new Date();
  const submissions = await prisma.submission.findMany({
    where: { status: "PENDING" },
    include: { author: true, reviewer: true, task: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Приёмка"
        subtitle={
          submissions.length
            ? `Ждут решения: ${submissions.length}. Самые старые сверху — их дольше всех держат в подвешенном состоянии.`
            : "Всё проверено"
        }
      />

      {submissions.length === 0 ? (
        <Empty>Новых сдач нет. Когда кто-то сдаст квест, он появится здесь и придёт тебе в бота.</Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {submissions.map((sub) => (
            <section key={sub.id} className="rounded-xl border border-border bg-surface p-4">
              <Link href={`/tasks/${sub.task.id}`} className="font-medium hover:text-accent">
                {KIND[sub.task.kind].emoji} {sub.task.title}
              </Link>
              <div className="mb-3 mt-1.5 flex flex-wrap gap-1.5">
                <Chip>⭐ {sub.task.points}</Chip>
                {sub.task.dueAt && <Chip>📅 срок {formatDate(sub.task.dueAt)}</Chip>}
              </div>
              <SubmissionView submission={sub} now={now} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
