import Link from "next/link";
import { ROLE } from "@/lib/labels";
import { btn } from "@/components/ui";
import { peekLoginCode } from "@/server/login";
import { fullName } from "@/server/users";
import { loginAction } from "../actions";

export const metadata = { title: "Вход" };

// Страница НЕ тратит код при открытии — только кнопка. Иначе ссылку «съест»
// превью в Telegram или антивирусный сканер ссылок раньше, чем её откроет человек.
export default async function AuthPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await peekLoginCode(code);

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6">
        <div className="text-3xl">{user ? "🔐" : "⌛"}</div>
        {user ? (
          <>
            <h1 className="mt-3 text-xl font-semibold">Войти в админку?</h1>
            <p className="mt-2 text-sm text-muted">
              Ты входишь как <span className="font-medium text-fg">{fullName(user)}</span> · {ROLE[user.role]}
            </p>
            <form action={loginAction} className="mt-6">
              <input type="hidden" name="code" value={code} />
              <button className={`${btn.primary} w-full`}>Войти</button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-xl font-semibold">Ссылка не работает</h1>
            <p className="mt-2 text-sm text-muted">
              Она живёт 10 минут и срабатывает один раз. Попроси у бота новую командой <code>/admin</code>.
            </p>
            <Link href="/login" className={`${btn.secondary} mt-6 w-full`}>
              Как войти
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
