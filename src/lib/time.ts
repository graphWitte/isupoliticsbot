import { env } from "./env";
import { formatDateIn, parseLocalInput as parseIn, toLocalInput as toIn } from "./tz-input";

export { formatRelative } from "./relative";

export const tzName = env.APP_TZ;

/** Разбор `datetime-local` в поясе отдела. Клиентская версия — в tz-input.ts. */
export const parseLocalInput = (value: string | null | undefined) => parseIn(value, tzName);

export const toLocalInput = (date: Date | null | undefined) => toIn(date, tzName);

/** «пт, 19 сент., 18:00» в поясе отдела. Клиентская версия — formatDateIn. */
export const formatDate = (date: Date) => formatDateIn(date, tzName);
