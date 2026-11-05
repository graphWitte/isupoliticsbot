"use client";

import { useEffect, useRef, useState } from "react";
import type { Quest } from "@/server/miniapp";
import { KIND, SKILL, STATUS } from "@/lib/labels";
import { formatRelative } from "@/lib/relative";
import { confirmNative, haptic, webApp } from "@/lib/telegram-webapp";

type Action = "claim" | "submit" | "release";

/**
 * Карточка квеста на весь экран. Главное действие висит на родной нижней кнопке
 * Telegram, закрытие — на родной кнопке «Назад»: так экран ощущается частью
 * мессенджера, а не веб-страницей внутри него.
 */
export function QuestSheet({
  quest,
  onClose,
  onAction,
  busy,
}: {
  quest: Quest;
  onClose: () => void;
  onAction: (action: Action, text?: string) => void;
  busy: boolean;
}) {
  const [submitting, setSubmitting] = useState(quest.status === "REVISION");
  const [text, setText] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = quest.status === "CLAIMED" || quest.status === "REVISION";

  // Родная кнопка «Назад»: сначала закрывает ввод сдачи, потом саму карточку
  useEffect(() => {
    const app = webApp();
    if (!app) return;
    const back = () => {
      haptic.tap();
      if (submitting && quest.status !== "REVISION") setSubmitting(false);
      else onClose();
    };
    app.BackButton.onClick(back);
    app.BackButton.show();
    return () => {
      app.BackButton.offClick(back);
      app.BackButton.hide();
    };
  }, [onClose, submitting, quest.status]);

  // Родная нижняя кнопка под текущий шаг
  useEffect(() => {
    const app = webApp();
    if (!app) return;
    const button = app.MainButton;

    const press = async () => {
      if (quest.status === "OPEN") {
        haptic.tap();
        onAction("claim");
        return;
      }
      if (!submitting) {
        haptic.tap();
        setSubmitting(true);
        return;
      }
      if (!text.trim()) {
        haptic.error();
        app.showAlert?.("Напиши, что сделал, или кинь ссылку");
        return;
      }
      haptic.tap();
      onAction("submit", text);
    };

    if (quest.status === "OPEN") button.setText("🙋 Беру");
    else if (canSubmit) button.setText(submitting ? "📤 Отправить" : "📤 Сдать");
    else {
      button.hide();
      return;
    }

    button.onClick(press);
    button.show();
    if (busy) button.showProgress(false);
    else button.hideProgress();
    if (submitting && !text.trim()) button.disable();
    else button.enable();

    return () => {
      button.offClick(press);
      button.hideProgress();
      button.hide();
    };
  }, [quest.status, submitting, text, busy, canSubmit, onAction]);

  useEffect(() => {
    if (submitting) textRef.current?.focus();
  }, [submitting]);

  const status = STATUS[quest.status];
  const deadline = quest.status === "OPEN" ? quest.claimBy : quest.dueAt;
  const deadlineLabel = quest.status === "OPEN" ? quest.claimByLabel : quest.dueAtLabel;
  const overdue = deadline ? new Date(deadline).getTime() < Date.now() : false;

  async function release() {
    if (!(await confirmNative("Вернуть квест на доску? Его сможет взять кто-то другой."))) return;
    haptic.tap();
    onAction("release");
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "var(--bg)" }}>
      <div className="mx-auto max-w-lg px-4 pb-32 pt-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full px-2 py-1" style={{ background: "var(--section)", color: "var(--subtitle)" }}>
            {KIND[quest.kind].emoji} {KIND[quest.kind].label}
          </span>
          {quest.skill && (
            <span className="rounded-full px-2 py-1" style={{ background: "var(--section)", color: "var(--subtitle)" }}>
              {SKILL[quest.skill].emoji} {SKILL[quest.skill].label}
            </span>
          )}
          <span className="rounded-full px-2 py-1 font-semibold" style={{ background: "var(--section)" }}>
            ⭐ {quest.points}
          </span>
          {quest.status !== "OPEN" && (
            <span className="rounded-full px-2 py-1" style={{ background: "var(--section)", color: "var(--subtitle)" }}>
              {status.emoji} {status.label}
            </span>
          )}
        </div>

        <h1 className="mt-3 text-xl font-semibold leading-snug">{quest.title}</h1>

        {quest.eventTitle && (
          <p className="mt-1.5 text-sm" style={{ color: "var(--subtitle)" }}>
            📍 {quest.eventTitle}
          </p>
        )}

        {deadlineLabel && (
          <p className="mt-3 text-sm" style={{ color: overdue ? "var(--destructive)" : "var(--subtitle)" }}>
            {quest.status === "OPEN" ? "⏳ Взять до" : "📅 Сдать до"} {deadlineLabel}
            <span className="ml-1 opacity-70">({formatRelative(deadline!)})</span>
          </p>
        )}

        {quest.reviewNote && (
          <div
            className="mt-4 rounded-xl p-3 text-sm"
            style={{ background: "var(--section)", borderLeft: "3px solid var(--destructive)" }}
          >
            <div className="mb-1 font-medium">🔁 Вернули на доработку</div>
            <p style={{ color: "var(--subtitle)" }}>{quest.reviewNote}</p>
          </div>
        )}

        {quest.brief && (
          <div className="mt-4 rounded-xl p-3.5" style={{ background: "var(--section)" }}>
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{quest.brief}</p>
          </div>
        )}

        {submitting && canSubmit && (
          <div className="mt-4">
            <label htmlFor="submit-text" className="mb-1.5 block text-sm font-medium">
              Что сделал
            </label>
            <textarea
              id="submit-text"
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Ссылка на облако, пост или макет. Можно с комментарием."
              className="w-full resize-none rounded-xl p-3 text-[15px] outline-none"
              style={{ background: "var(--section)", color: "var(--text)", border: "1px solid var(--separator)" }}
            />
            <p className="mt-1.5 text-xs" style={{ color: "var(--hint)" }}>
              Много фото — залей в облако и пришли ссылку. Один файл можно отправить боту в чат.
            </p>
          </div>
        )}

        {canSubmit && !submitting && (
          <button
            onClick={release}
            disabled={busy}
            className="mt-5 w-full rounded-xl py-3 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--section)", color: "var(--destructive)" }}
          >
            ↩️ Отказаться от квеста
          </button>
        )}

        {/* Запасной путь: вне Telegram родной нижней кнопки нет */}
        <FallbackActions
          quest={quest}
          submitting={submitting}
          text={text}
          busy={busy}
          onStartSubmit={() => setSubmitting(true)}
          onAction={onAction}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

