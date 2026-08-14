"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAttendance } from "@/context/AttendanceContext";
import { HugeIcon } from "./icons";

const FAB_SIZE = 56;
const EDGE = 16;
const STORAGE_KEY = "attendx_fab_pos_v1";

type Pos = { x: number; y: number };

function clampPos(x: number, y: number): Pos {
  const maxX = Math.max(EDGE, window.innerWidth - FAB_SIZE - EDGE);
  const maxY = Math.max(EDGE, window.innerHeight - FAB_SIZE - EDGE);
  return {
    x: Math.min(maxX, Math.max(EDGE, x)),
    y: Math.min(maxY, Math.max(EDGE, y)),
  };
}

function defaultPos(): Pos {
  if (typeof window === "undefined") return { x: EDGE, y: EDGE };
  return clampPos(
    window.innerWidth - FAB_SIZE - EDGE,
    window.innerHeight - FAB_SIZE - EDGE - 24
  );
}

function readPos(): Pos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPos();
    const parsed = JSON.parse(raw) as Pos;
    return clampPos(parsed.x, parsed.y);
  } catch {
    return defaultPos();
  }
}

/**
 * Mobile-only floating scanner shortcut (hidden from md breakpoint up).
 * Tap: go to Scanning Kiosk → scroll to scanner → auto-start camera.
 * Drag: reposition (position remembered).
 */
export function FloatingScannerFab() {
  const { view, setView } = useAttendance();
  const [pos, setPos] = useState<Pos>(defaultPos);
  const drag = useRef<{
    active: boolean;
    moved: boolean;
    ox: number;
    oy: number;
    sx: number;
    sy: number;
  } | null>(null);

  useEffect(() => {
    setPos(readPos());
    function onResize() {
      setPos((p) => clampPos(p.x, p.y));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const activateScanner = useCallback(() => {
    setView("scanner");
    // Start in this tap — iOS blocks camera play() after setTimeout.
    (
      window as unknown as { __attendxStartScanner?: () => void }
    ).__attendxStartScanner?.();
    window.setTimeout(() => {
      document
        .getElementById("kiosk-scanner-section")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, [setView]);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      active: true,
      moved: false,
      ox: e.clientX - pos.x,
      oy: e.clientY - pos.y,
      sx: e.clientX,
      sy: e.clientY,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d?.active) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) d.moved = true;
    setPos(clampPos(e.clientX - d.ox, e.clientY - d.oy));
  }

  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!d) return;
    if (d.moved) {
      setPos((p) => {
        const next = clampPos(p.x, p.y);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      return;
    }
    activateScanner();
  }

  return (
    <button
      type="button"
      aria-label="Open scanner"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
      }}
      className="fixed z-[70] flex h-14 w-14 touch-none items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-lg shadow-black/30 ring-2 ring-white/30 transition active:scale-95 md:hidden"
      style={{ left: pos.x, top: pos.y }}
    >
      <HugeIcon name="scanner" size={24} className="pointer-events-none" />
    </button>
  );
}
