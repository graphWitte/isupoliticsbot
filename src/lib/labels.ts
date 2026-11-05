// Только type-импорты из Prisma: файл используют и клиентские компоненты,
// а рантайм Prisma в браузерный бандл тащить нельзя.
import type { ReviewStatus, Role, Skill, TaskKind, TaskStatus } from "@prisma/client";

export const KINDS = ["EVENT", "CONTENT", "ORG"] as const satisfies readonly TaskKind[];
export const SKILLS = ["PHOTO", "VIDEO", "EDIT", "DESIGN", "COPY", "SMM"] as const satisfies readonly Skill[];
export const ROLES = ["MEMBER", "CURATOR", "ADMIN"] as const satisfies readonly Role[];

export const KIND: Record<TaskKind, { label: string; emoji: string; hint: string }> = {
  EVENT: { label: "Мероприятие", emoji: "🎬", hint: "Съёмка, эфир — привязано ко времени" },
  CONTENT: { label: "Контент", emoji: "✍️", hint: "Пост, мем, рубрика" },
  ORG: { label: "Орг", emoji: "🗂", hint: "Созвон, смета, согласование" },
};

export const SKILL: Record<Skill, { label: string; emoji: string }> = {
  PHOTO: { label: "Фото", emoji: "📷" },
  VIDEO: { label: "Видео", emoji: "🎥" },
  EDIT: { label: "Монтаж", emoji: "🎞" },
  DESIGN: { label: "Дизайн", emoji: "🎨" },
  COPY: { label: "Тексты", emoji: "✏️" },
  SMM: { label: "SMM", emoji: "📱" },
};

export const STATUS: Record<TaskStatus, { label: string; emoji: string; className: string }> = {
  DRAFT: { label: "Черновик", emoji: "📝", className: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30" },
  OPEN: { label: "Свободен", emoji: "🟢", className: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  CLAIMED: { label: "В работе", emoji: "✋", className: "bg-sky-500/15 text-sky-300 ring-sky-500/30" },
  SUBMITTED: { label: "На проверке", emoji: "📤", className: "bg-violet-500/15 text-violet-300 ring-violet-500/30" },
  REVISION: { label: "На доработке", emoji: "🔁", className: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  DONE: { label: "Готово", emoji: "✅", className: "bg-teal-500/15 text-teal-300 ring-teal-500/30" },
  CANCELLED: { label: "Отменён", emoji: "🚫", className: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20" },
  EXPIRED: { label: "Никто не взял", emoji: "⌛", className: "bg-rose-500/15 text-rose-300 ring-rose-500/30" },
};

export const REVIEW: Record<ReviewStatus, { label: string; className: string }> = {
  PENDING: { label: "Ждёт проверки", className: "bg-violet-500/15 text-violet-300 ring-violet-500/30" },
  ACCEPTED: { label: "Принято", className: "bg-teal-500/15 text-teal-300 ring-teal-500/30" },
  REJECTED: { label: "Возвращено", className: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
};

export const ROLE: Record<Role, string> = {
  MEMBER: "Участник",
  CURATOR: "Куратор",
  ADMIN: "Руководство",
};

export const EVENT_LABEL: Record<string, string> = {
  created: "создал(а) черновик",
  edited: "отредактировал(а)",
  published: "опубликовал(а) в чате отдела",
  claimed: "взял(а) квест",
  released: "отказался(ась) от квеста",
  unassigned: "снял(а) исполнителя",
  submitted: "сдал(а) работу",
  accepted: "принял(а) работу",
  rejected: "вернул(а) на доработку",
  cancelled: "отменил(а) квест",
  expired: "никто не взял вовремя",
  reopened: "переопубликовал(а)",
};
