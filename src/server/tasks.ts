import type { Prisma, Skill, TaskKind, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { esc } from "@/lib/html";
import { KIND } from "@/lib/labels";
import { describeError, isUserError, UserError } from "./errors";
import { postGroupCard, refreshGroupCard, sendPrivateCard } from "./cards";
import { notifyReviewers, notifyStaff } from "./notify";
import { getDepartmentChat } from "./settings";
import { cb, keyboard, trySend } from "./telegram";
import { mention } from "./users";

// Все переходы статусов — только updateMany с ожидаемым статусом в where.
// Прочитать статус и потом записать отдельным запросом нельзя: между ними
// кто-то успеет нажать кнопку, и квест получат двое. См. CLAUDE.md.

type Db = Prisma.TransactionClient | typeof prisma;

const DAY_MS = 24 * 60 * 60_000;

const log = (db: Db, taskId: string, actorId: string | null, type: string, meta?: Prisma.InputJsonObject) =>
  db.taskEvent.create({ data: { taskId, actorId, type, meta } });

const title = (task: { kind: TaskKind; title: string }) => `${KIND[task.kind].emoji} «${esc(task.title)}»`;

const NOT_BOUND = "Чат отдела не привязан: добавь бота в чат отдела и напиши там /bind";

// ============ СОЗДАНИЕ И РЕДАКТИРОВАНИЕ ============

export type TaskInput = {
  title: string;
  brief: string | null;
  kind: TaskKind;
  skill: Skill | null;
  points: number;
  claimBy: Date | null;
  dueAt: Date | null;
};

function normalize(input: TaskInput): TaskInput {
  const clean = { ...input, title: input.title.trim(), brief: input.brief?.trim() || null };
  if (!clean.title) throw new UserError("Нужен заголовок");
  if (clean.title.length > 200) throw new UserError("Заголовок длиннее 200 символов — перенеси детали в бриф");
  if (!Number.isInteger(clean.points) || clean.points < 0 || clean.points > 1000) {
    throw new UserError("Очки — целое число от 0 до 1000");
  }
  if (clean.claimBy && clean.dueAt && clean.dueAt < clean.claimBy) {
    throw new UserError("«Сдать до» не может быть раньше «Взять до»");
  }
  return clean;
}

export async function createTask(actor: User, input: TaskInput) {
  const data = normalize(input);
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({ data: { ...data, authorId: actor.id, status: "DRAFT" } });
    await log(tx, task.id, actor.id, "created");
    return task;
  });
}

export async function updateTask(actor: User, id: string, input: TaskInput) {
  const data = normalize(input);
  const { count } = await prisma.task.updateMany({
    where: { id, status: { notIn: ["DONE", "CANCELLED"] } },
    data,
  });
  if (count === 0) throw new UserError("Закрытый квест не редактируется");
  await log(prisma, id, actor.id, "edited");
  await refreshGroupCard(id);
}

export async function deleteDraft(_actor: User, id: string) {
  const { count } = await prisma.task.deleteMany({ where: { id, status: "DRAFT" } });
  if (count === 0) throw new UserError("Удалить можно только черновик — опубликованный квест отменяют");
}

// ============ ПУБЛИКАЦИЯ ============

export async function publishTask(actor: User, id: string) {
  if (!(await getDepartmentChat())) throw new UserError(NOT_BOUND);
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new UserError("Квест не найден");
  if (task.claimBy && task.claimBy <= new Date()) {
    throw new UserError("Срок «Взять до» уже прошёл — поправь его перед публикацией");
  }

  const { count } = await prisma.task.updateMany({
    where: { id, status: "DRAFT" },
    data: { status: "OPEN", publishedAt: new Date() },
  });
  if (count === 0) throw new UserError("Квест уже опубликован");

  try {
    await postGroupCard(id);
  } catch (e) {
    // карточка не ушла — квест не должен числиться на доске, которую никто не видит
    await prisma.task.update({ where: { id }, data: { status: "DRAFT", publishedAt: null } });
    if (isUserError(e)) throw e;
    throw new UserError(`Telegram не принял карточку: ${describeError(e)}`);
  }
  await log(prisma, id, actor.id, "published");
}

/**
 * Вернуть протухший или отменённый квест на доску свежей карточкой.
 * EXPIRED не значит «работа не нужна» — это сигнал куратору, а не корзина.
 */
