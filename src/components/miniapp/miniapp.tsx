"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { Skill } from "@prisma/client";
import type { MiniAppResult, MiniAppState, Quest } from "@/server/miniapp";
import { claimQuest, loadState, releaseQuest, setMySkills, submitQuest } from "@/server/miniapp";
import { SKILL, SKILLS } from "@/lib/labels";
import { haptic, webApp } from "@/lib/telegram-webapp";
import { QuestRow, QuestRowSkeleton } from "./quest-row";
import { QuestSheet } from "./quest-sheet";

type Tab = "board" | "mine" | "me";

export function MiniApp({ appUrl }: { appUrl: string }) {
  const [state, setState] = useState<MiniAppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("board");
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const initData = useRef("");

  const apply = useCallback((result: MiniAppResult) => {
    if (result.state) setState(result.state);
    if (result.ok) {
      setError(null);
      if (result.toast) {
        haptic.success();
        setToast(result.toast);
      }
    } else {
      haptic.error();
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    const app = webApp();
    app?.ready();
    app?.expand();
    // Свайп вниз внутри списка не должен закрывать приложение
    app?.disableVerticalSwipes?.();
    initData.current = app?.initData ?? "";
    loadState(initData.current).then(apply);
  }, [apply]);

  // Экран открыт долго — данные устаревают. Обновляем, когда человек возвращается.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") loadState(initData.current).then(apply);
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [apply]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const act = useCallback(
    (action: "claim" | "submit" | "release", text?: string) => {
      const id = openId;
      if (!id) return;
      startTransition(async () => {
        const call =
          action === "claim"
            ? claimQuest(initData.current, id)
            : action === "release"
              ? releaseQuest(initData.current, id)
              : submitQuest(initData.current, id, text ?? "");
        const result = await call;
        apply(result);
        if (result.ok) {
          setOpenId(action === "claim" ? id : null);
          if (action === "claim") setTab("mine");
        }
      });
    },
    [openId, apply],
  );

  const saveSkills = useCallback(
    (skills: Skill[]) => {
      haptic.select();
      startTransition(async () => apply(await setMySkills(initData.current, skills)));
    },
    [apply],
  );

  if (error && !state) return <FatalError message={error} />;
  if (!state) return <Loading />;

  const open = state.open.find((q) => q.id === openId) ?? state.mine.find((q) => q.id === openId) ?? null;

  return (
    <div className="mx-auto max-w-lg">
      <main className="px-4 pb-28 pt-3">
        {tab === "board" && <BoardTab state={state} onOpen={setOpenId} />}
        {tab === "mine" && <MineTab state={state} onOpen={setOpenId} onGoBoard={() => setTab("board")} />}
        {tab === "me" && <MeTab state={state} appUrl={appUrl} busy={pending} onSkills={saveSkills} />}
      </main>

      <TabBar tab={tab} onChange={setTab} mine={state.mine.length} open={state.open.length} />

      {open && <QuestSheet quest={open} busy={pending} onClose={() => setOpenId(null)} onAction={act} />}

      {toast && <Toast text={toast} tone="ok" />}
      {error && state && <Toast text={error} tone="err" onDismiss={() => setError(null)} />}
    </div>
  );
}

// ============ ВКЛАДКИ ============

function BoardTab({ state, onOpen }: { state: MiniAppState; onOpen: (id: string) => void }) {
  const { open, me } = state;
  // Сначала то, что подходит по навыку: человек должен видеть «своё» сверху
  const mine = me.skills.length
    ? open.filter((q) => q.skills.some((s) => me.skills.includes(s)))
    : [];
  const rest = open.filter((q) => !mine.includes(q));

  if (!open.length) {
    return (
      <Empty
        emoji="😌"
        title="Свободных квестов нет"
        hint="Когда руководство поставит задачу, она появится здесь и в чате отдела."
      />
    );
  }

  return (
    <>
      <Header title="Свободные квесты" subtitle={`${open.length} ждут, кто возьмёт`} />
      {mine.length > 0 && (
        <>
          <SectionLabel>Подходят тебе</SectionLabel>
          <div className="flex flex-col gap-2">
            {mine.map((q) => (
              <QuestRow key={q.id} quest={q} onOpen={() => onOpen(q.id)} />
            ))}
          </div>
          {rest.length > 0 && <SectionLabel>Остальные</SectionLabel>}
        </>
      )}
      <div className="flex flex-col gap-2">
        {rest.map((q) => (
          <QuestRow key={q.id} quest={q} onOpen={() => onOpen(q.id)} />
        ))}
      </div>
    </>
  );
}

function MineTab({
  state,
  onOpen,
  onGoBoard,
}: {
  state: MiniAppState;
  onOpen: (id: string) => void;
  onGoBoard: () => void;
}) {
  if (!state.mine.length) {
    return (
      <Empty emoji="📋" title="У тебя нет квестов в работе" hint="Загляни на доску — там есть свободные.">
        <button
          onClick={onGoBoard}
          className="mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold"
          style={{ background: "var(--button)", color: "var(--button-text)" }}
        >
          На доску
        </button>
      </Empty>
    );
  }

  const revision = state.mine.filter((q) => q.status === "REVISION");
  const rest = state.mine.filter((q) => q.status !== "REVISION");

  return (
    <>
      <Header title="Мои квесты" subtitle={`${state.mine.length} в работе`} />
      {revision.length > 0 && (
        <>
          <SectionLabel>Вернули на доработку</SectionLabel>
          <div className="flex flex-col gap-2">
            {revision.map((q) => (
              <QuestRow key={q.id} quest={q} onOpen={() => onOpen(q.id)} showStatus />
            ))}
          </div>
          {rest.length > 0 && <SectionLabel>Остальные</SectionLabel>}
        </>
      )}
      <div className="flex flex-col gap-2">
        {rest.map((q) => (
          <QuestRow key={q.id} quest={q} onOpen={() => onOpen(q.id)} showStatus />
        ))}
      </div>
    </>
  );
}

function MeTab({
  state,
  appUrl,
  busy,
  onSkills,
}: {
  state: MiniAppState;
  appUrl: string;
  busy: boolean;
  onSkills: (skills: Skill[]) => void;
}) {
  const { me } = state;
  return (
    <>
      <Header title={me.firstName} subtitle={me.isStaff ? "Куратор" : "Участник отдела"} />

      <div className="grid grid-cols-3 gap-2">
        <Stat value={me.points} label="очков" />
        <Stat value={`#${me.rank}`} label="в отделе" />
        <Stat value={me.doneCount} label="сдано" />
      </div>

      <SectionLabel>Что я умею</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {SKILLS.map((s) => {
          const on = me.skills.includes(s);
          return (
            <button
              key={s}
              disabled={busy}
              onClick={() => onSkills(on ? me.skills.filter((x) => x !== s) : [...me.skills, s])}
              aria-pressed={on}
              className="rounded-full px-3 py-2 text-sm transition disabled:opacity-50"
              style={
                on
                  ? { background: "var(--button)", color: "var(--button-text)" }
                  : { background: "var(--section)", color: "var(--subtitle)" }
              }
            >
              {SKILL[s].emoji} {SKILL[s].label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--hint)" }}>
        {me.skills.length
          ? "Квесты под эти навыки показываются на доске первыми. Отметь всё, что умеешь."
          : "Отметь, что умеешь — подходящие квесты будут подниматься в начало доски."}
      </p>

      {me.isStaff && (
        <>
          <SectionLabel>Кураторское</SectionLabel>
          <div className="rounded-xl p-3.5" style={{ background: "var(--section)" }}>
            {state.pendingReview > 0 ? (
              <p className="text-sm">
                📤 Ждут проверки: <b>{state.pendingReview}</b>
              </p>
            ) : (
              <p className="text-sm" style={{ color: "var(--subtitle)" }}>
                Всё проверено
              </p>
            )}
            <p className="mt-2 text-xs" style={{ color: "var(--hint)" }}>
              Создание квестов, приёмка и аналитика — в админке: {appUrl}
            </p>
          </div>
        </>
      )}
    </>
  );
}

// ============ МЕЛОЧИ ============

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-4">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm" style={{ color: "var(--subtitle)" }}>
        {subtitle}
      </p>
    </header>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--hint)" }}>
      {children}
    </h2>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: "var(--section)" }}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs" style={{ color: "var(--subtitle)" }}>
        {label}
      </div>
    </div>
  );
}

