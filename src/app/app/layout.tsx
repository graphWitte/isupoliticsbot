import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./miniapp.css";

export const metadata: Metadata = {
  title: "Квесты медиа-отдела",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Телефон не должен зумить страницу от двойного тапа — внутри Telegram это ломает жесты
  userScalable: false,
};

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* beforeInteractive: window.Telegram должен существовать до первого рендера приложения */}
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      {children}
    </>
  );
}
