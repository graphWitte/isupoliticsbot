import type { Prisma, Role, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrlIsPublic, env } from "@/lib/env";
import { clip, esc } from "@/lib/html";
import { KIND, SKILL } from "@/lib/labels";
import { formatDate } from "@/lib/time";
import { UserError } from "./errors";
import { getDepartmentChat } from "./settings";
import { api, cb, deepLink, isNotModified, keyboard, link, trySend } from "./telegram";
import { isStaff, mention } from "./users";

export const cardInclude = {
  assignee: true,
  event: true,
  submissions: { orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.TaskInclude;

export type CardTask = Prisma.TaskGetPayload<{ include: typeof cardInclude }>;

const loadCardTask = (id: string) => prisma.task.findUnique({ where: { id }, include: cardInclude });

function statusLine(task: CardTask): string {
  const who = task.assignee ? mention(task.assignee) : "—";
  switch (task.status) {
    case "DRAFT":
      return "📝 <i>Черновик — в чат отдела ещё не улетел</i>";
    case "OPEN":
      return "🟢 <b>Свободен</b> — жми «Беру»";
    case "CLAIMED":
      return `✋ Взял(а): ${who}`;
    case "SUBMITTED":
      return `📤 Сдан, на проверке · ${who}`;
    case "REVISION":
      return `🔁 На доработке · ${who}`;
    case "DONE":
      return `✅ <b>Готово</b> · ${who} +${task.points} ⭐`;
    case "CANCELLED":
      return "🚫 Отменён";
    case "EXPIRED":
      return "⌛ Никто не взял вовремя";
  }
}

export function renderCard(task: CardTask, opts: { forAssignee?: boolean } = {}): string {
  const kind = KIND[task.kind];
  const meta = [kind.label];
  for (const s of task.skills) meta.push(`${SKILL[s].emoji} ${SKILL[s].label}`);
  meta.push(`⭐ ${task.points}`);

  const out = [`${kind.emoji} <b>${esc(task.title)}</b>`, meta.join(" · ")];
  if (task.brief) out.push("", esc(clip(task.brief, 3000)));
  if (task.event) out.push("", `📍 ${esc(task.event.title)}, ${formatDate(task.event.startsAt)}`);

  const deadlines: string[] = [];
  if (task.claimBy) deadlines.push(`⏳ Взять до <b>${formatDate(task.claimBy)}</b>`);
  if (task.dueAt) deadlines.push(`📅 Сдать до <b>${formatDate(task.dueAt)}</b>`);
  if (deadlines.length) out.push("", ...deadlines);

  out.push("", statusLine(task));

  const note = task.submissions[0]?.reviewNote;
  if (opts.forAssignee && task.status === "REVISION" && note) {
    out.push("", `💬 Что поправить: <i>${esc(clip(note, 500))}</i>`);
  }
  return out.join("\n");
}

async function groupKeyboard(task: CardTask) {
  if (task.status === "OPEN") return keyboard([cb("🙋 Беру", `claim:${task.id}`)]);
  if (task.status === "CLAIMED" || task.status === "REVISION" || task.status === "SUBMITTED") {
    return keyboard([link("📂 Открыть в боте", await deepLink(`q_${task.id}`))]);
  }
  return undefined;
}

async function privateKeyboard(task: CardTask, viewer: { id: string; role: Role }) {
  const mine = task.assigneeId === viewer.id;
  const staff = isStaff(viewer);

  const main = [];
  if (task.status === "OPEN") main.push(cb("🙋 Беру", `claim:${task.id}`));
  if (mine && (task.status === "CLAIMED" || task.status === "REVISION")) {
    main.push(
      cb(task.status === "REVISION" ? "📤 Сдать снова" : "📤 Сдать", `submit:${task.id}`),
      cb("↩️ Отказаться", `release:${task.id}`),
    );
  }

  const manage = [];
  if (staff && task.status === "DRAFT") {
    manage.push(cb("🚀 Опубликовать", `publish:${task.id}`), cb("🗑 Удалить", `delete:${task.id}`));
  }
  if (staff && (task.status === "EXPIRED" || task.status === "CANCELLED")) {
    manage.push(cb("🔁 Ещё сутки на взятие", `reopen:${task.id}`));
  }

  const admin = staff && appUrlIsPublic ? [link("🛠 В админке", `${env.APP_URL}/tasks/${task.id}`)] : [];
  return keyboard(main, manage, admin);
}

/** Карточка для лички: у исполнителя — кнопки сдачи, у куратора — управление. */
export async function renderPrivateCard(taskId: string, viewer: User) {
  const task = await loadCardTask(taskId);
  if (!task) return null;
  return {
    text: renderCard(task, { forAssignee: task.assigneeId === viewer.id }),
    reply_markup: await privateKeyboard(task, viewer),
  };
}

export async function sendPrivateCard(taskId: string, viewer: User, intro?: string) {
  const card = await renderPrivateCard(taskId, viewer);
  if (!card) return null;
  return trySend(viewer.telegramId, intro ? `${intro}\n\n${card.text}` : card.text, {
    reply_markup: card.reply_markup,
  });
}

/** Перерисовать карточку в чате отдела под текущий статус. Сбой Telegram не откатывает действие. */
export async function refreshGroupCard(taskId: string) {
  const task = await loadCardTask(taskId);
  if (!task?.chatId || !task.messageId) return;
  try {
    // без reply_markup Telegram снимает клавиатуру — это и нужно закрытым квестам
    await api.editMessageText(String(task.chatId), task.messageId, renderCard(task), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: await groupKeyboard(task),
    });
  } catch (e) {
    if (!isNotModified(e)) console.error(`[cards] не обновил карточку ${taskId}:`, e);
  }
}

/** Отправить карточку в чат отдела. Бросает, если чат не привязан или Telegram отказал. */
export async function postGroupCard(taskId: string) {
  const chat = await getDepartmentChat();
  if (!chat) throw new UserError("Чат отдела не привязан: добавь бота в чат отдела и напиши там /bind");
  const task = await loadCardTask(taskId);
  if (!task) throw new UserError("Квест не найден");

  // Переопубликация: старая карточка ушла далеко вверх, её никто не увидит.
  // Гасим её и шлём свежую вниз чата.
  if (task.chatId && task.messageId) {
    await api
      .editMessageText(
        String(task.chatId),
        task.messageId,
        `${KIND[task.kind].emoji} <s>${esc(task.title)}</s>\n\n🔁 Переопубликован — карточка ниже`,
        { parse_mode: "HTML" },
      )
      .catch(() => {});
  }

  const message = await api.sendMessage(chat.chatId, renderCard(task), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    message_thread_id: chat.threadId ?? undefined,
    reply_markup: await groupKeyboard(task),
  });
  await prisma.task.update({
    where: { id: taskId },
    data: { chatId: BigInt(message.chat.id), messageId: message.message_id },
  });
}
