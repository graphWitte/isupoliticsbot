import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Квест-борд", template: "%s · Квест-борд" },
  description: "Раздача и приёмка задач медиа-отдела",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-bg text-fg antialiased">{children}</body>
    </html>
  );
}
