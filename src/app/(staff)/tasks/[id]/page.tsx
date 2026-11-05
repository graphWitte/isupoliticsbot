import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EVENT_LABEL, KIND, SKILL } from "@/lib/labels";
import { formatDate, formatRelative, toLocalInput } from "@/lib/time";
import { ActionForm } from "@/components/action-form";
import { SubmissionView } from "@/components/submission-view";
import { TaskForm } from "@/components/task-form";
import { Avatar, btn, Card, Chip, input, Notice, StatusPill } from "@/components/ui";
import { extendByDay } from "@/server/tasks";
import { fullName } from "@/server/users";
import {
  cancelTaskAction,
  deleteDraftAction,
  publishTaskAction,
  reopenTaskAction,
  unassignAction,
  updateTaskAction,
} from "../../actions";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, select: { title: true } });
  return { title: task?.title ?? "Квест" };
}

/** Прямая ссылка на сообщение есть только у супергрупп: -100XXXXXXXXXX -> t.me/c/XXXXXXXXXX/<id> */
function telegramMessageUrl(chatId: bigint | null, messageId: number | null) {
  if (!chatId || !messageId) return null;
  const id = String(chatId);
  return id.startsWith("-100") ? `https://t.me/c/${id.slice(4)}/${messageId}` : null;
}

