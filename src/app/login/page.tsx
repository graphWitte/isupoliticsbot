import { redirect } from "next/navigation";
import { btn, Notice } from "@/components/ui";
import { getCurrentUser } from "@/server/session";
import { botUsername } from "@/server/telegram";
import { isStaff } from "@/server/users";

export const metadata = { title: "Вход" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; expired?: string }>;
}) {
  const { denied, expired } = await searchParams;
  const user = await getCurrentUser();
  if (user && isStaff(user)) redirect("/");
  const username = await botUsername().catch(() => null);

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6">
        <div className="text-3xl">🎯</div>
        <h1 className="mt-3 text-xl font-semibold">Квест-борд медиа-отдела</h1>
        <p className="mt-1 text-sm text-muted">Вход через Telegram-бота — без паролей.</p>

        <div className="mt-5 space-y-3">
          {denied && (
            <Notice tone="warning">
              Админка — для кураторов и руководства. Если это ошибка, попроси руководство выдать тебе роль.
            </Notice>
          )}
          {expired && <Notice tone="warning">Ссылка устарела или уже сработала — запроси новую.</Notice>}
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
      </div>
    </main>
  );
}
