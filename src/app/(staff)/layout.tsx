import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ROLE } from "@/lib/labels";
import { NavLink } from "@/components/nav-link";
import { Avatar, btn, Notice } from "@/components/ui";
import { requireStaff } from "@/server/session";
import { getDepartmentChat } from "@/server/settings";
import { fullName } from "@/server/users";
import { logoutAction } from "./actions";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const [pending, chat] = await Promise.all([
    prisma.submission.count({ where: { status: "PENDING" } }),
    getDepartmentChat(),
  ]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="flex flex-col border-b border-border bg-surface/50 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-5 pb-2 pt-5 font-semibold">
          <span className="text-lg">🎯</span> Квест-борд
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 py-2 lg:flex-col">
          <NavLink href="/" exact>
            🗂 Доска
          </NavLink>
          <NavLink href="/tasks/new">＋ Новый квест</NavLink>
          <NavLink href="/review">
            📤 Приёмка
            {pending > 0 && (
              <span className="ml-auto rounded-full bg-violet-500/20 px-1.5 text-xs font-semibold text-violet-200 tabular-nums">
                {pending}
              </span>
            )}
          </NavLink>
          <NavLink href="/people">🏆 Люди</NavLink>
          <NavLink href="/settings">⚙️ Настройки</NavLink>
        </nav>

        <div className="mt-auto hidden border-t border-border p-3 lg:block">
          <div className="flex items-center gap-2 px-2 py-1">
            <Avatar name={user.firstName} className="size-8 text-sm" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{fullName(user)}</div>
              <div className="text-xs text-muted">{ROLE[user.role]}</div>
            </div>
          </div>
          <form action={logoutAction}>
            <button className={`${btn.ghost} mt-1 w-full justify-start`}>Выйти</button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        {!chat && (
          <div className="mb-6">
            <Notice tone="warning">
              Чат отдела не привязан — опубликованным квестам некуда падать.{" "}
              <Link href="/settings" className="font-medium underline underline-offset-2">
                Как привязать
              </Link>
            </Notice>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
