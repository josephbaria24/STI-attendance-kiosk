"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAttendance } from "@/context/AttendanceContext";
import { authFetch, useAuth } from "@/context/AuthContext";
import type { ViewId } from "@/lib/types";
import { HugeIcon, type AppIconName } from "./icons";

const NAV: { id: ViewId; label: string; hint: string; icon: AppIconName }[] = [
  { id: "scanner", label: "Scanning Kiosk", hint: "Scan", icon: "scanner" },
  { id: "summary", label: "Summary & Logs", hint: "Logs", icon: "summary" },
  { id: "analytics", label: "Analytics", hint: "Stats", icon: "analytics" },
  { id: "admin", label: "Admin Control", hint: "Admin", icon: "admin" },
];

const CLOCK_BG = "#004953";

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/25 transition duration-300 hover:scale-105">
        <HugeIcon name="scanner" size={18} className="text-[var(--primary)]" />
      </div>
      <div className="min-w-0">
        <div
          className={`page-title truncate font-extrabold tracking-tight text-slate-800 ${
            compact ? "text-base" : "text-base md:text-xl"
          }`}
        >
          Attendance Pro
        </div>
        {!compact && (
          <div className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 md:block">
            AttendX
          </div>
        )}
      </div>
    </div>
  );
}

function NavList({
  onSelect,
  pendingResets,
}: {
  onSelect: (id: ViewId) => void;
  pendingResets: number;
}) {
  const { view } = useAttendance();
  const { canView, canManageUsers, profile } = useAuth();
  const items = useMemo(
    () => NAV.filter((item) => canView(item.id)),
    [canView],
  );
  const navRef = useRef<HTMLElement | null>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState({
    top: 0,
    height: 0,
    ready: false,
  });

  const activeId = items.some((item) => item.id === view)
    ? view
    : (items[0]?.id ?? null);

  const measureIndicator = () => {
    const nav = navRef.current;
    const id = activeId;
    if (!nav || !id) {
      setIndicator((prev) => ({ ...prev, ready: false }));
      return;
    }
    const btn = btnRefs.current[id];
    if (!btn) {
      setIndicator((prev) => ({ ...prev, ready: false }));
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setIndicator({
      top: btnRect.top - navRect.top + nav.scrollTop,
      height: btnRect.height,
      ready: true,
    });
  };

  useLayoutEffect(() => {
    measureIndicator();
  }, [activeId, items, pendingResets, profile]);

  useEffect(() => {
    window.addEventListener("resize", measureIndicator);
    return () => window.removeEventListener("resize", measureIndicator);
  }, [activeId]);

  return (
    <nav ref={navRef} className="relative flex flex-col gap-1 px-3 py-4">
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 right-3 top-0 rounded-lg border-l-[3px] border-[var(--primary)] bg-[var(--primary)]/10 shadow-inner transition-[transform,height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          height: indicator.height,
          transform: `translateY(${indicator.top}px)`,
          opacity: indicator.ready ? 1 : 0,
        }}
      />
      {profile && (
        <div className="mb-2 px-4 text-[11px] font-semibold text-slate-400">
          @{profile.username}
          {profile.isSuperadmin ? " · Super admin" : ""}
        </div>
      )}
      {items.map((item, i) => {
        const active = activeId === item.id;
        const showBadge =
          item.id === "admin" && canManageUsers && pendingResets > 0;
        return (
          <button
            key={item.id}
            ref={(el) => {
              btnRefs.current[item.id] = el;
            }}
            type="button"
            onClick={() => onSelect(item.id)}
            style={{ animationDelay: `${i * 40}ms` }}
            className={`nav-item-anim group relative z-10 flex items-center gap-3 rounded-lg px-4 py-3 text-left text-[15px] font-semibold transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              active
                ? "text-[var(--primary)]"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <HugeIcon
              name={item.icon}
              size={18}
              className={`icon-pop transition-colors duration-300 ${
                active ? "text-[var(--primary)]" : "text-slate-400"
              }`}
            />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {showBadge && (
              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                {pendingResets}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function WavyDivider() {
  return (
    <svg
      className="block w-full"
      viewBox="0 0 270 52"
      preserveAspectRatio="none"
      height="52"
      aria-hidden
    >
      <path
        d="M0 26
           C22 8, 45 8, 67.5 26
           S112.5 44, 135 26
           S180 8, 202.5 26
           S247.5 44, 270 26
           L270 52 L0 52 Z"
        fill={CLOCK_BG}
      />
    </svg>
  );
}

function ClockPanel({ onLogout }: { onLogout?: () => void }) {
  const { clock } = useAttendance();
  return (
    <div className="mt-auto">
      <WavyDivider />
      <div
        className="px-5 pb-4 pt-1 text-center"
        style={{ backgroundColor: CLOCK_BG }}
      >
        <div className="rounded-xl bg-white/10 px-4 py-2.5 ring-1 ring-white/15 transition duration-300 hover:bg-white/15">
          <div className="mb-1.5 flex justify-center text-sky-300">
            <HugeIcon name="clock" size={18} className="opacity-90" />
          </div>
          <h2 className="page-title m-0 text-[1.35rem] font-bold tabular-nums tracking-tight text-white">
            {clock.time}
          </h2>
          <p className="mt-0.5 text-[12px] font-medium text-white/65">
            {clock.date}
          </p>
        </div>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-white/80 ring-1 ring-white/15 transition hover:bg-white/20 hover:text-white"
          >
            <HugeIcon name="timeOut" size={14} className="text-sky-300" />
            Sign out
          </button>
        )}
        <div className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
          JP ODASCO · v7.3
        </div>
      </div>
    </div>
  );
}

export function Sidebar({
  onNavigate,
  onLogout,
}: {
  onNavigate?: (id: ViewId) => void;
  onLogout?: () => void;
}) {
  const { setView, clock } = useAttendance();
  const { accessToken, canManageUsers } = useAuth();
  const [open, setOpen] = useState(false);
  const [pendingResets, setPendingResets] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!accessToken || !canManageUsers) {
      setPendingResets(0);
      return;
    }
    let cancelled = false;
    async function poll() {
      try {
        const res = await authFetch(
          "/api/admin/reset-requests?status=pending",
          accessToken!,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { requests?: unknown[] };
        if (!cancelled) setPendingResets(data.requests?.length ?? 0);
      } catch {
        /* ignore */
      }
    }
    void poll();
    const t = window.setInterval(poll, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [accessToken, canManageUsers]);

  function handleSelect(id: ViewId) {
    onNavigate?.(id);
    setView(id);
    setOpen(false);
  }

  return (
    <>
      <header className="relative z-50 m-3 flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-slate-800 shadow-lg shadow-black/10 transition duration-300 md:hidden">
        <BrandMark compact />
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] font-semibold tabular-nums text-slate-500 sm:inline">
            {clock.time}
          </span>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 ring-1 ring-slate-200 transition duration-300 hover:scale-105 hover:bg-slate-200"
          >
            <HugeIcon
              name={open ? "close" : "menu"}
              size={20}
              className="text-slate-700 transition-transform duration-300"
            />
            {pendingResets > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                {pendingResets}
              </span>
            )}
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-[60] md:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <button
          type="button"
          aria-label="Close menu"
          className={`absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] transition-opacity duration-300 ${
            open ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setOpen(false)}
        />
        <aside
          className={`absolute left-3 top-3 flex h-[calc(100vh-1.5rem)] w-[min(288px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-slate-800 shadow-2xl shadow-black/20 transition-all duration-300 ease-out ${
            open
              ? "translate-x-0 opacity-100"
              : "-translate-x-[120%] opacity-0"
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
            <BrandMark compact />
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 transition hover:bg-slate-200"
            >
              <HugeIcon name="close" size={18} className="text-slate-700" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <NavList onSelect={handleSelect} pendingResets={pendingResets} />
            <ClockPanel onLogout={onLogout} />
          </div>
        </aside>
      </div>

      <aside className="relative z-50 hidden overflow-hidden transition duration-300 md:m-4 md:flex md:h-[calc(100vh-2rem)] md:w-[270px] md:shrink-0 md:flex-col md:items-stretch md:rounded-xl md:border md:border-slate-200/80 md:bg-white md:text-slate-800 md:shadow-lg md:shadow-black/10">
        <div className="border-b border-slate-200 px-6 py-7">
          <BrandMark />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <NavList onSelect={handleSelect} pendingResets={pendingResets} />
          <ClockPanel onLogout={onLogout} />
        </div>
      </aside>
    </>
  );
}
