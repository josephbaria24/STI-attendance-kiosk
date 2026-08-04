import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={`glass-card mb-6 rounded-2xl p-6 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  icon,
  aside,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-6 animate-[fadeUp_0.4s_cubic-bezier(0.22,1,0.36,1)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-sm transition duration-300 hover:scale-105 hover:bg-white/25">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="page-title m-0 text-3xl font-extrabold text-white drop-shadow-sm md:text-[2rem]">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 text-sm font-medium text-white/75">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="glass-card flex flex-col rounded-2xl p-5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>
      <span className="page-title mt-2 text-3xl font-extrabold text-[var(--text)]">
        {value}
      </span>
    </div>
  );
}

export function Badge({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?:
    | "present"
    | "late"
    | "excused"
    | "absent"
    | "class"
    | "default"
    | "faculty"
    | "admin"
    | "role";
}) {
  const styles: Record<string, string> = {
    present: "bg-emerald-100/90 text-emerald-800",
    late: "bg-amber-100/90 text-amber-800",
    excused: "bg-sky-100/90 text-sky-800",
    absent: "bg-red-100/90 text-red-800",
    class: "bg-sky-100/90 text-sky-800",
    faculty: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80",
    admin: "bg-red-50 text-red-700 ring-1 ring-red-200/80",
    role: "bg-slate-100/90 text-slate-600",
    default: "bg-slate-100 text-slate-700",
  };
  return (
    <span
      className={`inline-block rounded-md px-2.5 py-1 text-[11px] font-bold tracking-wide ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

type BtnVariant =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "purple"
  | "teal";

const btnStyles: Record<BtnVariant, string> = {
  primary:
    "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] shadow-sm shadow-emerald-900/20",
  secondary:
    "border border-white/60 bg-white/80 text-slate-700 hover:bg-white",
  success:
    "bg-[var(--brand-green)] text-white hover:bg-[var(--brand-green-deep)] shadow-sm shadow-emerald-900/20",
  danger: "bg-[var(--danger)] text-white hover:brightness-110",
  purple:
    "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] shadow-sm",
  teal: "bg-[var(--teal)] text-white hover:brightness-110 shadow-sm shadow-teal-700/15",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return (
    <button
      type={type}
      className={`group inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${btnStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  className = "",
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-4 flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent-sky)] focus:ring-2 focus:ring-[var(--accent-sky)]/20";

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white/95">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="page-title m-0 text-lg font-bold tracking-tight text-[var(--text)]">
      {children}
    </h2>
  );
}
