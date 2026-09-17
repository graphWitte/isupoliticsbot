import { createHash, randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { isStaff } from "./users";

// Файл без next/*: его импортирует и бот, а он живёт вне Next.js.

const CODE_TTL_MS = 10 * 60_000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");

export async function createLoginLink(user: User) {
  const code = randomToken();
  await prisma.loginCode.create({
    data: { codeHash: sha256(code), userId: user.id, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  return `${env.APP_URL}/auth/${code}`;
}

/**
 * Узнать, чей код, НЕ тратя его. Открытие ссылки (GET) код не расходует —
 * иначе его «съест» превью ссылки в Telegram или сканер ссылок раньше человека.
 * Тратится код только по нажатию кнопки «Войти» (POST).
 */
export async function peekLoginCode(code: string) {
  const row = await prisma.loginCode.findUnique({
    where: { codeHash: sha256(code) },
    include: { user: true },
  });
  if (!row || row.usedAt || row.expiresAt <= new Date()) return null;
  if (!isStaff(row.user) || !row.user.active) return null;
  return row.user;
}

/** Обменять одноразовый код на токен сессии. null — протух, использован или нет доступа. */
export async function exchangeLoginCode(code: string) {
  const now = new Date();
  const codeHash = sha256(code);
  // атомарно: ссылку открыли в двух вкладках — сессию получит только одна
  const { count } = await prisma.loginCode.updateMany({
    where: { codeHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (count === 0) return null;

  const row = await prisma.loginCode.findUniqueOrThrow({ where: { codeHash }, include: { user: true } });
  if (!isStaff(row.user) || !row.user.active) return null;

  const token = randomToken();
  await prisma.session.create({
    data: {
      tokenHash: sha256(token),
      userId: row.userId,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    },
  });
  return token;
}
