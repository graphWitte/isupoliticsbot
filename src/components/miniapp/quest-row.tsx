"use client";

import type { Quest } from "@/server/miniapp";
import { KIND, SKILL, STATUS } from "@/lib/labels";
import { formatRelative } from "@/lib/relative";

const DAY_MS = 24 * 60 * 60_000;

export function QuestRow({ quest, onOpen, showStatus }: { quest: Quest; onOpen: () => void; showStatus?: boolean }) {
  const deadline = quest.status === "OPEN" ? quest.claimBy : quest.dueAt;
  const left = deadline ? new Date(deadline).getTime() - Date.now() : null;
  const urgent = left !== null && left < DAY_MS;
  const overdue = left !== null && left < 0;

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-start gap-3 rounded-xl p-3 text-left"
      style={{ background: "var(--section)" }}
    >
      <span className="mt-0.5 text-lg leading-none" aria-hidden>
        {KIND[quest.kind].emoji}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-snug">{quest.title}</span>

        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: "var(--subtitle)" }}>
          <span className="font-semibold">⭐ {quest.points}</span>
          {quest.skill && (
            <span>
              {SKILL[quest.skill].emoji} {SKILL[quest.skill].label}
            </span>
          )}
          {showStatus && quest.status !== "OPEN" && (
            <span>
              {STATUS[quest.status].emoji} {STATUS[quest.status].label}
            </span>
          )}
          {deadline && (
            <span style={overdue ? { color: "var(--destructive)" } : urgent ? { color: "#e8a33d" } : undefined}>
              {overdue ? "🔥" : "⏱"} {quest.status === "OPEN" ? "взять" : "сдать"} {formatRelative(deadline)}
            </span>
          )}
        </span>
      </span>

      <span className="mt-1 shrink-0 text-xs opacity-30" aria-hidden>
        ›
      </span>
    </button>
  );
}

export function QuestRowSkeleton() {
  return <div className="tg-skeleton h-[72px] rounded-xl" />;
}
