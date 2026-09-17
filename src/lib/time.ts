import { env } from "./env";

export const tzName = env.APP_TZ;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: tzName,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function wallClock(date: Date) {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFormatter.formatToParts(date)) {
    if (type !== "literal") p[type] = Number(value);
  }
  return p as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

/** На сколько миллисекунд часы отдела впереди UTC в этот момент. */
function offsetMs(date: Date) {
  const w = wallClock(date);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - (date.getTime() - date.getUTCMilliseconds());
}

/**
 * `<input type="datetime-local">` отдаёт «2026-09-20T18:00» без пояса. Это время
 * на часах отдела — не UTC и не пояс сервера, где крутится админка.
 */
export function parseLocalInput(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value?.trim() ?? "");
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const first = naive - offsetMs(new Date(naive));
  // второй проход ловит смену смещения между naive и first (переход на летнее время)
  return new Date(naive - offsetMs(new Date(first)));
}

export function toLocalInput(date: Date | null | undefined): string {
  if (!date) return "";
  const w = wallClock(date);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${w.year}-${p(w.month)}-${p(w.day)}T${p(w.hour)}:${p(w.minute)}`;
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: tzName,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** «пт, 19 сент., 18:00» */
export const formatDate = (date: Date) => dateFormatter.format(date);

/** «через 3 ч», «2 дн назад» */
export function formatRelative(date: Date, now = new Date()): string {
  const diff = date.getTime() - now.getTime();
  const minutes = Math.round(Math.abs(diff) / 60_000);
  if (minutes < 1) return "сейчас";
  const span =
    minutes < 60
      ? `${minutes} мин`
      : minutes < 1440
        ? `${Math.round(minutes / 60)} ч`
        : `${Math.round(minutes / 1440)} дн`;
  return diff > 0 ? `через ${span}` : `${span} назад`;
}
