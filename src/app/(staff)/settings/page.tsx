import { appUrlIsPublic, env } from "@/lib/env";
import { tzName } from "@/lib/time";
import { btn, Card, Notice, PageHeader } from "@/components/ui";
import { getDepartmentChat } from "@/server/settings";
import { botUsername } from "@/server/telegram";
import { logoutAction } from "../actions";

export const metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const [chat, username] = await Promise.all([getDepartmentChat(), botUsername().catch(() => null)]);
  const isTestChat = chat !== null && !chat.chatId.startsWith("-");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="Настройки" />

      <Card title="Чат отдела">
        {chat ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Куда падают квесты</dt>
              <dd className="mt-0.5 font-medium">{chat.title}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">ID чата{chat.threadId !== null && " · тема"}</dt>
              <dd className="mt-0.5 font-mono text-xs">
                {chat.chatId}
                {chat.threadId !== null && ` · ${chat.threadId}`}
              </dd>
            </div>
          </dl>
        ) : (
          <Notice tone="warning">Не привязан — опубликовать квест пока нельзя.</Notice>
        )}

        {isTestChat && (
          <div className="mt-4">
            <Notice tone="info">Сейчас привязана личка с ботом — это режим теста. Для работы привяжи чат отдела.</Notice>
          </div>
        )}

        <ol className="mt-5 list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>
            Добавь {username ? <span className="text-fg">@{username}</span> : "бота"} в чат отдела
          </li>
          <li>Если в чате есть темы — зайди в ту, куда должны падать квесты</li>
          <li>
            Отправь там <code className="rounded bg-surface-2 px-1 text-fg">/bind</code> — это может куратор или
            руководство
          </li>
        </ol>
      </Card>

      <Card title="Бот">
        {username ? (
          <a href={`https://t.me/${username}`} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">
            @{username} ↗
          </a>
        ) : (
          <Notice tone="error">Telegram не отвечает — проверь BOT_TOKEN в .env</Notice>
        )}
      </Card>

      <Card title="Админка">
        <p className="font-mono text-sm">{env.APP_URL}</p>
        {!appUrlIsPublic && (
          <p className="mt-2 text-sm text-muted">
            Адрес не публичный https, поэтому Telegram не даёт боту ставить на него кнопки: ссылка для входа приходит
            текстом, а кнопки «В админке» под карточками появятся после деплоя.
          </p>
        )}
      </Card>

      <Card title="Часовой пояс">
        <p className="text-sm">{tzName}</p>
        <p className="mt-1 text-sm text-muted">
          В нём вводятся и показываются все дедлайны. Меняется в <code>.env</code> → <code>APP_TZ</code>.
        </p>
      </Card>

      <form action={logoutAction} className="lg:hidden">
        <button className={btn.secondary}>Выйти</button>
      </form>
    </div>
  );
}
