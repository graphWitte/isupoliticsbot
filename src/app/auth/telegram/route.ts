import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { exchangeTelegramAuth } from "@/server/login";
import { startSession } from "@/server/session";

// Сюда Telegram возвращает человека после «Войти через Telegram» (data-auth-url виджета).
export async function GET(request: NextRequest) {
  const result = await exchangeTelegramAuth(Object.fromEntries(request.nextUrl.searchParams));
  if (!result.ok) redirect(`/login?tg=${result.reason}`);
  await startSession(result.token);
  redirect("/");
}
