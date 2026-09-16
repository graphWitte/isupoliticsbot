import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  let stats: { users: number; tasks: number; events: number } | null = null;
  let dbError: string | null = null;

  try {
    const [users, tasks, events] = await Promise.all([
      prisma.user.count(),
      prisma.task.count(),
      prisma.event.count(),
    ]);
    stats = { users, tasks, events };
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Квест-борд медиа-отдела</h1>
      <p className="mt-2 text-[--color-muted]">
        Фаза 0: каркас поднят. Дальше — доска и карточки квестов.
      </p>

      {dbError ? (
        <div className="mt-8 rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-sm">
          <div className="font-medium text-red-300">База недоступна</div>
          <pre className="mt-2 whitespace-pre-wrap text-red-200/70">
            {dbError}
          </pre>
          <p className="mt-3 text-red-200/70">
            Подними Postgres: <code>npm run db:up</code>, затем{" "}
            <code>npm run db:push</code>.
          </p>
        </div>
      ) : (
        <dl className="mt-8 grid grid-cols-3 gap-4">
          {[
            ["Людей", stats!.users],
            ["Квестов", stats!.tasks],
            ["Мероприятий", stats!.events],
          ].map(([label, value]) => (
            <div
              key={label as string}
              className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4"
            >
              <dt className="text-sm text-[--color-muted]">{label}</dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </main>
  );
}
