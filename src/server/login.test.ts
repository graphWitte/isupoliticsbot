import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { test } from "node:test";
import { verifyTelegramAuth } from "./login";

// Подписываем независимо, по тексту документации Telegram, а не через проверяемую
// функцию — иначе тест согласится с любой ошибкой в алгоритме.
const BOT_TOKEN = "123456:TEST-token";

function sign(fields: Record<string, string>, token = BOT_TOKEN) {
  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHash("sha256").update(token).digest();
  return { ...fields, hash: createHmac("sha256", secret).update(dataCheckString).digest("hex") };
}

const NOW = Date.UTC(2026, 8, 18, 12, 0, 0);
const fresh = { id: "964746097", first_name: "Тест", username: "tester", auth_date: String(NOW / 1000 - 60) };

test("правильная подпись проходит", () => {
  const result = verifyTelegramAuth(sign(fresh), BOT_TOKEN, NOW);
  assert.ok(result.ok);
  assert.equal(result.user.id, 964746097);
  assert.equal(result.user.username, "tester");
});

test("подменённое поле ломает подпись", () => {
  assert.deepEqual(verifyTelegramAuth({ ...sign(fresh), id: "1" }, BOT_TOKEN, NOW), { ok: false, reason: "invalid" });
});

test("дописанный параметр ломает подпись", () => {
  assert.deepEqual(verifyTelegramAuth({ ...sign(fresh), role: "ADMIN" }, BOT_TOKEN, NOW), {
    ok: false,
    reason: "invalid",
  });
});

test("подпись токеном другого бота не проходит", () => {
  assert.deepEqual(verifyTelegramAuth(sign(fresh, "999:OTHER"), BOT_TOKEN, NOW), { ok: false, reason: "invalid" });
});

test("мусор вместо hash не роняет проверку", () => {
  assert.deepEqual(verifyTelegramAuth({ ...fresh, hash: "zz" }, BOT_TOKEN, NOW), { ok: false, reason: "invalid" });
});

test("вход старше суток устарел", () => {
  const old = sign({ ...fresh, auth_date: String(NOW / 1000 - 24 * 60 * 60 - 1) });
  assert.deepEqual(verifyTelegramAuth(old, BOT_TOKEN, NOW), { ok: false, reason: "expired" });
});
