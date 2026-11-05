"use server";

import type { Skill, TaskKind, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/time";
import { describeError, isUserError, UserError } from "./errors";
import { authenticateMiniApp } from "./miniapp-auth";
import { claimTask, releaseTask, submitTask } from "./tasks";

// Серверные действия Mini App. Подпись initData проверяется в КАЖДОМ действии:
// клиент не хранит сессию, подделать вызов нельзя. См. miniapp-auth.ts.

export type Quest = {
  id: string;
  title: string;
  brief: string | null;
  kind: TaskKind;
  skill: Skill | null;
  status: TaskStatus;
  points: number;
  claimBy: string | null;
  dueAt: string | null;
  claimByLabel: string | null;
  dueAtLabel: string | null;
  eventTitle: string | null;
  reviewNote: string | null;
};

export type MiniAppState = {
  me: {
    firstName: string;
    points: number;
    rank: number;
    doneCount: number;
    skills: Skill[];
    isStaff: boolean;
  };
  open: Quest[];
  mine: Quest[];
  pendingReview: number;
};

export type MiniAppResult =
  | { ok: true; state: MiniAppState; toast?: string }
  | { ok: false; error: string; state?: MiniAppState };

const questSelect = {
  id: true,
  title: true,
  brief: true,
  kind: true,
  skill: true,
  status: true,
  points: true,
  claimBy: true,
  dueAt: true,
  event: { select: { title: true } },
  submissions: { orderBy: { createdAt: "desc" }, take: 1, select: { reviewNote: true, status: true } },
} as const;

type QuestRow = {
  id: string;
  title: string;
  brief: string | null;
  kind: TaskKind;
  skill: Skill | null;
  status: TaskStatus;
  points: number;
  claimBy: Date | null;
  dueAt: Date | null;
  event: { title: string } | null;
  submissions: { reviewNote: string | null; status: string }[];
};

// Даты отдаём и строкой, и меткой: относительное время («через 3 ч») клиент
// пересчитывает сам, а абсолютное — уже в поясе отдела, Intl на клиент не тащим.
function toQuest(row: QuestRow): Quest {
  const last = row.submissions[0];
  return {
    id: row.id,
    title: row.title,
    brief: row.brief,
    kind: row.kind,
    skill: row.skill,
    status: row.status,
    points: row.points,
    claimBy: row.claimBy?.toISOString() ?? null,
    dueAt: row.dueAt?.toISOString() ?? null,
    claimByLabel: row.claimBy ? formatDate(row.claimBy) : null,
    dueAtLabel: row.dueAt ? formatDate(row.dueAt) : null,
    eventTitle: row.event?.title ?? null,
    reviewNote: row.status === "REVISION" && last?.status === "REJECTED" ? last.reviewNote : null,
  };
}

async function buildState(userId: string): Promise<MiniAppState> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const isStaff = user.role === "ADMIN" || user.role === "CURATOR";

  const [open, mine, ahead, doneCount, pendingReview] = await Promise.all([
    prisma.task.findMany({
      where: { status: "OPEN" },
      orderBy: [{ claimBy: { sort: "asc", nulls: "last" } }, { points: "desc" }],
      take: 50,
      select: questSelect,
    }),
    prisma.task.findMany({
      where: { assigneeId: userId, status: { in: ["CLAIMED", "REVISION", "SUBMITTED"] } },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
      select: questSelect,
    }),
    prisma.user.count({ where: { active: true, points: { gt: user.points } } }),
    prisma.task.count({ where: { assigneeId: userId, status: "DONE" } }),
    isStaff ? prisma.submission.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
  ]);

  return {
    me: {
      firstName: user.firstName,
      points: user.points,
      rank: ahead + 1,
      doneCount,
      skills: user.skills,
      isStaff,
    },
    open: open.map(toQuest),
    mine: mine.map(toQuest),
    pendingReview,
  };
}

/** Обёртка: проверить подпись, выполнить действие, вернуть свежее состояние. */
async function run(
  initData: string,
  action?: (userId: string) => Promise<string | void>,
): Promise<MiniAppResult> {
  let userId: string;
  try {
    userId = (await authenticateMiniApp(initData)).id;
  } catch (e) {
    if (!isUserError(e)) console.error("[miniapp] вход:", e);
    return { ok: false, error: isUserError(e) ? e.message : "Что-то сломалось. Попробуй ещё раз." };
  }

  let toast: string | undefined;
  try {
    toast = (await action?.(userId)) ?? undefined;
  } catch (e) {
    if (!isUserError(e)) console.error("[miniapp] действие:", e);
    // состояние отдаём даже при ошибке: экран обновится и покажет, как есть на самом деле
    return {
      ok: false,
      error: isUserError(e) ? e.message : `Что-то сломалось: ${describeError(e)}`,
      state: await buildState(userId).catch(() => undefined),
    };
  }
  return { ok: true, state: await buildState(userId), toast };
}

export async function loadState(initData: string): Promise<MiniAppResult> {
  return run(initData);
}

export async function claimQuest(initData: string, taskId: string): Promise<MiniAppResult> {
  return run(initData, async (userId) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const result = await claimTask(user, taskId);
    if (!result.ok) throw new UserError(result.reason);
    return "Квест твой!";
  });
}

export async function releaseQuest(initData: string, taskId: string): Promise<MiniAppResult> {
  return run(initData, async (userId) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await releaseTask(user, taskId);
    return "Квест вернулся на доску";
  });
}

export async function submitQuest(
  initData: string,
  taskId: string,
  text: string,
): Promise<MiniAppResult> {
  return run(initData, async (userId) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!text.trim()) throw new UserError("Напиши, что сделал, или кинь ссылку");
    const links = [...new Set(text.match(/https?:\/\/\S+/g) ?? [])];
    await submitTask(user, taskId, { text, links });
    return "Сдано! Куратор проверит и напишет";
  });
}
