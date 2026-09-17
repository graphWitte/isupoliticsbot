import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BOT_TOKEN: z.string().min(1),
  BOOTSTRAP_ADMIN_IDS: z.string().optional().default(""),
  APP_URL: z
    .string()
    .url()
    .default("http://localhost:3000")
    .transform((s) => s.replace(/\/+$/, "")),
  APP_TZ: z.string().default("Europe/Moscow"),
});

export const env = schema.parse(process.env);

const bootstrapAdminIds = new Set(
  env.BOOTSTRAP_ADMIN_IDS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

export const isBootstrapAdmin = (telegramId: bigint | number) =>
  bootstrapAdminIds.has(String(telegramId));

/**
 * Telegram отклоняет URL-кнопки на localhost — пока админка не на публичном
 * https, ссылки на неё бот шлёт текстом, а кнопки «В админке» не рисует.
 */
export const appUrlIsPublic =
  env.APP_URL.startsWith("https://") &&
  !/\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env.APP_URL);