function Empty({
  emoji,
  title,
  hint,
  children,
}: {
  emoji: string;
  title: string;
  hint: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="text-5xl">{emoji}</div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm" style={{ color: "var(--subtitle)" }}>
        {hint}
      </p>
      {children}
    </div>
  );
}

function Loading() {
  return (
    <div className="mx-auto max-w-lg px-4 pt-3">
      <div className="tg-skeleton mb-1 h-8 w-40 rounded-lg" />
      <div className="tg-skeleton mb-4 h-4 w-28 rounded" />
      <div className="flex flex-col gap-2">
        <QuestRowSkeleton />
        <QuestRowSkeleton />
        <QuestRowSkeleton />
      </div>
    </div>
  );
}

function FatalError({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-20 text-center">
      <div className="text-5xl">🔒</div>
      <h2 className="mt-4 text-lg font-semibold">Не получилось войти</h2>
      <p className="mt-2 text-sm" style={{ color: "var(--subtitle)" }}>
        {message}
      </p>
      <button
        onClick={() => location.reload()}
        className="mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold"
        style={{ background: "var(--button)", color: "var(--button-text)" }}
      >
        Попробовать снова
      </button>
    </div>
  );
}

function Toast({ text, tone, onDismiss }: { text: string; tone: "ok" | "err"; onDismiss?: () => void }) {
  return (
    <div
      role="status"
      onClick={onDismiss}
      className="fixed inset-x-4 z-[60] mx-auto max-w-sm rounded-xl px-4 py-3 text-center text-sm font-medium shadow-lg"
      style={{
        bottom: "calc(5.5rem + var(--tg-safe-area-inset-bottom, 0px))",
        background: tone === "ok" ? "var(--button)" : "var(--destructive)",
        color: "#fff",
      }}
    >
      {text}
    </div>
  );
}

