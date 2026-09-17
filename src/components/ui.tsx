import type { ReactNode } from "react";
import type { TaskStatus } from "@prisma/client";
import { cx } from "@/lib/cx";
import { STATUS } from "@/lib/labels";

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50";

export const btn = {
  primary: cx(buttonBase, "bg-accent text-white hover:bg-accent-hover"),
  secondary: cx(buttonBase, "border border-border bg-surface-2 text-fg hover:border-border-strong hover:bg-surface-3"),
  danger: cx(buttonBase, "border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"),
  ghost: cx(buttonBase, "text-muted hover:bg-surface-2 hover:text-fg"),
};

export const input =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-faint " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";

export function StatusPill({ status }: { status: TaskStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        s.className,
      )}
    >
      {s.emoji} {s.label}
    </span>
  );
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  actions,
  className,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx("rounded-xl border border-border bg-surface", className)}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const noticeTone = {
  error: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  info: "border-accent/30 bg-accent/10 text-fg",
};

export function Notice({ tone = "info", children }: { tone?: keyof typeof noticeTone; children: ReactNode }) {
  return <div className={cx("rounded-lg border px-4 py-3 text-sm", noticeTone[tone])}>{children}</div>;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-muted",
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-faint">
      {children}
    </div>
  );
}
