import { prisma } from "@/lib/prisma";
import { cx } from "@/lib/cx";
import { isBootstrapAdmin } from "@/lib/env";
import { ROLE, ROLES } from "@/lib/labels";
import { ActionForm } from "@/components/action-form";
import { Avatar, btn, Empty, input, PageHeader } from "@/components/ui";
import { requireStaff } from "@/server/session";
import { fullName } from "@/server/users";
import { setRoleAction } from "../actions";

export const metadata = { title: "Люди" };

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function PeoplePage() {
  const viewer = await requireStaff();
  const [users, doneRows] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      orderBy: [{ points: "desc" }, { createdAt: "asc" }],
      include: {
        _count: {
          select: { assignedTasks: { where: { status: { in: ["CLAIMED", "REVISION", "SUBMITTED"] } } } },
        },
      },
    }),
    prisma.task.groupBy({ by: ["assigneeId"], where: { status: "DONE" }, _count: { _all: true } }),
  ]);
  const done = new Map(doneRows.map((row) => [row.assigneeId, row._count._all]));
  const canEditRoles = viewer.role === "ADMIN";

  return (
    <>
      <PageHeader
        title="Люди"
        subtitle="Рейтинг по очкам. Человек появляется здесь, когда пишет боту или жмёт «Беру»."
      />

      {users.length === 0 ? (
        <Empty>Пока никого</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="w-12 px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Человек</th>
                <th className="px-4 py-3 font-medium">Роль</th>
                <th className="px-4 py-3 text-right font-medium">⭐ Очки</th>
                <th className="px-4 py-3 text-right font-medium">В работе</th>
                <th className="px-4 py-3 text-right font-medium">Сдано</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => {
                const bootstrap = isBootstrapAdmin(user.telegramId);
                return (
                  <tr key={user.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                    <td className="px-4 py-3 tabular-nums text-muted">{MEDALS[i] ?? i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={user.firstName} className="size-8 text-sm" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {fullName(user)}
                            {user.id === viewer.id && <span className="font-normal text-faint"> · это ты</span>}
                          </div>
                          {user.username && (
                            <a
                              href={`https://t.me/${user.username}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-muted hover:text-fg"
                            >
                              @{user.username}
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {canEditRoles && user.id !== viewer.id && !bootstrap ? (
                        <ActionForm action={setRoleAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="userId" value={user.id} />
                          <select name="role" defaultValue={user.role} className={cx(input, "w-auto py-1.5")}>
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE[role]}
                              </option>
                            ))}
                          </select>
                          <button className={cx(btn.secondary, "px-2.5 py-1.5")}>OK</button>
                        </ActionForm>
                      ) : (
                        <span>
                          {ROLE[user.role]}
                          {bootstrap && <span className="text-faint"> · из .env</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{user.points}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{user._count.assignedTasks}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{done.get(user.id) ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
