import type { Role, User } from "@prisma/client";
import type { User as TelegramUser } from "grammy/types";
import { prisma } from "@/lib/prisma";
import { isBootstrapAdmin } from "@/lib/env";
import { esc } from "@/lib/html";

export async function syncTelegramUser(from: TelegramUser): Promise<User> {
  const telegramId = BigInt(from.id);
  const profile = {
    username: from.username ?? null,
    firstName: from.first_name,
    lastName: from.last_name ?? null,
  };
  // BOOTSTRAP_ADMIN_IDS — источник правды для суперадминов: вписан — значит ADMIN,
  // даже если написал боту раньше, чем его туда вписали. Иначе единственный
  // админ может запереть себя снаружи собственной админки.
  const admin = isBootstrapAdmin(telegramId);
  return prisma.user.upsert({
    where: { telegramId },
    update: admin ? { ...profile, role: "ADMIN" } : profile,
    create: { telegramId, ...profile, role: admin ? "ADMIN" : "MEMBER" },
  });
}

export const isStaff = (user: { role: Role }) => user.role === "ADMIN" || user.role === "CURATOR";

type Named = { username: string | null; firstName: string; lastName: string | null };

export const fullName = (u: Named) => [u.firstName, u.lastName].filter(Boolean).join(" ");

/** Упоминание для Telegram HTML. */
export const mention = (u: Named & { telegramId: bigint }) =>
  u.username
    ? `@${esc(u.username)}`
    : `<a href="tg://user?id=${u.telegramId}">${esc(fullName(u))}</a>`;

export const staffUsers = () =>
  prisma.user.findMany({ where: { active: true, role: { in: ["ADMIN", "CURATOR"] } } });