function TabBar({
  tab,
  onChange,
  mine,
  open,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  mine: number;
  open: number;
}) {
  const tabs: { key: Tab; icon: string; label: string; badge?: number }[] = [
    { key: "board", icon: "🗂", label: "Доска", badge: open },
    { key: "mine", icon: "📋", label: "Мои", badge: mine },
    { key: "me", icon: "⭐", label: "Я" },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-lg justify-around border-t backdrop-blur"
      style={{
        background: "color-mix(in srgb, var(--bg) 92%, transparent)",
        borderColor: "var(--separator)",
        paddingBottom: "calc(0.5rem + var(--tg-safe-area-inset-bottom, 0px))",
      }}
    >
      {tabs.map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            onClick={() => {
              if (!active) haptic.select();
              onChange(t.key);
            }}
            aria-current={active ? "page" : undefined}
            className="flex flex-1 flex-col items-center gap-0.5 pb-1 pt-2"
            style={{ color: active ? "var(--link)" : "var(--hint)" }}
          >
            <span className="relative text-xl leading-none">
              {t.icon}
              {t.badge ? (
                <span
                  className="absolute -right-2.5 -top-1 min-w-[16px] rounded-full px-1 text-[10px] font-bold leading-4"
                  style={{ background: "var(--button)", color: "var(--button-text)" }}
                >
                  {t.badge > 99 ? "99+" : t.badge}
                </span>
              ) : null}
            </span>
            <span className="text-[11px] font-medium">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
