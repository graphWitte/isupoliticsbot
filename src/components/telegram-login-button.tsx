"use client";

import { useEffect, useRef } from "react";

/**
 * Кнопка Telegram Login Widget.
 *
 * Скрипт вставляем руками, а не тегом в JSX: виджет подменяет свой <script> на
 * iframe прямо на месте, а React 19 при серверном рендере уносит async-скрипты
 * в <head> — кнопка оказалась бы там, невидимой.
 */
export function TelegramLoginButton({ bot, authUrl }: { bot: string; authUrl: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.dataset.telegramLogin = bot;
    script.dataset.size = "large";
    script.dataset.radius = "10";
    script.dataset.authUrl = authUrl;
    // разрешение писать в личку: уведомления дойдут, даже если человек не жал Start у бота
    script.dataset.requestAccess = "write";
    script.dataset.lang = "ru";
    el.replaceChildren(script);
    return () => el.replaceChildren();
  }, [bot, authUrl]);

  return <div ref={container} className="flex min-h-10 justify-center" />;
}
