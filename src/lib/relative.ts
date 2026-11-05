// Без зависимостей от env: файл попадает и в клиентский бандл Mini App.

/** «через 3 ч», «2 дн назад» */
export function formatRelative(date: Date | string, now: Date | number = new Date()): string {
  const target = typeof date === "string" ? new Date(date) : date;
  const diff = target.getTime() - new Date(now).getTime();
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
