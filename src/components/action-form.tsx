"use client";

import { useActionState, useTransition, type FormEvent, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Форма для server action с ошибкой/подтверждением под кнопками.
 *
 * Отправляем вручную, а не через <form action>: React 19 после такого экшена
 * сбрасывает поля формы — даже если сервер вернул ошибку валидации, и человек
 * теряет всё, что набрал в брифе.
 */
export function ActionForm({
  action,
  confirm,
  className,
  children,
}: {
  action: Action;
  confirm?: string;
  className?: string;
  children: ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(action, null);
  const [, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    // submitter — чтобы до сервера дошёл name/value нажатой кнопки (intent)
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  }

  return (
    <form onSubmit={onSubmit} className={className} aria-busy={pending}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state?.error && (
        <p role="alert" className="basis-full text-sm text-rose-300">
          {state.error}
        </p>
      )}
      {state?.notice && (
        <p role="status" className="basis-full text-sm text-emerald-300">
          {state.notice}
        </p>
      )}
    </form>
  );
}