export default async function TaskPage({ params, searchParams }: Props) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: true,
      author: true,
      submissions: { include: { author: true, reviewer: true }, orderBy: { createdAt: "desc" } },
      log: { include: { actor: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!task) notFound();

  const now = new Date();
  const closed = task.status === "DONE" || task.status === "CANCELLED";
  const messageUrl = telegramMessageUrl(task.chatId, task.messageId);
  const hiddenId = <input type="hidden" name="id" value={task.id} />;

  const cancelForm = (
    <ActionForm
      action={cancelTaskAction}
      confirm="Отменить квест? Карточка в чате пометится отменённой, исполнитель получит уведомление."
      className="flex flex-col gap-2"
    >
      {hiddenId}
      <button className={`${btn.danger} w-full`}>Отменить квест</button>
    </ActionForm>
  );

  const reopenDefaults = extendByDay(task, now);
  const reopenForm = (
    <ActionForm action={reopenTaskAction} className="flex flex-col gap-3">
      {hiddenId}
      <label className="text-xs text-muted">
        ⏳ Взять до
        <input
          type="datetime-local"
          name="claimBy"
          defaultValue={toLocalInput(reopenDefaults.claimBy)}
          className={`${input} mt-1`}
        />
      </label>
      <label className="text-xs text-muted">
        📅 Сдать до
        <input
          type="datetime-local"
          name="dueAt"
          defaultValue={toLocalInput(reopenDefaults.dueAt)}
          className={`${input} mt-1`}
        />
      </label>
      <button className={`${btn.primary} w-full`}>🔁 Переопубликовать</button>
    </ActionForm>
  );

  return (
    <>
      <Link href="/" className="text-sm text-muted hover:text-fg">
        ← Доска
      </Link>

      <header className="mb-6 mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={task.status} />
          <Chip>
            {KIND[task.kind].emoji} {KIND[task.kind].label}
          </Chip>
          {task.skills.map((s) => (
            <Chip key={s}>
              {SKILL[s].emoji} {SKILL[s].label}
            </Chip>
          ))}
          <Chip>⭐ {task.points}</Chip>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{task.title}</h1>
        <p className="mt-1 text-sm text-muted">
          Создал(а) {fullName(task.author)} · {formatRelative(task.createdAt, now)}
        </p>
      </header>

      {error && (
        <div className="mb-6">
          <Notice tone="error">Квест сохранён черновиком, но в чат не улетел: {error}</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Бриф">
            {task.brief ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{task.brief}</p>
            ) : (
              <p className="text-sm text-faint">Без брифа</p>
            )}
            <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">⏳ Взять до</dt>
                <dd className="mt-0.5">{task.claimBy ? formatDate(task.claimBy) : "без срока"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">📅 Сдать до</dt>
                <dd className="mt-0.5">{task.dueAt ? formatDate(task.dueAt) : "без срока"}</dd>
              </div>
            </dl>
          </Card>

          <Card title={`Сдачи · ${task.submissions.length}`}>
            {task.submissions.length ? (
              <div className="flex flex-col gap-3">
                {task.submissions.map((sub) => (
                  <SubmissionView key={sub.id} submission={sub} now={now} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-faint">Пока никто ничего не сдавал</p>
            )}
          </Card>

          {!closed && (
            <details className="rounded-xl border border-border bg-surface">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold marker:text-faint">
                ✏️ Редактировать
              </summary>
              <div className="border-t border-border p-4">
                <TaskForm
                  mode="edit"
                  action={updateTaskAction}
                  values={{
                    id: task.id,
                    title: task.title,
                    brief: task.brief,
                    kind: task.kind,
                    skills: task.skills,
                    points: task.points,
                    claimBy: toLocalInput(task.claimBy),
                    dueAt: toLocalInput(task.dueAt),
                  }}
                />
              </div>
            </details>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <Card title="Действия">
            <div className="flex flex-col gap-3">
              {task.status === "DRAFT" && (
                <>
                  <ActionForm action={publishTaskAction} className="flex flex-col gap-2">
                    {hiddenId}
                    <button className={`${btn.primary} w-full`}>🚀 Опубликовать в чат</button>
                  </ActionForm>
                  <ActionForm action={deleteDraftAction} confirm="Удалить черновик насовсем?" className="flex flex-col gap-2">
                    {hiddenId}
                    <button className={`${btn.ghost} w-full`}>Удалить черновик</button>
                  </ActionForm>
                </>
              )}

              {task.status === "OPEN" && (
                <>
                  <p className="text-sm text-muted">Висит в чате отдела и ждёт, кто возьмёт.</p>
                  {cancelForm}
                </>
              )}

              {(task.status === "CLAIMED" || task.status === "REVISION") && (
                <>
                  <ActionForm
                    action={unassignAction}
                    confirm="Снять исполнителя? Он получит уведомление, а квест вернётся на доску."
                    className="flex flex-col gap-2"
                  >
                    {hiddenId}
                    <button className={`${btn.secondary} w-full`}>Снять исполнителя</button>
                  </ActionForm>
                  {cancelForm}
                </>
              )}

              {task.status === "SUBMITTED" && (
                <>
                  <p className="text-sm text-muted">Сдача ждёт проверки — реши в блоке «Сдачи».</p>
                  {cancelForm}
                </>
              )}

              {task.status === "EXPIRED" && (
                <>
                  <p className="text-sm text-rose-200">Никто не взял вовремя. Работа всё ещё нужна?</p>
                  {reopenForm}
                  {cancelForm}
                </>
              )}

              {task.status === "CANCELLED" && (
                <>
                  <p className="text-sm text-muted">Квест отменён. Можно вернуть его свежей карточкой.</p>
                  {reopenForm}
                </>
              )}

              {task.status === "DONE" && (
                <p className="text-sm text-muted">
                  Закрыт{task.doneAt && ` ${formatRelative(task.doneAt, now)}`}. Исполнитель получил +{task.points} ⭐
                </p>
              )}

              {messageUrl && (
                <a href={messageUrl} target="_blank" rel="noreferrer" className={`${btn.ghost} w-full`}>
                  Карточка в Telegram ↗
                </a>
              )}
            </div>
          </Card>

          <Card title="Исполнитель">
            {task.assignee ? (
              <div className="flex items-center gap-3">
                <Avatar name={task.assignee.firstName} className="size-9 text-sm" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{fullName(task.assignee)}</div>
                  <div className="text-xs text-muted">
                    {task.assignee.username && (
                      <a href={`https://t.me/${task.assignee.username}`} target="_blank" rel="noreferrer" className="hover:text-fg">
                        @{task.assignee.username} ·{" "}
                      </a>
                    )}
                    {task.claimedAt && `взял(а) ${formatRelative(task.claimedAt, now)}`}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-faint">Пока никто</p>
            )}
          </Card>

          <Card title="История">
            <ol className="flex flex-col gap-3">
              {task.log.map((event) => {
                const note = (event.meta as { note?: string } | null)?.note;
                return (
                  <li key={event.id} className="relative border-l border-border pl-4">
                    <span className="absolute -left-[4.5px] top-1.5 size-2 rounded-full bg-border-strong" />
                    <p className="text-sm">
                      <span className="font-medium">{event.actor ? fullName(event.actor) : "⚙️ Система"}</span>{" "}
                      <span className="text-muted">{EVENT_LABEL[event.type] ?? event.type}</span>
                    </p>
                    {note && <p className="mt-0.5 text-xs text-muted">«{note}»</p>}
                    <time className="text-xs text-faint" title={formatDate(event.createdAt)}>
                      {formatRelative(event.createdAt, now)}
                    </time>
                  </li>
                );
              })}
            </ol>
          </Card>
        </aside>
      </div>
    </>
  );
}
