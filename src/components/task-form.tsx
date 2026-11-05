import type { Skill, TaskKind } from "@prisma/client";
import type { ActionState } from "@/lib/action-state";
import { KIND, KINDS, SKILL, SKILLS } from "@/lib/labels";
import { tzName } from "@/lib/time";
import { DeadlineField } from "./deadline-field";
import { ActionForm } from "./action-form";
import { btn, input } from "./ui";

export type TaskFormValues = {
  id?: string;
  title?: string;
  brief?: string | null;
  kind: TaskKind;
  skill?: Skill | null;
  points: number;
  claimBy?: string; // уже в формате datetime-local, в поясе отдела
  dueAt?: string;
};

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function TaskForm({
  action,
  values,
  mode,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  values: TaskFormValues;
  mode: "create" | "edit";
}) {
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <Field label="Заголовок" htmlFor="title">
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          defaultValue={values.title}
          placeholder="Сторис с дня открытых дверей"
          className={input}
        />
      </Field>

      <Field label="Бриф" htmlFor="brief" hint="Что конкретно сделать: формат, количество, к кому подойти на месте">
        <textarea id="brief" name="brief" rows={5} defaultValue={values.brief ?? ""} className={input} />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Тип</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {KINDS.map((kind) => (
            <label
              key={kind}
              className="flex cursor-pointer flex-col rounded-lg border border-border bg-bg px-3 py-2.5 transition hover:border-border-strong has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40"
            >
              <input type="radio" name="kind" value={kind} defaultChecked={values.kind === kind} className="sr-only" />
              <span className="text-sm font-medium">
                {KIND[kind].emoji} {KIND[kind].label}
              </span>
              <span className="mt-0.5 text-xs text-muted">{KIND[kind].hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Навык" htmlFor="skill" hint="Кому этот квест подходит лучше всего">
          <select id="skill" name="skill" defaultValue={values.skill ?? ""} className={input}>
            <option value="">Любой</option>
            {SKILLS.map((skill) => (
              <option key={skill} value={skill}>
                {SKILL[skill].emoji} {SKILL[skill].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Очки" htmlFor="points" hint="Сколько ⭐ получит исполнитель после приёмки">
          <input
            id="points"
            name="points"
            type="number"
            min={0}
            max={1000}
            step={1}
            required
            defaultValue={values.points}
            className={input}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <DeadlineField
          name="claimBy"
          kind="claim"
          tz={tzName}
          label="⏳ Взять до"
          hint="Никто не взял к сроку — придёт уведомление"
          defaultValue={values.claimBy}
        />
        <DeadlineField
          name="dueAt"
          kind="due"
          tz={tzName}
          label="📅 Сдать до"
          hint="Можно оставить пустым для контента без срока"
          defaultValue={values.dueAt}
        />
      </div>
      <p className="-mt-2 text-xs text-faint">Время по часовому поясу отдела: {tzName}</p>

      <div className="flex flex-wrap gap-2 border-t border-border pt-5">
        {mode === "create" ? (
          <>
            <button name="intent" value="publish" className={btn.primary}>
              🚀 Опубликовать в чат
            </button>
            <button name="intent" value="draft" className={btn.secondary}>
              Сохранить черновик
            </button>
          </>
        ) : (
          <button className={btn.primary}>Сохранить</button>
        )}
      </div>
    </ActionForm>
  );
}
