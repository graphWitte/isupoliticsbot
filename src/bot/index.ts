import "dotenv/config";
import { Bot, GrammyError, type Context, type Filter } from "grammy";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrlIsPublic, env } from "@/lib/env";
import { clip, esc } from "@/lib/html";
import { KIND, ROLE, STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/time";
import { renderPrivateCard, sendPrivateCard } from "@/server/cards";
import { clearChatState, getChatState, setChatState } from "@/server/chat-state";
import { isUserError, UserError } from "@/server/errors";
import { createLoginLink } from "@/server/login";
import { setDepartmentChat } from "@/server/settings";
import {
  acceptSubmission,
  claimTask,
  createTask,
  deleteDraft,
  expireOverdue,
  extendByDay,
  publishTask,
  rejectSubmission,
  releaseTask,
  reopenTask,
  submitTask,
} from "@/server/tasks";
import { cb, keyboard, webApp as webAppButton } from "@/server/telegram";
import { isStaff, staffUsers, syncTelegramUser } from "@/server/users";

type BotContext = Context & { user: User };
type MessageContext = Filter<BotContext, "message">;

const bot = new Bot<BotContext>(env.BOT_TOKEN);

// ============ ОБЩЕЕ ============

bot.use(async (ctx, next) => {
  if (!ctx.from || ctx.from.is_bot) return;
  ctx.user = await syncTelegramUser(ctx.from);
  if (!ctx.user.active) return;
  await next();
});

async function fail(ctx: BotContext, e: unknown) {
  if (!isUserError(e)) console.error("[bot]", e);
  const text = isUserError(e) ? e.message : "Что-то сломалось, попробуй ещё раз";
  if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text, show_alert: true }).catch(() => {});
  else await ctx.reply(`⚠️ ${text}`).catch(() => {});
}

async function staffOnly(ctx: BotContext) {
  if (isStaff(ctx.user)) return true;
  await fail(ctx, new UserError("Это могут только кураторы и руководство"));
  return false;
}

async function privateOnly(ctx: BotContext) {
  if (ctx.chat?.type === "private") return true;
  await ctx.reply(`Это работает в личке: https://t.me/${ctx.me.username}`);
  return false;
}

/** Кнопка «Открыть приложение». Telegram принимает её только с публичным https. */
const miniAppButton = (text = "🎯 Открыть квесты") =>
  appUrlIsPublic ? keyboard([webAppButton(text, `${env.APP_URL}/app`)]) : undefined;

function helpText(user: User) {
  const lines = [
    `Привет, ${esc(user.firstName)}! Это квест-борд медиа-отдела.`,
    "",
    appUrlIsPublic
      ? "Квесты падают в чат отдела — забирай кнопкой «🙋 Беру». Всё остальное удобнее в приложении: кнопка ниже."
      : "Квесты падают в чат отдела — забирай кнопкой «🙋 Беру». Детали и сдача — здесь, в личке.",
    "",
    "/app — приложение со списком квестов",
    "/board — свободные квесты",
    "/my — мои квесты",
    "/me — мои очки",
  ];
  if (isStaff(user)) {
    lines.push(
      "",
      `<b>Для кураторов</b> · ты: ${ROLE[user.role]}`,
      "/new — быстрый квест",
      "/admin — вход в админку",
      "/bind — привязать чат отдела (писать в самом чате)",
    );
  }
  return lines.join("\n");
}

async function openTask(ctx: BotContext, id: string) {
  const task = await prisma.task.findUnique({ where: { id }, select: { status: true } });
  if (!task || (task.status === "DRAFT" && !isStaff(ctx.user))) {
    await ctx.reply("Квест не найден — возможно, его удалили.");
    return;
  }
  await sendPrivateCard(id, ctx.user);
}

