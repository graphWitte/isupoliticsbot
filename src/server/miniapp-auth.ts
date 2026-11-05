import { createHmac, timingSafeEqual } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env, isBootstrapAdmin } from "@/lib/env";
import { UserError } from "./errors";
import { syncTelegramUser } from "./users";

// Проверка initData из Telegram Mini App.
// https://core.telegram.org/bots/webapps — «Validating data received via the Mini App»
//
// ВАЖНО: схема отличается от кнопки входа (Login Widget, см. login.ts).
//   Mini App:      ключ = HMAC_SHA256("WebAppData", токен)
//   Login Widget:  ключ = SHA256(токен)
// Перепутать — значит отвергать все валидные запросы (или, что хуже, принимать чужие).
//
// Из строки проверки исключается ТОЛЬКО hash. Поле signature (оно для сторонней
// Ed25519-проверки) в неё входит — иначе подпись не сойдётся.

const MAX_AGE_MS = 60 * 60_000;

export type MiniAppAuth =
  | { ok: true; telegram: TelegramInitUser; authDate: Date }
  | { ok: false; reason: "invalid" | "expired" | "no_user" };

export type TelegramInitUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

export function verifyInitData(initData: string, botToken = env.BOT_TOKEN, nowMs = Date.now()): MiniAppAuth {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "invalid" };

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") pairs.push(`${key}=${value}`);
  });
  const dataCheckString = pairs.sort().join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();

  let received: Buffer;
  try {
    received = Buffer.from(hash, "hex");
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { ok: false, reason: "invalid" };
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate) || authDate <= 0) return { ok: false, reason: "invalid" };
  // Подпись не протухает сама: без этой проверки перехваченный initData работал бы вечно.
  if (nowMs - authDate * 1000 > MAX_AGE_MS) return { ok: false, reason: "expired" };

  const rawUser = params.get("user");
  if (!rawUser) return { ok: false, reason: "no_user" };
  let telegram: TelegramInitUser;
  try {
    telegram = JSON.parse(rawUser);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!Number.isInteger(telegram.id) || !telegram.first_name) return { ok: false, reason: "invalid" };

  return { ok: true, telegram, authDate: new Date(authDate * 1000) };
}

const REASONS: Record<"invalid" | "expired" | "no_user", string> = {
  invalid: "Telegram не подтвердил, кто ты. Закрой приложение и открой заново.",
  expired: "Сессия устарела. Закрой приложение и открой заново.",
  no_user: "Telegram не передал, кто ты. Открой приложение из личного чата с ботом.",
};

/**
 * Кто открыл Mini App. Вызывается в каждом серверном действии: initData приходит
 * с каждым запросом, поэтому сессии в куках не нужны — в вебвью Telegram они
 * ненадёжны, а так подделать вызов нельзя даже при краже cookie.
 */
export async function authenticateMiniApp(initData: string): Promise<User> {
  const result = verifyInitData(initData);
  if (!result.ok) throw new UserError(REASONS[result.reason]);

  const telegramId = BigInt(result.telegram.id);
  // Mini App открывают только свои: бот даёт на него кнопку тем, кто уже в базе.
  // Посторонний со ссылкой не должен появляться в «Людях».
  const known = await prisma.user.findUnique({ where: { telegramId } });
  if (!known && !isBootstrapAdmin(telegramId)) {
    throw new UserError("Тебя нет в списке отдела. Напиши куратору, и он тебя добавит.");
  }

  const user = await syncTelegramUser({
    id: result.telegram.id,
    is_bot: false,
    first_name: result.telegram.first_name,
    last_name: result.telegram.last_name,
    username: result.telegram.username,
  });
  if (!user.active) throw new UserError("Твой доступ приостановлен. Напиши куратору.");

  if (result.telegram.photo_url && result.telegram.photo_url !== user.photoUrl) {
    await prisma.user.update({ where: { id: user.id }, data: { photoUrl: result.telegram.photo_url } });
  }
  return user;
}
