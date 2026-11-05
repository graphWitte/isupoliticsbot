// Пояс передаётся параметром, env не читается: модуль идёт и в клиентский бандл.
// Обёртки с поясом отдела — в time.ts.

const partsCache = new Map<string, Intl.DateTimeFormat>();

function parts(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsCache.set(tz, f);
  }
  return f;
}

type Wall = Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;

function wallClock(date: Date, tz: string): Wall {
  const out: Record<string, number> = {};
  for (const { type, value } of parts(tz).formatToParts(date)) {
    if (type !== "literal") out[type] = Number(value);
  }
  return out as Wall;
}

/** На сколько миллисекунд часы пояса впереди UTC в этот момент. */
function offsetMs(date: Date, tz: string) {
  const w = wallClock(date, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - (date.getTime() - date.getUTCMilliseconds());
}

/** Время на стенных часах пояса -> момент времени. Второй проход ловит переход на летнее время. */
export function wallClockToDate(
  tz: string,
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
): Date {
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const first = naive - offsetMs(new Date(naive), tz);
  return new Date(naive - offsetMs(new Date(first), tz));
}

/** `<input type="datetime-local">` отдаёт «2026-09-20T18:00» без пояса — это часы отдела. */
export function parseLocalInput(value: string | null | undefined, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value?.trim() ?? "");
  if (!m) return null;
  return wallClockToDate(tz, +m[1], +m[2], +m[3], +m[4], +m[5]);
}

export function toLocalInput(date: Date | null | undefined, tz: string): string {
  if (!date) return "";
  const w = wallClock(date, tz);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${w.year}-${p(w.month)}-${p(w.day)}T${p(w.hour)}:${p(w.minute)}`;
}

/** Через N часов от текущего момента, с округлением вверх до получаса. */
export function inHours(hours: number, tz: string, now = new Date()): string {
  const target = new Date(now.getTime() + hours * 3600_000);
  const rounded = new Date(Math.ceil(target.getTime() / 1800_000) * 1800_000);
  return toLocalInput(rounded, tz);
}

/** Через N дней, на конкретное время по часам отдела: «завтра в 18:00». */
export function inDaysAt(days: number, hour: number, tz: string, now = new Date()): string {
  const w = wallClock(now, tz);
  const base = wallClockToDate(tz, w.year, w.month, w.day, hour, 0);
  return toLocalInput(new Date(base.getTime() + days * 86_400_000), tz);
}

const labelCache = new Map<string, Intl.DateTimeFormat>();

/** «пт, 19 сент., 18:00» в заданном поясе. */
export function formatDateIn(date: Date, tz: string): string {
  let f = labelCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("ru-RU", {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    labelCache.set(tz, f);
  }
  return f.format(date);
}
