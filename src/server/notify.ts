import { prisma } from "@/lib/prisma";
import { clip, esc } from "@/lib/html";
import { KIND } from "@/lib/labels";
import { api, cb, keyboard, trySend, type SendOptions } from "./telegram";
import { mention, staffUsers } from "./users";

/** Написать всем кураторам и руководству. Кто не запускал бота — пропускается. */
export async function notifyStaff(text: string, options?: SendOptions) {
  for (const user of await staffUsers()) {
    try {
      await trySend(user.telegramId, text, options);
    } catch (e) {
      console.error(`[notify] не написал ${user.telegramId}:`, e);
    }
  }
}

/** Разослать сдачу на проверку: текст целиком, медиа — копией исходного сообщения. */
export async function notifyReviewers(submissionId: string) {
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { task: true, author: true },
  });
  if (!sub) return;

  const hasMedia = sub.tgChatId !== null && sub.tgMessageId !== null;
  const lines = [
    `📤 <b>Сдали квест</b> · ⭐ ${sub.task.points}`,
    `${KIND[sub.task.kind].emoji} ${esc(sub.task.title)}`,
    `Исполнитель: ${mention(sub.author)}`,
  ];
  if (!hasMedia && sub.comment) lines.push("", esc(clip(sub.comment, 3000)));
  // ссылки, спрятанные под текстом ([результат](url)), в plain-тексте теряются
  const hidden = sub.links.filter((l) => !sub.comment?.includes(l));
  if (hidden.length) lines.push("", ...hidden.map((l) => `🔗 ${esc(l)}`));

  const buttons = keyboard([cb("✅ Принять", `accept:${sub.id}`), cb("🔁 Вернуть", `reject:${sub.id}`)]);

  for (const staff of await staffUsers()) {
    try {
      if (hasMedia) {
        const sent = await trySend(staff.telegramId, lines.join("\n"));
        if (sent) {
          await api.copyMessage(String(staff.telegramId), String(sub.tgChatId), sub.tgMessageId!, {
            reply_markup: buttons,
          });
        }
      } else {
        await trySend(staff.telegramId, lines.join("\n"), { reply_markup: buttons });
      }
    } catch (e) {
      console.error(`[notify] не отправил сдачу ${sub.id} проверяющему ${staff.telegramId}:`, e);
    }
  }
}
