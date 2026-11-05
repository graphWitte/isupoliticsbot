/** Экранирование пользовательского текста для parse_mode: "HTML" в Telegram. */
export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Обрезать до n символов: у сообщений Telegram лимит 4096. */
export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
