// Отдельно от actions.ts: из файла с "use server" можно экспортировать только async-функции.
export type ActionState = { error?: string; notice?: string } | null;
