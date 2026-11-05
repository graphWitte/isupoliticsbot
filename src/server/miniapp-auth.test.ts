import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { verifyInitData } from "./miniapp-auth";

// Подписываем независимо, по тексту документации Telegram, а не через проверяемую
// функцию — иначе тест согласится с любой ошибкой в алгоритме.
const BOT_TOKEN = "123456:TEST-token";
const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);

function sign(fields: Record<string, string>, token = BOT_TOKEN) {
  const dcs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const USER = JSON.stringify({ id: 964746097, first_name: "Никитк", username: "graph_witte" });
const base = () => ({ auth_date: String(NOW / 1000 - 60), query_id: "AAE", user: USER });

test("правильная подпись проходит", () => {
  const result = verifyInitData(sign(base()), BOT_TOKEN, NOW);
  assert.ok(result.ok);
  assert.equal(result.telegram.id, 964746097);
  assert.equal(result.telegram.username, "graph_witte");
});

test("поле signature входит в строку проверки", () => {
  // Отличие от сторонней Ed25519-проверки, где signature исключают.
  // Если исключить его и здесь, Telegram-клиенты новых версий перестанут пускать.
  const withSignature = { ...base(), signature: "abc123" };
  assert.ok(verifyInitData(sign(withSignature), BOT_TOKEN, NOW).ok);

  // подпись, посчитанная без signature, не должна приниматься
  const signedWithout = new URLSearchParams(sign(base()));
  signedWithout.set("signature", "abc123");
  assert.deepEqual(verifyInitData(signedWithout.toString(), BOT_TOKEN, NOW), { ok: false, reason: "invalid" });
});

test("схема Mini App отличается от схемы кнопки входа", () => {
  // ключ Login Widget — SHA256(токен); такой подписью Mini App пускать нельзя
  const dcs = Object.keys(base())
    .sort()
    .map((k) => `${k}=${base()[k as keyof ReturnType<typeof base>]}`)
    .join("\n");
  const widgetSecret = createHmac("sha256", "").update(BOT_TOKEN).digest();
  const widgetHash = createHmac("sha256", widgetSecret).update(dcs).digest("hex");
  const forged = new URLSearchParams({ ...base(), hash: widgetHash }).toString();
  assert.deepEqual(verifyInitData(forged, BOT_TOKEN, NOW), { ok: false, reason: "invalid" });
});

test("подменённое поле ломает подпись", () => {
  const params = new URLSearchParams(sign(base()));
  params.set("user", JSON.stringify({ id: 1, first_name: "Чужак" }));
  assert.deepEqual(verifyInitData(params.toString(), BOT_TOKEN, NOW), { ok: false, reason: "invalid" });
});

test("дописанное поле ломает подпись", () => {
  const params = new URLSearchParams(sign(base()));
  params.set("role", "ADMIN");
  assert.deepEqual(verifyInitData(params.toString(), BOT_TOKEN, NOW), { ok: false, reason: "invalid" });
});

test("подпись токеном другого бота не проходит", () => {
  assert.deepEqual(verifyInitData(sign(base(), "999:OTHER"), BOT_TOKEN, NOW), { ok: false, reason: "invalid" });
});

test("данные старше часа устарели", () => {
  const old = sign({ ...base(), auth_date: String(NOW / 1000 - 60 * 60 - 1) });
  assert.deepEqual(verifyInitData(old, BOT_TOKEN, NOW), { ok: false, reason: "expired" });
});

test("без hash не проходит", () => {
  assert.deepEqual(verifyInitData(new URLSearchParams(base()).toString(), BOT_TOKEN, NOW), {
    ok: false,
    reason: "invalid",
  });
});

test("мусор вместо hash не роняет проверку", () => {
  const params = new URLSearchParams(sign(base()));
  params.set("hash", "не-хекс");
  assert.deepEqual(verifyInitData(params.toString(), BOT_TOKEN, NOW), { ok: false, reason: "invalid" });
});

test("пустой initData не проходит", () => {
  assert.deepEqual(verifyInitData("", BOT_TOKEN, NOW), { ok: false, reason: "invalid" });
});

test("подпись без user отвергается", () => {
  const noUser = sign({ auth_date: String(NOW / 1000 - 60), query_id: "AAE" });
  assert.deepEqual(verifyInitData(noUser, BOT_TOKEN, NOW), { ok: false, reason: "no_user" });
});
