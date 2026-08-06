"use client";

import { useAuth } from "@/context/AuthContext";

/** Toasts available on login (before AttendanceProvider mounts). */
export function AuthToastContainer() {
  const { toasts, dismissToast } = useAuth();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-5 top-5 z-[9999] flex flex-col gap-3">
      {toasts.map((t) => {
        const border =
          t.type === "success"
            ? "border-[var(--brand-green)]"
            : t.type === "error"
              ? "border-[var(--danger)]"
              : t.type === "warning"
                ? "border-[var(--warning)]"
                : "border-[var(--accent-sky)]";
        const prefix =
          t.type === "success"
            ? "Success"
            : t.type === "error"
              ? "Error"
              : t.type === "warning"
                ? "Warning"
                : "Notice";
        return (
          <div
            key={t.id}
            className={`pointer-events-auto min-w-[280px] max-w-[350px] animate-[slideInRight_0.3s_cubic-bezier(0.175,0.885,0.32,1.275)] rounded-xl border-l-[5px] bg-white/95 p-4 shadow-lg shadow-slate-900/10 backdrop-blur-md ring-1 ring-slate-200/60 ${border}`}
            onClick={() => dismissToast(t.id)}
          >
            <strong className="mb-1 flex items-center gap-1.5 text-[15px] font-bold text-slate-800">
              {prefix} — {t.title}
            </strong>
            <span className="block text-[13px] leading-snug text-slate-500">
              {t.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}
