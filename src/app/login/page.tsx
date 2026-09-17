import { redirect } from "next/navigation";
import { appUrlIsPublic, env } from "@/lib/env";
import { TelegramLoginButton } from "@/components/telegram-login-button";
import { btn, Notice } from "@/components/ui";
import { getCurrentUser } from "@/server/session";
import { botUsername } from "@/server/telegram";
import { isStaff } from "@/server/users";

export const metadata = { title: "Вход" };

const DENIED = "Админка — для кураторов и руководства. Если это ошибка, попроси руководство выдать тебе роль.";

const TELEGRAM_ERRORS: Record<string, string> = {
  invalid: "Telegram не подтвердил вход. Попробуй ещё раз.",
  expired: "Вход устарел — нажми кнопку ещё раз.",
  used: "Вход устарел — нажми кнопку ещё раз.",
  denied: DENIED,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; expired?: string; tg?: string }>;
}) {
  const { denied, expired, tg } = await searchParams;
  const user = await getCurrentUser();
  if (user && isStaff(user)) redirect("/");
  const username = await botUsername().catch(() => null);

  const errors = [
    denied && DENIED,
    expired && "Ссылка устарела или уже сработала — запроси новую.",
    tg && TELEGRAM_ERRORS[tg],
  ].filter((e): e is string => Boolean(e));

  // Виджет Telegram работает только на домене, привязанном к боту у @BotFather.
  // На localhost его не привязать — там остаётся вход ссылкой из бота.
  const widget = appUrlIsPublic && username;

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6">
        <div className="text-3xl">🎯</div>
        <h1 className="mt-3 text-xl font-semibold">Квест-борд медиа-отдела</h1>
        <p className="mt-1 text-sm text-muted">Вход через Telegram — без паролей.</p>

        {errors.length > 0 && (
          <div className="mt-5 space-y-3">
            {[...new Set(errors)].map((error) => (
              <Notice key={error} tone="warning">
                {error}
              </Notice>
            ))}
          </div>
        )}

        {widget ? (
          <>
            <div className="mt-6">
              <TelegramLoginButton bot={username} authUrl={`${env.APP_URL}/auth/telegram`} />
            </div>
            <p className="mt-6 border-t border-border pt-4 text-xs text-muted">
              Кнопка не появилась? Напиши{" "}
              <a href={`https://t.me/${username}?start=admin`} className="text-accent hover:underline">
                @{username}
              </a>{" "}
              команду <code>/admin</code> — пришлю ссылку для входа.
            </p>
          </>
        ) : (
          <>
            <div className="mt-5">
              <Notice tone="info">
                Кнопка «Войти через Telegram» появится, когда админка переедет на публичный домен. Пока — через бота:
              </Notice>
            </div>
            <ol className="mt-5 space-y-2 text-sm">
              <li className="flex gap-3">
                <span className="text-faint">1</span>
                Открой бота{username && <span className="text-muted">@{username}</span>}
              </li>
              <li className="flex gap-3">
                <span className="text-faint">2</span>
                <span>
                  Отправь <code className="rounded bg-surface-2 px-1">/admin</code>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-faint">3</span>
                Открой ссылку из ответа
              </li>
            </ol>
            {username && (
              <a href={`https://t.me/${username}?start=admin`} className={`${btn.primary} mt-6 w-full`}>
                Открыть бота
              </a>
            )}
          </>
        )}
      </div>
    </main>
  );
}
