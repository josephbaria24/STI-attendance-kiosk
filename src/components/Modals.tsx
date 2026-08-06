"use client";

import { useEffect, useState } from "react";
import { useAttendance } from "@/context/AttendanceContext";
import { useAuth } from "@/context/AuthContext";
import {
  isSuccessVoiceEnabled,
  setSuccessVoiceEnabled,
} from "@/lib/audio";
import { formatDisplayTime } from "@/lib/utils";
import { Button } from "./ui";

export function ScanNotificationModal() {
  const { db, scanNotif, closeScanNotif } = useAttendance();
  const [voiceOn, setVoiceOn] = useState(true);

  useEffect(() => {
    setVoiceOn(isSuccessVoiceEnabled());
  }, [scanNotif]);

  if (!scanNotif) return null;

  const { student, mode, timeStr, status, customHeader } = scanNotif;
  const displayTime = formatDisplayTime(
    timeStr,
    db.settings.timeFormat || "12h"
  );

  let headerBg = "bg-[var(--brand-green)]";
  let headerText = "TIME IN RECORDED";
  let metaLabel = "RECORDED TIME";

  if (customHeader) {
    headerBg =
      mode === "event"
        ? "bg-amber-600"
        : mode === "library"
          ? "bg-indigo-600"
          : "bg-[var(--teal)]";
    headerText = customHeader;
    metaLabel =
      mode === "event"
        ? "EVENT CHECK-IN TIME"
        : mode === "library"
          ? "LIBRARY CHECK-IN TIME"
          : "CLASS INSIGHT TIME";
  } else if (mode === "in") {
    headerBg =
      status === "Late" ? "bg-[var(--warning)]" : "bg-[var(--brand-green)]";
    headerText = status === "Late" ? "LATE CHECK-IN" : "TIME IN RECORDED";
  } else if (mode === "out") {
    headerBg = "bg-[var(--primary)]";
    headerText = "TIME OUT RECORDED";
  }

  const roleLabel =
    student.role === "admin"
      ? "Administrator"
      : student.role === "faculty"
        ? "Faculty / Staff"
        : student.distinction || "Student";

  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    setSuccessVoiceEnabled(next);
    if (!next && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/45 backdrop-blur-sm">
      <div className="relative w-[90%] max-w-[320px] animate-[fadeUp_0.25s_ease] overflow-hidden rounded-2xl bg-white text-center shadow-2xl shadow-slate-900/20">
        <button
          type="button"
          aria-label="Close"
          onClick={closeScanNotif}
          className="absolute right-2.5 top-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white transition hover:bg-black/35"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden
          >
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              d="M6 6l12 12M18 6L6 18"
            />
          </svg>
        </button>

        <div
          className={`px-4 py-4 pr-12 text-lg font-extrabold tracking-tight text-white ${headerBg}`}
        >
          {headerText}
        </div>
        <div className="bg-white p-6">
          {student.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={student.photo}
              alt={student.name}
              className="mx-auto mb-4 h-[120px] w-[120px] rounded-full border-4 border-emerald-100 object-cover"
            />
          ) : (
            <div className="mx-auto mb-4 flex h-[120px] w-[120px] items-center justify-center rounded-full border-4 border-emerald-100 bg-emerald-50 text-4xl font-bold text-emerald-600/70">
              {student.name.charAt(0).toUpperCase()}
            </div>
          )}
          <h2 className="page-title mb-1 text-xl font-bold text-slate-800">
            {student.name}
          </h2>
          <p className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-[var(--primary)]">
            {roleLabel}
          </p>
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {metaLabel}
            </p>
            <div className="page-title text-[28px] font-extrabold tabular-nums text-slate-800">
              {displayTime}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left">
            <span className="text-[12px] font-semibold text-slate-600">
              Success voice
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={voiceOn}
              aria-label="Toggle success voice"
              onClick={toggleVoice}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                voiceOn ? "bg-[var(--brand-green)]" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                  voiceOn ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StatusModal() {
  const { statusModal, closeStatusModal, saveStatusOverride } = useAttendance();
  const { can } = useAuth();
  if (!statusModal || !can("summary.statusOverride")) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 backdrop-blur-sm">
      <div className="w-[90%] max-w-[400px] animate-[fadeUp_0.25s_ease] rounded-2xl bg-white p-6 shadow-2xl shadow-slate-900/20">
        <h2 className="page-title mb-2 text-lg font-bold">Override Status</h2>
        <p className="mb-4 font-semibold text-slate-700">{statusModal.name}</p>
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Select New Status
        </label>
        <select
          id="statusModalSelect"
          defaultValue={statusModal.status}
          className="mb-5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent-sky)] focus:ring-2 focus:ring-[var(--accent-sky)]/20"
        >
          <option value="Present">Present (On Time)</option>
          <option value="Late">Late</option>
          <option value="Excused">Excused</option>
          <option value="Absent">Absent</option>
        </select>
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={closeStatusModal}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const sel = document.getElementById(
                "statusModalSelect"
              ) as HTMLSelectElement;
              saveStatusOverride(
                sel.value as "Present" | "Late" | "Excused" | "Absent"
              );
            }}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
