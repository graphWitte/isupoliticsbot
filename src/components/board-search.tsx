"use client";

import { useEffect, useRef, useState } from "react";
import { input } from "./ui";

/**
 * Фильтрация на клиенте, а не запросом: вся доска уже на странице, и так поиск
 * откликается на каждую букву без похода на сервер.
 */
export function BoardSearch({ onChange }: { onChange: (query: string) => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  // «/» ставит курсор в поиск — куратор держит доску открытой весь день
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        ref.current?.focus();
      }
      if (e.key === "Escape" && el === ref.current) {
        setValue("");
        onChange("");
        ref.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange]);

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
        placeholder="Поиск по квестам…"
        aria-label="Поиск по квестам"
        className={`${input} pl-8`}
      />
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-faint" aria-hidden>
        ⌕
      </span>
      {!value && (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 text-[11px] text-faint sm:block">
          /
        </kbd>
      )}
    </div>
  );
}
