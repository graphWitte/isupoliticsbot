import "dotenv/config";
import { Bot } from "grammy";
import { prisma } from "@/lib/prisma";
import { env, bootstrapAdminIds } from "@/lib/env";

const bot = new Bot(env.BOT_TOKEN);

/**
 * Любое сообщение от человека — повод убедиться, что он есть в базе.
 * Роль ADMIN выдаётся только тем, кто перечислен в BOOTSTRAP_ADMIN_IDS,
 * и только при создании записи: понизить себя вручную потом можно,
 * перезаход в бота роль не перезапишет.
 */
bot.use(async (ctx, next) => {
  const from = ctx.from;
  if (!from || from.is_bot) return next();

  const telegramId = BigInt(from.id);
  await prisma.user.upsert({
    where: { telegramId },
    update: {
      username: from.username ?? null,
      firstName: from.first_name,
      lastName: from.last_name ?? null,
    },
    create: {
      telegramId,
      username: from.username ?? null,
      firstName: from.first_name,
      lastName: from.last_name ?? null,
      role: bootstrapAdminIds.includes(telegramId) ? "ADMIN" : "MEMBER",
    },
  });

  return next();
});

bot.command("start", async (ctx) => {
  const me = await prisma.user.findUnique({
    where: { telegramId: BigInt(ctx.from!.id) },
  });

  await ctx.reply(
    [
      `Привет, ${ctx.from?.first_name}.`,
      ``,
      `Это квест-борд медиа-отдела. Задачи будут прилетать в чат отдела,`,
      `забирать их — кнопкой под сообщением.`,
      ``,
      `Твоя роль: ${me?.role ?? "—"}`,
      `Очки: ${me?.points ?? 0}`,
    ].join("\n"),
  );
});

bot.command("id", async (ctx) => {
  await ctx.reply(
    [
      `Твой Telegram ID: \`${ctx.from?.id}\``,
      `ID этого чата: \`${ctx.chat.id}\``,
      ctx.message?.message_thread_id
        ? `ID темы: \`${ctx.message.message_thread_id}\``
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
    { parse_mode: "Markdown" },
  );
});

bot.catch((err) => {
  console.error("[bot] ошибка:", err.error);
});

async function main() {
  const me = await bot.api.getMe();
  console.log(`[bot] запущен как @${me.username}`);
  await bot.start();
}

void main();
