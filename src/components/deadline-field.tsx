"use client";

import { useId, useState } from "react";
import { cx } from "@/lib/cx";
import { formatRelative } from "@/lib/relative";
import { inDaysAt, inHours, parseLocalInput } from "@/lib/tz-input";
import { input } from "./ui";

type Preset = { label: string; value: (tz: string) => string };

const CLAIM_PRESETS: Preset[] = [
  { label: "2 часа", value: (tz) => inHours(2, tz) },
  { label: "сегодня 20:00", value: (tz) => inDaysAt(0, 20, tz) },
  { label: "завтра 12:00", value: (tz) => inDaysAt(1, 12, tz) },
  { label: "3 дня", value: (tz) => inHours(72, tz) },
];

const DUE_PRESETS: Preset[] = [
  { label: "завтра 18:00", value: (tz) => inDaysAt(1, 18, tz) },
  { label: "3 дня", value: (tz) => inHours(72, tz) },
  { label: "неделя", value: (tz) => inHours(24 * 7, tz) },
];

/**
 * Дата со строкой быстрых вариантов. Куратор ставит квесты пачками, и лезть в
 * календарь ради «через два часа» — главное трение в этой форме.
 */
export function DeadlineField({
  name,
  label,
  hint,
  defaultValue = "",
  kind,
  tz,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  kind: "claim" | "due";
  tz: string;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const presets = kind === "claim" ? CLAIM_PRESETS : DUE_PRESETS;

  const parsed = parseLocalInput(value, tz);
  const inPast = parsed ? parsed.getTime() < Date.now() : false;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>

      <div className="flex gap-2">
        <input
          id={id}
          name={name}
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={input}
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue("")}
            aria-label={`Очистить «${label}»`}
            className="shrink-0 rounded-lg border border-border px-2.5 text-sm text-muted transition hover:border-border-strong hover:text-fg"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((preset) => {
          const presetValue = preset.value(tz);
          const active = value === presetValue;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => setValue(active ? "" : presetValue)}
              aria-pressed={active}
              className={cx(
                "rounded-md border px-2 py-1 text-xs transition",
                active
                  ? "border-accent/50 bg-accent/15 text-fg"
                  : "border-border text-muted hover:border-border-strong hover:text-fg",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {parsed ? (
        <p className={cx("mt-1.5 text-xs", inPast ? "text-rose-300" : "text-faint")}>
          {inPast ? "⚠️ Это время уже прошло" : formatRelative(parsed)}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>
      )}
    </div>
  );
}