function FallbackActions({
  quest,
  submitting,
  text,
  busy,
  onStartSubmit,
  onAction,
  onClose,
}: {
  quest: Quest;
  submitting: boolean;
  text: string;
  busy: boolean;
  onStartSubmit: () => void;
  onAction: (action: Action, text?: string) => void;
  onClose: () => void;
}) {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => setStandalone(!webApp()), []);
  if (!standalone) return null;

  const canSubmit = quest.status === "CLAIMED" || quest.status === "REVISION";
  return (
    <div className="mt-6 flex flex-col gap-2 border-t pt-4" style={{ borderColor: "var(--separator)" }}>
      {quest.status === "OPEN" && (
        <button
          onClick={() => onAction("claim")}
          disabled={busy}
          className="w-full rounded-xl py-3 font-semibold disabled:opacity-50"
          style={{ background: "var(--button)", color: "var(--button-text)" }}
        >
          🙋 Беру
        </button>
      )}
      {canSubmit && (
        <button
          onClick={() => (submitting ? onAction("submit", text) : onStartSubmit())}
          disabled={busy || (submitting && !text.trim())}
          className="w-full rounded-xl py-3 font-semibold disabled:opacity-50"
          style={{ background: "var(--button)", color: "var(--button-text)" }}
        >
          {submitting ? "📤 Отправить" : "📤 Сдать"}
        </button>
      )}
      <button onClick={onClose} className="w-full rounded-xl py-3 text-sm" style={{ color: "var(--link)" }}>
        Назад
      </button>
    </div>
  );
}
