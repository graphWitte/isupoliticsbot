import type { Submission, User } from "@prisma/client";
import { acceptAction, rejectAction } from "@/app/(staff)/actions";
import { cx } from "@/lib/cx";
import { REVIEW } from "@/lib/labels";
import { formatDate, formatRelative } from "@/lib/time";
import { fullName } from "@/server/users";
import { ActionForm } from "./action-form";
import { Avatar, btn, input } from "./ui";

// Ссылки присылают люди: в href пускаем только http(s), остальное — текстом.
const isWebUrl = (s: string) => /^https?:\/\//i.test(s);

export function SubmissionView({
  submission: sub,
  now,
}: {
  submission: Submission & { author: User; reviewer: User | null };
  now: Date;
}) {
  return (
    <article className="rounded-lg border border-border bg-bg/40 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Avatar name={sub.author.firstName} />
        <span className="font-medium">{fullName(sub.author)}</span>
        <time className="text-xs text-faint" title={formatDate(sub.createdAt)}>
          {formatRelative(sub.createdAt, now)}
        </time>
        <span
          className={cx("ml-auto rounded-full px-2 py-0.5 text-xs ring-1 ring-inset", REVIEW[sub.status].className)}
        >
          {REVIEW[sub.status].label}
        </span>
      </div>

      {sub.links.length > 0 && (
        <ul className="mt-3 space-y-1">
          {sub.links.map((link) => (
            <li key={link} className="break-all text-sm">
              {isWebUrl(link) ? (
                <a href={link} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  🔗 {link}
                </a>
              ) : (
                <span className="text-muted">🔗 {link}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {sub.comment && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">{sub.comment}</p>}
      {sub.tgMessageId !== null && (
        <p className="mt-2 text-xs text-faint">📎 Сдали файлом в бота — он пришёл проверяющим в личку с ботом</p>
      )}
      {sub.reviewNote && (
        <p className="mt-2 text-sm">
          💬 {sub.reviewer ? fullName(sub.reviewer) : "Проверяющий"}:{" "}
          <span className="text-muted">{sub.reviewNote}</span>
        </p>
      )}

      {sub.status === "PENDING" && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          <ActionForm action={acceptAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="submissionId" value={sub.id} />
            <button className={btn.primary}>✅ Принять</button>
          </ActionForm>
          <ActionForm action={rejectAction} className="flex flex-col gap-2">
            <input type="hidden" name="submissionId" value={sub.id} />
            <textarea
              name="note"
              required
              rows={2}
              placeholder="Что поправить — уйдёт исполнителю в бота"
              className={input}
            />
            <button className={cx(btn.secondary, "self-start")}>🔁 Вернуть на доработку</button>
          </ActionForm>
        </div>
      )}
    </article>
  );
}
