import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env, isBootstrapAdmin } from "@/lib/env";
import { isStaff, syncTelegramUser } from "./users";

// Файл без next/*: его импортирует и бот, а он живёт вне Next.js.

const CODE_TTL_MS = 10 * 60_000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
// Столько же, сколько в примере проверки из документации Telegram
const TELEGRAM_AUTH_MAX_AGE_S = 24 * 60 * 60;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");

async function createSession(userId: string) {
  const token = randomToken();
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return token;
}

// ============ КНОПКА «ВОЙТИ ЧЕРЕЗ TELEGRAM» ============

export type TelegramAuthUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  auth_date: number;
};

/**
 * Проверка подписи Telegram Login Widget:
 * https://core.telegram.org/widgets/login#checking-authorization
 *
 * Подпись покрывает все поля, кроме hash, — лишний или подменённый параметр её ломает.
 */
export function verifyTelegramAuth(
  params: Record<string, string>,
  botToken = env.BOT_TOKEN,
  nowMs = Date.now(),
): { ok: true; user: TelegramAuthUser } | { ok: false; reason: "invalid" | "expired" } {
  const { hash, ...fields } = params;
  if (!hash || !/^\d+$/.test(fields.id ?? "") || !fields.first_name || !fields.auth_date) {
    return { ok: false, reason: "invalid" };
  }

  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();
  const received = Buffer.from(hash, "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { ok: false, reason: "invalid" };
  }

  const authDate = Number(fields.auth_date);
  if (!Number.isInteger(authDate) || nowMs / 1000 - authDate > TELEGRAM_AUTH_MAX_AGE_S) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    user: {
      id: Number(fields.id),
      first_name: fields.first_name,
      last_name: fields.last_name,
      username: fields.username,
      auth_date: authDate,
    },
  };
}

export type TelegramLoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: "invalid" | "expired" | "used" | "denied" };

/** Обменять данные от виджета на токен сессии. */
export async function exchangeTelegramAuth(params: Record<string, string>): Promise<TelegramLoginResult> {
  const verified = verifyTelegramAuth(params);
  if (!verified.ok) return verified;
  const tg = verified.user;

  // Посторонний, нажавший кнопку, не должен появиться в «Людях»: запись заводим
  // только тем, кого бот уже знает, и суперадминам из .env.
  const known = await prisma.user.findUnique({ where: { telegramId: BigInt(tg.id) } });
  if (!known && !isBootstrapAdmin(tg.id)) return { ok: false, reason: "denied" };

  const user = await syncTelegramUser({
    id: tg.id,
    is_bot: false,
    first_name: tg.first_name,
    last_name: tg.last_name,
    username: tg.username,
  });
  if (!isStaff(user) || !user.active) return { ok: false, reason: "denied" };

  // Подписанный пакет валиден сутки и приходит в URL — остаётся в истории браузера
  // и логах. Делаем его одноразовым через тот же журнал, что и коды из бота.
  try {
    await prisma.loginCode.create({
      data: {
        codeHash: sha256(`telegram-widget:${params.hash}`),
        userId: user.id,
        usedAt: new Date(),
        expiresAt: new Date((tg.auth_date + TELEGRAM_AUTH_MAX_AGE_S) * 1000),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, reason: "used" };
    }
    throw e;
  }

  return { ok: true, token: await createSession(user.id) };
}

// ============ ЗАПАСНОЙ ВХОД: ССЫЛКА ИЗ БОТА (/admin) ============
// Нужен, пока админка на localhost (виджет там не работает), и на случай,
// если домен не привязан у @BotFather или виджет не грузится.

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

  return createSession(row.userId);
}
