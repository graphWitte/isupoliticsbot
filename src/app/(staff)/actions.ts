"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Skill } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ActionState } from "@/lib/action-state";
import { isBootstrapAdmin } from "@/lib/env";
import { KINDS, ROLES, SKILLS } from "@/lib/labels";
import { parseLocalInput } from "@/lib/time";
import { describeError, isUserError, UserError } from "@/server/errors";
import { endSession, requireStaff } from "@/server/session";
import {
  acceptSubmission,
  cancelTask,
  createTask,
  deleteDraft,
  publishTask,
  rejectSubmission,
  releaseTask,
  reopenTask,
  updateTask,
  type TaskInput,
} from "@/server/tasks";

function failure(e: unknown): NonNullable<ActionState> {
  if (isUserError(e)) return { error: e.message };
  console.error("[admin]", e);
  return { error: `Что-то сломалось: ${describeError(e)}` };
}

async function attempt(fn: () => Promise<unknown>, notice: string): Promise<ActionState> {
  try {
    await fn();
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/", "layout");
  return { notice };
}

const field = (fd: FormData, key: string) => {
  const value = fd.get(key);
  return typeof value === "string" ? value : "";
};

function readDate(fd: FormData, key: string, label: string) {
  const raw = field(fd, key).trim();
  if (!raw) return null;
  const date = parseLocalInput(raw);
  if (!date) throw new UserError(`Не понял дату «${label}»`);
  return date;
}

function readTaskForm(fd: FormData): TaskInput {
  const kind = z.enum(KINDS).safeParse(field(fd, "kind"));
  if (!kind.success) throw new UserError("Выбери тип квеста");

  // getAll: чекбоксов может быть несколько. Дубли режем — форму можно подделать.
  const rawSkills = [...new Set(fd.getAll("skills").filter((v): v is string => typeof v === "string"))];
  const parsedSkills = z.array(z.enum(SKILLS)).safeParse(rawSkills);
  if (!parsedSkills.success) throw new UserError("Неизвестный навык");
  const skills: Skill[] = parsedSkills.data;

  return {
    title: field(fd, "title"),
    brief: field(fd, "brief"),
    kind: kind.data,
    skills,
    points: Number(field(fd, "points")),
    claimBy: readDate(fd, "claimBy", "Взять до"),
    dueAt: readDate(fd, "dueAt", "Сдать до"),
  };
}

// ============ КВЕСТЫ ============

export async function createTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  let taskId: string;
  try {
    taskId = (await createTask(user, readTaskForm(fd))).id;
  } catch (e) {
    return failure(e);
  }

  // Черновик уже сохранён. Если публикация не удалась — не теряем квест,
  // а ведём на его страницу и показываем, почему не улетел.
  let publishError = "";
  if (field(fd, "intent") === "publish") {
    try {
      await publishTask(user, taskId);
    } catch (e) {
      publishError = failure(e).error ?? "";
    }
  }

  revalidatePath("/", "layout");
  redirect(publishError ? `/tasks/${taskId}?error=${encodeURIComponent(publishError)}` : `/tasks/${taskId}`);
}

export async function updateTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  return attempt(() => updateTask(user, field(fd, "id"), readTaskForm(fd)), "Сохранено — карточка в чате обновлена");
}

export async function publishTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  return attempt(() => publishTask(user, field(fd, "id")), "🚀 Улетел в чат отдела");
}

export async function deleteDraftAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  try {
    await deleteDraft(user, field(fd, "id"));
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function cancelTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  return attempt(() => cancelTask(user, field(fd, "id")), "Квест отменён");
}

export async function unassignAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  return attempt(
    () => releaseTask(user, field(fd, "id"), { byStaff: true }),
    "Исполнитель снят — квест снова свободен",
  );
}

export async function reopenTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  return attempt(
    () =>
      reopenTask(user, field(fd, "id"), {
        claimBy: readDate(fd, "claimBy", "Взять до"),
        dueAt: readDate(fd, "dueAt", "Сдать до"),
      }),
    "🔁 Переопубликован свежей карточкой",
  );
}

// ============ ПРИЁМКА ============

export async function acceptAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  return attempt(() => acceptSubmission(user, field(fd, "submissionId")), "✅ Принято, очки начислены");
}

export async function rejectAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  return attempt(
    () => rejectSubmission(user, field(fd, "submissionId"), field(fd, "note")),
    "🔁 Вернули на доработку",
  );
}

// ============ ЛЮДИ И ДОСТУП ============

export async function setRoleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  return attempt(async () => {
    if (user.role !== "ADMIN") throw new UserError("Роли меняет только руководство");
    const target = await prisma.user.findUnique({ where: { id: field(fd, "userId") } });
    if (!target) throw new UserError("Человек не найден");
    if (target.id === user.id) throw new UserError("Свою роль поменять нельзя — так легко запереть себя снаружи");
    if (isBootstrapAdmin(target.telegramId)) throw new UserError("Это суперадмин из .env — его роль не меняется");

    const role = z.enum(ROLES).safeParse(field(fd, "role"));
    if (!role.success) throw new UserError("Неизвестная роль");
    await prisma.user.update({ where: { id: target.id }, data: { role: role.data } });
    // разжалованный выходит из админки сразу, а не через 30 дней
    if (role.data === "MEMBER") await prisma.session.deleteMany({ where: { userId: target.id } });
  }, "Роль обновлена");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