export async function reopenTask(actor: User, id: string, deadlines: { claimBy: Date | null; dueAt: Date | null }) {
  const now = new Date();
  if (deadlines.claimBy && deadlines.claimBy <= now) throw new UserError("«Взять до» должно быть в будущем");
  if (deadlines.dueAt && deadlines.dueAt <= now) throw new UserError("«Сдать до» должно быть в будущем");
  if (deadlines.claimBy && deadlines.dueAt && deadlines.dueAt < deadlines.claimBy) {
    throw new UserError("«Сдать до» не может быть раньше «Взять до»");
  }
  if (!(await getDepartmentChat())) throw new UserError(NOT_BOUND);

  const before = await prisma.task.findUnique({ where: { id } });
  if (!before || (before.status !== "EXPIRED" && before.status !== "CANCELLED")) {
    throw new UserError("Переопубликовать можно только протухший или отменённый квест");
  }

  const { count } = await prisma.task.updateMany({
    where: { id, status: before.status },
    data: { status: "OPEN", assigneeId: null, claimedAt: null, publishedAt: now, ...deadlines },
  });
  if (count === 0) throw new UserError("Статус квеста уже поменялся");

  try {
    await postGroupCard(id);
  } catch (e) {
    await prisma.task.update({
      where: { id },
      data: { status: before.status, claimBy: before.claimBy, dueAt: before.dueAt, publishedAt: before.publishedAt },
    });
    if (isUserError(e)) throw e;
    throw new UserError(`Telegram не принял карточку: ${describeError(e)}`);
  }
  await log(prisma, id, actor.id, "reopened");
}

/** «Ещё сутки» из бота: оба дедлайна сдвигаются одинаково, чтобы окно на работу не схлопнулось. */
export function extendByDay(task: { claimBy: Date | null; dueAt: Date | null }, now = new Date()) {
  const claimBy = new Date(now.getTime() + DAY_MS);
  const shift = claimBy.getTime() - (task.claimBy ?? now).getTime();
  const dueAt = task.dueAt ? new Date(Math.max(task.dueAt.getTime() + shift, claimBy.getTime())) : null;
  return { claimBy, dueAt };
}

export async function cancelTask(actor: User, id: string) {
  const before = await prisma.task.findUnique({ where: { id }, include: { assignee: true } });
  if (!before) throw new UserError("Квест не найден");
  if (before.status === "DRAFT") throw new UserError("Черновик не отменяют, а удаляют");

  const { count } = await prisma.task.updateMany({
    where: { id, status: { in: ["OPEN", "CLAIMED", "SUBMITTED", "REVISION", "EXPIRED"] } },
    data: { status: "CANCELLED" },
  });
  if (count === 0) throw new UserError("Квест уже закрыт");

  await prisma.submission.updateMany({
    where: { taskId: id, status: "PENDING" },
    data: { status: "REJECTED", reviewNote: "Квест отменён", reviewerId: actor.id, reviewedAt: new Date() },
  });
  await log(prisma, id, actor.id, "cancelled");
  await refreshGroupCard(id);
  if (before.assignee) await trySend(before.assignee.telegramId, `🚫 Квест ${title(before)} отменили.`);
}

// ============ ИСПОЛНИТЕЛЬ ============

export type ClaimResult = { ok: true } | { ok: false; reason: string };

export async function claimTask(user: User, id: string): Promise<ClaimResult> {
  const now = new Date();
  const { count } = await prisma.task.updateMany({
    where: {
      id,
      status: "OPEN",
      assigneeId: null,
      OR: [{ claimBy: null }, { claimBy: { gt: now } }],
    },
    data: { status: "CLAIMED", assigneeId: user.id, claimedAt: now },
  });

  if (count === 0) {
    // проиграли гонку или опоздали — объясняем, что именно случилось
    const task = await prisma.task.findUnique({ where: { id }, include: { assignee: true } });
    if (!task) return { ok: false, reason: "Квест не найден — возможно, его удалили" };
    if (task.assigneeId === user.id) return { ok: false, reason: "Этот квест уже твой" };
    if (task.assignee) return { ok: false, reason: `Уже разобрали — взял(а) ${task.assignee.firstName}` };
    if (task.status === "OPEN" && task.claimBy && task.claimBy <= now) {
      return { ok: false, reason: "Время на взятие вышло ⌛" };
    }
    return { ok: false, reason: "Этот квест сейчас нельзя взять" };
  }

  await log(prisma, id, user.id, "claimed");
  await refreshGroupCard(id);
  return { ok: true };
}

export async function releaseTask(actor: User, id: string, opts: { byStaff?: boolean } = {}) {
  const task = await prisma.task.findUnique({ where: { id }, include: { assignee: true } });
  if (!task?.assignee || (task.status !== "CLAIMED" && task.status !== "REVISION")) {
    throw new UserError("Этот квест сейчас нельзя вернуть на доску");
  }
  if (!opts.byStaff && task.assigneeId !== actor.id) throw new UserError("Это не твой квест");
  const assignee = task.assignee;

  const { count } = await prisma.task.updateMany({
    where: { id, assigneeId: assignee.id, status: { in: ["CLAIMED", "REVISION"] } },
    data: { status: "OPEN", assigneeId: null, claimedAt: null },
  });
  if (count === 0) throw new UserError("Статус квеста уже поменялся — обнови карточку");

  await log(prisma, id, actor.id, opts.byStaff ? "unassigned" : "released", { assigneeId: assignee.id });
  await refreshGroupCard(id);

  if (opts.byStaff) {
    await trySend(assignee.telegramId, `Тебя сняли с квеста ${title(task)}. Он снова на доске.`);
  } else {
    await notifyStaff(`↩️ ${mention(actor)} отказался(ась) от квеста ${title(task)} — он снова свободен.`);
  }
}

