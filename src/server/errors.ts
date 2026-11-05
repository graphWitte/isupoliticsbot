/** Ошибка, текст которой можно показать человеку как есть. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

// Проверка по имени, а не instanceof: в dev Next.js перезагружает модули,
// и класс из одного экземпляра модуля не узнаёт ошибку из другого.
export const isUserError = (e: unknown): e is UserError =>
  e instanceof Error && e.name === "UserError";

export const describeError = (e: unknown) => (e instanceof Error ? e.message : String(e));
