import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { claimTask } from "./tasks";

// Инвариант №1 из CLAUDE.md: двое жмут «Беру» одновременно — квест получает ровно один.
// Гоняется на настоящем Postgres: гонку на моках не поймать. За собой всё убирает.

const RUN = `test-race-${Date.now()}`;
let users: User[] = [];

before(async () => {
  users = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      // отрицательные id: у настоящих пользователей Telegram они положительные
      prisma.user.create({ data: { telegramId: BigInt(-(Date.now() * 10 + i)), firstName: `${RUN}-${i}` } }),
    ),
  );
});

after(async () => {
  await prisma.task.deleteMany({ where: { title: RUN } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});

const openTask = (data: { claimBy?: Date } = {}) =>
  prisma.task.create({ data: { title: RUN, status: "OPEN", authorId: users[0].id, ...data } });

test("одновременный захват: квест получает ровно один", async () => {
  const task = await openTask();
  const results = await Promise.all(users.map((u) => claimTask(u, task.id)));

  assert.equal(results.filter((r) => r.ok).length, 1);
  const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal(after.status, "CLAIMED");
  assert.equal(await prisma.taskEvent.count({ where: { taskId: task.id, type: "claimed" } }), 1);

  const losers = results.filter((r) => !r.ok);
  assert.ok(losers.every((r) => !r.ok && r.reason.startsWith("Уже разобрали")));
});

test("после «Взять до» квест не взять", async () => {
  const task = await openTask({ claimBy: new Date(Date.now() - 1_000) });
  assert.deepEqual(await claimTask(users[1], task.id), { ok: false, reason: "Время на взятие вышло ⌛" });
});

test("повторное нажатие своим — не ошибка, а подсказка", async () => {
  const task = await openTask();
  assert.deepEqual(await claimTask(users[2], task.id), { ok: true });
  assert.deepEqual(await claimTask(users[2], task.id), { ok: false, reason: "Этот квест уже твой" });
});
