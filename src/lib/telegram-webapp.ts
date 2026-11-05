// Тонкая типизированная обёртка над window.Telegram.WebApp.
// Своей библиотеки не берём: официальный SDK сейчас переезжает с @telegram-apps
// на @tma.js, а нам нужны ровно шесть методов.

type HapticStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
type HapticNotification = "error" | "success" | "warning";

type BottomButton = {
  setText(text: string): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
  show(): void;
  hide(): void;
  enable(): void;
  disable(): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  setParams(params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }): void;
};

export type TelegramWebApp = {
  initData: string;
  colorScheme: "light" | "dark";
  isExpanded: boolean;
  version: string;
  ready(): void;
  expand(): void;
  close(): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  setHeaderColor?(color: string): void;
  MainButton: BottomButton;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: {
    impactOccurred(style: HapticStyle): void;
    notificationOccurred(type: HapticNotification): void;
    selectionChanged(): void;
  };
  showAlert?(message: string, cb?: () => void): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  openLink?(url: string, options?: { try_instant_view?: boolean }): void;
};

export const webApp = (): TelegramWebApp | null =>
  typeof window === "undefined" ? null : ((window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null);

/** Открыт ли экран внутри Telegram. В обычном браузере initData пустой. */
export const insideTelegram = () => Boolean(webApp()?.initData);

export const haptic = {
  tap: () => webApp()?.HapticFeedback?.impactOccurred("light"),
  success: () => webApp()?.HapticFeedback?.notificationOccurred("success"),
  error: () => webApp()?.HapticFeedback?.notificationOccurred("error"),
  select: () => webApp()?.HapticFeedback?.selectionChanged(),
};

/** Ссылки изнутри вебвью открываем через Telegram, иначе они открываются в нём же. */
export function openLink(url: string) {
  const app = webApp();
  if (app?.openLink) app.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

/** Подтверждение нативным диалогом Telegram, с запасным window.confirm. */
export function confirmNative(message: string): Promise<boolean> {
  const app = webApp();
  if (!app?.showConfirm) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => app.showConfirm!(message, resolve));
}
