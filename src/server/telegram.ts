import { Api, GrammyError } from "grammy";
import type { InlineKeyboardButton, InlineKeyboardMarkup } from "grammy/types";
import { env } from "@/lib/env";

// Api без Bot: слать сообщения можно из любого процесса, включая админку.
// Конфликтует только getUpdates, а его делает один процесс бота.
export const api = new Api(env.BOT_TOKEN);

let username: Promise<string> | undefined;
export const botUsername = () => (username ??= api.getMe().then((me) => me.username));

export const deepLink = async (payload: string) =>
  `https://t.me/${await botUsername()}?start=${payload}`;

/** Человек не нажимал Start у бота или заблокировал его — писать ему некуда. */
export const isUnreachable = (e: unknown) =>
  e instanceof GrammyError &&
  (e.error_code === 403 || /chat not found|user not found/i.test(e.description));

/** Telegram отвечает ошибкой, если отредактировать сообщение в то же самое. */
export const isNotModified = (e: unknown) =>
  e instanceof GrammyError && /message is not modified/i.test(e.description);

export type SendOptions = NonNullable<Parameters<Api["sendMessage"]>[2]>;

/** Отправить, не падая, если человек недоступен. null — не доставлено. */
export async function trySend(chatId: bigint | string, text: string, options: SendOptions = {}) {
  try {
    return await api.sendMessage(String(chatId), text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...options,
    });
  } catch (e) {
    if (isUnreachable(e)) return null;
    throw e;
  }
}

export const cb = (text: string, data: string): InlineKeyboardButton => ({ text, callback_data: data });
export const link = (text: string, url: string): InlineKeyboardButton => ({ text, url });

/** Кнопка, открывающая Mini App внутри Telegram. Требует публичный https в APP_URL. */
export const webApp = (text: string, url: string): InlineKeyboardButton => ({ text, web_app: { url } });

/** Клавиатура из рядов; пустые ряды выкидываются, пустая клавиатура — undefined. */
export function keyboard(...rows: InlineKeyboardButton[][]): InlineKeyboardMarkup | undefined {
  const filled = rows.filter((row) => row.length > 0);
  return filled.length ? { inline_keyboard: filled } : undefined;
}