export async function submitTask(
  user: User,
  id: string,
  input: { text: string; links: string[]; media?: { chatId: bigint; messageId: number } },
) {
  const submission = await prisma.$transaction(async (tx) => {
    const { count } = await tx.task.updateMany({
      where: { id, assigneeId: user.id, status: { in: ["CLAIMED", "REVISION"] } },
      data: { status: "SUBMITTED" },
    });
    if (count === 0) throw new UserError("Сдать можно только свой взятый квест");

    const sub = await tx.submission.create({
      data: {
        taskId: id,
        authorId: user.id,
        links: input.links,
        comment: input.text.trim() || null,
        tgChatId: input.media?.chatId,
        tgMessageId: input.media?.messageId,
      },
    });
    await log(tx, id, user.id, "submitted", { submissionId: sub.id });
    return sub;
  });

  await refreshGroupCard(id);
  await notifyReviewers(submission.id);
  return submission;
}

// ============ ПРИЁМКА ============

export async function acceptSubmission(reviewer: User, submissionId: string) {
  const sub = await prisma.$transaction(async (tx) => {
    const { count } = await tx.submission.updateMany({
      where: { id: submissionId, status: "PENDING" },
      data: { status: "ACCEPTED", reviewerId: reviewer.id, reviewedAt: new Date() },
    });
    if (count === 0) throw new UserError("Эту сдачу уже проверили");

    const sub = await tx.submission.findUniqueOrThrow({ where: { id: submissionId }, include: { task: true } });
    const moved = await tx.task.updateMany({
      where: { id: sub.taskId, status: "SUBMITTED" },
      data: { status: "DONE", doneAt: new Date() },
    });
    if (moved.count === 0) throw new UserError("Квест уже не на проверке");

    await tx.user.update({ where: { id: sub.authorId }, data: { points: { increment: sub.task.points } } });
    await tx.pointEntry.create({
      data: { userId: sub.authorId, amount: sub.task.points, reason: `Квест «${sub.task.title}»`, taskId: sub.taskId },
    });
    await log(tx, sub.taskId, reviewer.id, "accepted", { submissionId });
    return sub;
  });

  await refreshGroupCard(sub.taskId);
  const author = await prisma.user.findUniqueOrThrow({ where: { id: sub.authorId } });
  await trySend(
    author.telegramId,
    `✅ Квест ${title(sub.task)} принят! +${sub.task.points} ⭐\nТеперь у тебя <b>${author.points}</b> ⭐`,
  );
}

export async function rejectSubmission(reviewer: User, submissionId: string, note: string) {
  const reviewNote = note.trim();
  if (!reviewNote) throw new UserError("Напиши, что поправить — без этого исполнитель не поймёт, что не так");

  const sub = await prisma.$transaction(async (tx) => {
    const { count } = await tx.submission.updateMany({
      where: { id: submissionId, status: "PENDING" },
      data: { status: "REJECTED", reviewerId: reviewer.id, reviewedAt: new Date(), reviewNote },
    });
    if (count === 0) throw new UserError("Эту сдачу уже проверили");

    const sub = await tx.submission.findUniqueOrThrow({ where: { id: submissionId } });
    const moved = await tx.task.updateMany({
      where: { id: sub.taskId, status: "SUBMITTED" },
      data: { status: "REVISION" },
    });
    if (moved.count === 0) throw new UserError("Квест уже не на проверке");

    await log(tx, sub.taskId, reviewer.id, "rejected", { submissionId, note: reviewNote });
    return sub;
  });

  await refreshGroupCard(sub.taskId);
  const author = await prisma.user.findUniqueOrThrow({ where: { id: sub.authorId } });
  // карточка в REVISION сама покажет комментарий и кнопку «Сдать снова»
  await sendPrivateCard(sub.taskId, author, "🔁 <b>Квест вернули на доработку</b>");
}

// ============ АВТОМАТИКА ============

/** Никто не взял до claimBy -> EXPIRED и пинг кураторам. Бот зовёт раз в минуту. */
export async function expireOverdue(now = new Date()) {
  const due = await prisma.task.findMany({
    where: { status: "OPEN", claimBy: { lte: now } },
    select: { id: true },
  });

  for (const { id } of due) {
    // условие повторяем: пока шли по списку, квест могли успеть взять
    const { count } = await prisma.task.updateMany({
      where: { id, status: "OPEN", claimBy: { lte: now } },
      data: { status: "EXPIRED" },
    });
    if (count === 0) continue;

    await log(prisma, id, null, "expired");
    await refreshGroupCard(id);
    const task = await prisma.task.findUniqueOrThrow({ where: { id } });
    await notifyStaff(
      [
        "⌛ <b>Никто не взял квест</b>",
        title(task),
        "",
        "Работа всё ещё нужна — дай ещё сутки или поправь сроки в админке.",
      ].join("\n"),
      { reply_markup: keyboard([cb("🔁 Ещё сутки на взятие", `reopen:${id}`)]) },
    );
  }
}