/** Перерисовать карточку в личке, на которой нажали кнопку. */
async function redrawPressed(ctx: BotContext, taskId: string) {
  const card = await renderPrivateCard(taskId, ctx.user);
  if (!card) return;
  await ctx
    .editMessageText(card.text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: card.reply_markup,
    })
    .catch(() => {});
}

/**
 * Нажали на саму карточку отдела? Так бывает, если чат отдела привязан к личке
 * (режим теста). Её перерисовывает refreshGroupCard — трогать её нельзя.
 */
async function pressedGroupCard(ctx: BotContext, taskId: string) {
  const message = ctx.callbackQuery?.message;
  if (!message) return false;
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { chatId: true, messageId: true } });
  return task?.chatId === BigInt(message.chat.id) && task.messageId === message.message_id;
}

// ============ КОМАНДЫ ============

async function sendLoginLink(ctx: BotContext) {
  if (ctx.chat?.type !== "private") {
    await ctx.reply("Ссылку для входа пришлю только в личку — напиши /admin мне туда.");
    return;
  }
  if (!isStaff(ctx.user)) {
    await ctx.reply("Админка — для кураторов и руководства. Если это ошибка, попроси куратора выдать тебе роль.");
    return;
  }
  const url = await createLoginLink(ctx.user);
  const shown = appUrlIsPublic
    ? `<a href="${esc(url)}">Войти в админку</a>`
    : `<code>${esc(url)}</code>\n<i>Нажми на ссылку — она скопируется. Открой в браузере на этом компьютере.</i>`;
  await ctx.reply(`🔐 ${shown}\n\nСсылка одноразовая и живёт 10 минут. Никому её не пересылай.`, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

bot.command("start", async (ctx) => {
  const payload = ctx.match;
  if (payload.startsWith("q_")) return openTask(ctx, payload.slice(2));
  if (payload === "admin") return sendLoginLink(ctx);
  await ctx.reply(helpText(ctx.user), { parse_mode: "HTML" });
});

bot.command("help", (ctx) =>
  ctx.reply(helpText(ctx.user), { parse_mode: "HTML", reply_markup: miniAppButton() }),
);

bot.command("app", async (ctx) => {
  if (!(await privateOnly(ctx))) return;
  if (!appUrlIsPublic) {
    await ctx.reply(
      [
        "Приложение откроется, когда админка переедет на публичный адрес.",
        "",
        `Сейчас в <code>APP_URL</code> стоит <code>${esc(env.APP_URL)}</code> — Telegram такие адреса не открывает.`,
        "Пока пользуйся командами: /board, /my, /me.",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
    return;
  }
  await ctx.reply("Все квесты, сдача и твой рейтинг — в одном месте:", { reply_markup: miniAppButton() });
});

bot.command("id", async (ctx) => {
  const lines = [`Твой Telegram ID: <code>${ctx.from?.id}</code>`, `ID этого чата: <code>${ctx.chat.id}</code>`];
  if (ctx.msg.is_topic_message) lines.push(`ID темы: <code>${ctx.msg.message_thread_id}</code>`);
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
});

bot.command("board", async (ctx) => {
  if (!(await privateOnly(ctx))) return;
  const tasks = await prisma.task.findMany({
    where: { status: "OPEN" },
    orderBy: [{ claimBy: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 10,
  });
  if (!tasks.length) {
    await ctx.reply("Свободных квестов нет — отдыхай 😌");
    return;
  }
  const lines = tasks.map(
    (t, i) =>
      `${i + 1}. ${KIND[t.kind].emoji} <b>${esc(t.title)}</b> · ⭐ ${t.points}` +
      (t.claimBy ? `\n     ⏳ взять до ${formatDate(t.claimBy)}` : ""),
  );
  await ctx.reply(["🟢 <b>Свободные квесты</b>", "", ...lines].join("\n"), {
    parse_mode: "HTML",
    reply_markup: keyboard(...tasks.map((t, i) => [cb(`${i + 1}. ${clip(t.title, 40)}`, `open:${t.id}`)])),
  });
});

bot.command("my", async (ctx) => {
  if (!(await privateOnly(ctx))) return;
  const tasks = await prisma.task.findMany({
    where: { assigneeId: ctx.user.id, status: { in: ["CLAIMED", "REVISION", "SUBMITTED"] } },
    orderBy: { claimedAt: "asc" },
  });
  if (!tasks.length) {
    await ctx.reply("У тебя нет квестов в работе. Свободные — /board");
    return;
  }
  const lines = tasks.map(
    (t) =>
      `${STATUS[t.status].emoji} <b>${esc(t.title)}</b> — ${STATUS[t.status].label.toLowerCase()}` +
      (t.dueAt ? `\n     📅 сдать до ${formatDate(t.dueAt)}` : ""),
  );
  await ctx.reply(["📋 <b>Мои квесты</b>", "", ...lines].join("\n"), {
    parse_mode: "HTML",
    reply_markup: keyboard(...tasks.map((t) => [cb(clip(t.title, 40), `open:${t.id}`)])),
  });
});

bot.command("me", async (ctx) => {
  const [done, ahead] = await Promise.all([
    prisma.task.count({ where: { assigneeId: ctx.user.id, status: "DONE" } }),
    prisma.user.count({ where: { active: true, points: { gt: ctx.user.points } } }),
  ]);
  await ctx.reply(
    [`⭐ <b>${ctx.user.points}</b> очков`, `✅ Сдано квестов: ${done}`, `🏆 Место в отделе: ${ahead + 1}`].join("\n"),
    { parse_mode: "HTML" },
  );
});

bot.command("new", async (ctx) => {
  if (!(await privateOnly(ctx)) || !(await staffOnly(ctx))) return;
  const [title = "", ...rest] = ctx.match.split("\n");
  if (!title.trim()) {
    await ctx.reply(
      [
        "Напиши так:",
        "",
        "<code>/new Сторис с дня открытых дверей",
        "5–7 сторис: зал, спикеры, реакции</code>",
        "",
        "Первая строка — заголовок, дальше — бриф.",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
    return;
  }
  try {
    const task = await createTask(ctx.user, {
      title,
      brief: rest.join("\n"),
      kind: "CONTENT",
      skill: null,
      points: 10,
      claimBy: null,
      dueAt: null,
    });
    await sendPrivateCard(task.id, ctx.user, "📝 Черновик готов. Сроки, навык и очки — в админке (/admin).");
  } catch (e) {
    await fail(ctx, e);
  }
});

bot.command("admin", sendLoginLink);

bot.command("bind", async (ctx) => {
  if (!(await staffOnly(ctx))) return;
  const chat = ctx.chat;
  const threadId = ctx.msg.is_topic_message ? (ctx.msg.message_thread_id ?? null) : null;
  const isPrivate = chat.type === "private";
  await setDepartmentChat({
    chatId: String(chat.id),
    threadId,
    title: ("title" in chat && chat.title) || `личка с ${ctx.user.firstName}`,
  });
  await ctx.reply(
    isPrivate
      ? "✅ Квесты будут падать сюда, в личку — удобно для теста.\n\nДля работы добавь меня в чат отдела и напиши /bind там."
      : threadId
        ? "✅ Квесты отдела будут падать в эту тему."
        : "✅ Квесты отдела будут падать в этот чат.",
  );
});

bot.command("cancel", async (ctx) => {
  await clearChatState(ctx.user.telegramId);
  await ctx.reply("Ок, отменил(а).");
});

// ============ КНОПКИ ИСПОЛНИТЕЛЯ ============

bot.callbackQuery("noop", (ctx) => ctx.answerCallbackQuery());

bot.callbackQuery(/^open:(\w+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await openTask(ctx, ctx.match[1]);
});

bot.callbackQuery(/^claim:(\w+)$/, async (ctx) => {
  const id = ctx.match[1];
  try {
    const result = await claimTask(ctx.user, id);
    if (!result.ok) {
      await ctx.answerCallbackQuery({ text: result.reason, show_alert: true });
      return;
    }
    if (ctx.chat?.type === "private" && !(await pressedGroupCard(ctx, id))) {
      await ctx.answerCallbackQuery({ text: "✋ Квест твой!" });
      await redrawPressed(ctx, id);
      return;
    }
    const dm = await sendPrivateCard(id, ctx.user, "✋ <b>Квест твой!</b> Когда сделаешь — жми «Сдать».");
    await ctx.answerCallbackQuery(
      dm
        ? { text: "✋ Квест твой! Детали и сдача — в личке с ботом" }
        : {
            text: "✋ Квест твой! Но написать тебе в личку я не могу — нажми «Открыть в боте» под карточкой, потом Start.",
            show_alert: true,
          },
    );
  } catch (e) {
    await fail(ctx, e);
  }
});

bot.callbackQuery(/^submit:(\w+)$/, async (ctx) => {
  const id = ctx.match[1];
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task || task.assigneeId !== ctx.user.id || (task.status !== "CLAIMED" && task.status !== "REVISION")) {
    await fail(ctx, new UserError("Сдать можно только свой взятый квест"));
    return;
  }
  await setChatState(ctx.user.telegramId, "submit", id);
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      `📤 Сдаёшь «${esc(task.title)}»`,
      "",
      "Пришли <b>одним сообщением</b> ссылку на результат (Диск, Drive, пост) и комментарий, если нужен.",
      "Мем или макет можно прислать файлом с подписью. Много фото — только ссылкой на облако.",
      "",
      "/cancel — передумал(а)",
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: { force_reply: true, input_field_placeholder: "Ссылка и комментарий" } },
  );
});

// «Отказаться» — с подтверждением: случайный тап не должен выбрасывать квест из рук
bot.callbackQuery(/^release:(\w+)$/, async (ctx) => {
  const id = ctx.match[1];
  await ctx.answerCallbackQuery();
  await ctx
    .editMessageReplyMarkup({
      reply_markup: keyboard([cb("Да, отказываюсь", `release!:${id}`), cb("Нет, оставлю", `keep:${id}`)]),
    })
    .catch(() => {});
});

bot.callbackQuery(/^keep:(\w+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await redrawPressed(ctx, ctx.match[1]);
});

bot.callbackQuery(/^release!:(\w+)$/, async (ctx) => {
  const id = ctx.match[1];
  try {
    await releaseTask(ctx.user, id);
    await ctx.answerCallbackQuery({ text: "Квест вернулся на доску" });
    await redrawPressed(ctx, id);
  } catch (e) {
    await fail(ctx, e);
  }
});

// ============ КНОПКИ КУРАТОРА ============

bot.callbackQuery(/^accept:(\w+)$/, async (ctx) => {
  if (!(await staffOnly(ctx))) return;
  try {
    await acceptSubmission(ctx.user, ctx.match[1]);
    await ctx.answerCallbackQuery({ text: "✅ Принято" });
    await ctx
      .editMessageReplyMarkup({ reply_markup: keyboard([cb(`✅ Принято · ${ctx.user.firstName}`, "noop")]) })
      .catch(() => {});
  } catch (e) {
    await fail(ctx, e);
  }
});

bot.callbackQuery(/^reject:(\w+)$/, async (ctx) => {
  if (!(await staffOnly(ctx))) return;
  const sub = await prisma.submission.findUnique({ where: { id: ctx.match[1] }, include: { task: true } });
  if (!sub || sub.status !== "PENDING") {
    await fail(ctx, new UserError("Эту сдачу уже проверили"));
    return;
  }
  // запоминаем и сообщение с кнопками, чтобы после комментария погасить их
  await setChatState(ctx.user.telegramId, "reject_note", `${sub.id}|${ctx.callbackQuery.message?.message_id ?? ""}`);
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `🔁 Что поправить в «${esc(sub.task.title)}»? Напиши одним сообщением — перешлю исполнителю.\n\n/cancel — передумал(а)`,
    { parse_mode: "HTML", reply_markup: { force_reply: true, input_field_placeholder: "Что поправить" } },
  );
});

bot.callbackQuery(/^publish:(\w+)$/, async (ctx) => {
  if (!(await staffOnly(ctx))) return;
  const id = ctx.match[1];
  try {
    await publishTask(ctx.user, id);
    await ctx.answerCallbackQuery({ text: "🚀 Улетел в чат отдела" });
    await redrawPressed(ctx, id);
  } catch (e) {
    await fail(ctx, e);
  }
});

bot.callbackQuery(/^delete:(\w+)$/, async (ctx) => {
  if (!(await staffOnly(ctx))) return;
  try {
    await deleteDraft(ctx.user, ctx.match[1]);
    await ctx.answerCallbackQuery({ text: "Удалено" });
    await ctx.editMessageText("🗑 Черновик удалён").catch(() => {});
  } catch (e) {
    await fail(ctx, e);
  }
});

bot.callbackQuery(/^reopen:(\w+)$/, async (ctx) => {
  if (!(await staffOnly(ctx))) return;
  const id = ctx.match[1];
  try {
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) throw new UserError("Квест не найден");
    await reopenTask(ctx.user, id, extendByDay(task));
    await ctx.answerCallbackQuery({ text: "🔁 Переопубликован — на взятие сутки" });
    await ctx
      .editMessageReplyMarkup({ reply_markup: keyboard([cb(`🔁 Переопубликован · ${ctx.user.firstName}`, "noop")]) })
      .catch(() => {});
  } catch (e) {
    await fail(ctx, e);
  }
});

// ============ СООБЩЕНИЯ: СДАЧА И КОММЕНТАРИЙ К ВОЗВРАТУ ============

async function handleSubmission(ctx: MessageContext, taskId: string) {
  const msg = ctx.msg;
  const text = msg.text ?? msg.caption ?? "";
  const entities = msg.entities ?? msg.caption_entities ?? [];
  const links = [
    ...new Set(
      entities.flatMap((e) =>
        e.type === "url" ? [text.slice(e.offset, e.offset + e.length)] : e.type === "text_link" ? [e.url] : [],
      ),
    ),
  ];
  const hasMedia = Boolean(
    msg.photo ?? msg.document ?? msg.video ?? msg.animation ?? msg.audio ?? msg.voice ?? msg.video_note,
  );
  if (!text.trim() && !hasMedia) {
    await ctx.reply("Пришли ссылку, текст или файл. /cancel — отмена");
    return;
  }

  try {
    await submitTask(ctx.user, taskId, {
      text,
      links,
      media: hasMedia ? { chatId: BigInt(ctx.chat.id), messageId: msg.message_id } : undefined,
    });
  } catch (e) {
    if (isUserError(e)) await clearChatState(ctx.user.telegramId);
    await fail(ctx, e);
    return;
  }
  await clearChatState(ctx.user.telegramId);
  await ctx.reply("📤 Сдано! Как только куратор проверит — напишу.");
}

async function handleRejectNote(ctx: MessageContext, payload: string) {
  const [submissionId, reviewMessageId] = payload.split("|");
  const note = ctx.msg.text?.trim();
  if (!note) {
    await ctx.reply("Нужен текст: что поправить. /cancel — отмена");
    return;
  }

  try {
    await rejectSubmission(ctx.user, submissionId, note);
  } catch (e) {
    if (isUserError(e)) await clearChatState(ctx.user.telegramId);
    await fail(ctx, e);
    return;
  }
  await clearChatState(ctx.user.telegramId);
  if (reviewMessageId) {
    await ctx.api
      .editMessageReplyMarkup(ctx.chat.id, Number(reviewMessageId), {
        reply_markup: keyboard([cb(`🔁 Возвращено · ${ctx.user.firstName}`, "noop")]),
      })
      .catch(() => {});
  }
  await ctx.reply("🔁 Вернул(а) на доработку — исполнитель получил комментарий.");
}

bot.on("message", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  if (ctx.msg.text?.startsWith("/")) {
    await ctx.reply("Не знаю такой команды. /help — что я умею");
    return;
  }
  const state = await getChatState(ctx.user.telegramId);
  if (state?.action === "submit") return handleSubmission(ctx, state.payload);
  if (state?.action === "reject_note") return handleRejectNote(ctx, state.payload);
  await ctx.reply("Не понял 🤔 /help — что я умею");
});

bot.on("my_chat_member", async (ctx) => {
  const { old_chat_member: was, new_chat_member: now } = ctx.myChatMember;
  const joined = (was.status === "left" || was.status === "kicked") && (now.status === "member" || now.status === "administrator");
  if (joined && ctx.chat.type !== "private") {
    await ctx
      .reply("👋 Я квест-бот медиа-отдела. Куратор, напиши здесь /bind — и квесты будут падать в этот чат.")
      .catch(() => {});
  }
});

bot.catch(({ error, ctx }) => {
  console.error(`[bot] ошибка на апдейте ${ctx.update.update_id}:`, error);
});

// ============ ЗАПУСК ============

const MEMBER_COMMANDS = [
  { command: "app", description: "Открыть приложение" },
  { command: "board", description: "Свободные квесты" },
  { command: "my", description: "Мои квесты" },
  { command: "me", description: "Мои очки" },
  { command: "help", description: "Что я умею" },
];

const STAFF_COMMANDS = [
  ...MEMBER_COMMANDS,
  { command: "new", description: "Быстрый квест" },
  { command: "admin", description: "Вход в админку" },
  { command: "bind", description: "Привязать чат отдела" },
];

async function main() {
  await bot.init();
  await bot.api.setMyCommands(MEMBER_COMMANDS, { scope: { type: "all_private_chats" } });

  // Кнопка слева от поля ввода. Главный вход в приложение: её видно всегда,
  // в отличие от кнопки под конкретным сообщением, которая уезжает вверх.
  await bot.api
    .setChatMenuButton({
      menu_button: appUrlIsPublic
        ? { type: "web_app", text: "Квесты", web_app: { url: `${env.APP_URL}/app` } }
        : { type: "commands" },
    })
    .catch((e) => console.warn("[bot] не поставил кнопку меню:", e));
  for (const user of await staffUsers()) {
    await bot.api
      .setMyCommands(STAFF_COMMANDS, { scope: { type: "chat", chat_id: Number(user.telegramId) } })
      .catch(() => {}); // ещё не нажимал Start — меню появится после перезапуска
  }

  const sweep = () => expireOverdue().catch((e) => console.error("[sweep]", e));
  const timer = setInterval(sweep, 60_000);
  void sweep();

  const stop = async () => {
    clearInterval(timer);
    await bot.stop();
    await prisma.$disconnect();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  // После перезапуска (tsx watch, деплой) старый getUpdates ещё может висеть
  // у Telegram до 30 секунд — это 409, а не повод падать.
  for (;;) {
    try {
      await bot.start({
        allowed_updates: ["message", "callback_query", "my_chat_member"],
        onStart: (me) => console.log(`[bot] запущен как @${me.username}`),
      });
      return;
    } catch (e) {
      if (e instanceof GrammyError && e.error_code === 409) {
        console.warn("[bot] getUpdates занят другим экземпляром — повторю через 5 с");
        await new Promise((r) => setTimeout(r, 5_000));
        continue;
      }
      throw e;
    }
  }
}

main().catch((e) => {
  console.error("[bot] не стартовал:", e);
  process.exit(1);
});
