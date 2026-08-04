import type { AnalyticsRow, AppDb, Member, TimeFormat } from "./types";

export function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Format a stored 24h time (`HH:mm` / `HH:mm:ss`) for display / export.
 * Empty values and em-dashes pass through unchanged.
 */
export function formatDisplayTime(
  time: string | null | undefined,
  format: TimeFormat = "12h"
): string {
  if (!time || time === "—") return time || "—";

  const trimmed = time.trim();
  const ampm = trimmed.match(/\b(AM|PM)\b/i);
  const numeric = trimmed.replace(/\b(AM|PM)\b/i, "").trim();
  const parts = numeric.split(":").map((p) => p.trim());
  if (parts.length < 2) return trimmed;

  let h = Number(parts[0]);
  const m = Number(parts[1]);
  const s = parts.length >= 3 ? Number(parts[2]) : undefined;
  if (!Number.isFinite(h) || !Number.isFinite(m)) return trimmed;

  // Convert from 12h input if AM/PM was present
  if (ampm) {
    const isPm = ampm[1].toUpperCase() === "PM";
    if (isPm && h < 12) h += 12;
    if (!isPm && h === 12) h = 0;
  }

  const mm = String(m).padStart(2, "0");
  const ss =
    s !== undefined && Number.isFinite(s) ? String(s).padStart(2, "0") : null;

  if (format === "24h") {
    const hh = String(h).padStart(2, "0");
    return ss !== null ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
  }

  const period = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return ss !== null ? `${h12}:${mm}:${ss} ${period}` : `${h12}:${mm} ${period}`;
}

export function formatNowTime(date: Date, format: TimeFormat = "12h"): string {
  return date.toLocaleTimeString("en-US", {
    hour: format === "12h" ? "numeric" : "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: format === "12h",
  });
}

const TIME_FORMAT_KEY = "attendx_time_format";

export function readLocalTimeFormat(): TimeFormat | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(TIME_FORMAT_KEY);
    if (v === "12h" || v === "24h") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeLocalTimeFormat(format: TimeFormat) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TIME_FORMAT_KEY, format);
  } catch {
    /* ignore */
  }
}

export function memberDetails(s: Member) {
  return s.role === "faculty" || s.role === "admin"
    ? `Dept: ${s.dept}`
    : `Gr ${s.grade} - ${s.section}`;
}

export function getAnalyticsSummaryData(
  db: AppDb,
  query = ""
): AnalyticsRow[] {
  const q = query.toLowerCase().trim();

  let processed = db.students.map((s) => {
    let totalTimeIns = 0;
    let totalTimeOuts = 0;
    let totalSeconds = 0;

    for (const dateStr in db.logs) {
      const dayLog = db.logs[dateStr]?.[s.id];
      if (!dayLog) continue;

      if (dayLog.scans && dayLog.scans.length > 0) {
        for (let i = 0; i < dayLog.scans.length; i += 2) {
          const sIn = dayLog.scans[i];
          const sOut = dayLog.scans[i + 1];

          if (sIn) totalTimeIns++;
          if (sOut) totalTimeOuts++;

          if (sIn && sOut) {
            const tIn = sIn.time.split(":").map(Number);
            const tOut = sOut.time.split(":").map(Number);
            const inSec = tIn[0] * 3600 + tIn[1] * 60 + (tIn[2] || 0);
            const outSec = tOut[0] * 3600 + tOut[1] * 60 + (tOut[2] || 0);
            if (outSec > inSec) totalSeconds += outSec - inSec;
          }
        }
      } else {
        const hasIn = Boolean(dayLog.timeIn && dayLog.timeIn !== "—");
        const hasOut = Boolean(dayLog.timeOut && dayLog.timeOut !== "—");

        if (hasIn) totalTimeIns++;
        if (hasOut) totalTimeOuts++;

        if (hasIn && hasOut) {
          const tIn = dayLog.timeIn.split(":").map(Number);
          const tOut = dayLog.timeOut.split(":").map(Number);
          const inSec = tIn[0] * 3600 + tIn[1] * 60 + (tIn[2] || 0);
          const outSec = tOut[0] * 3600 + tOut[1] * 60 + (tOut[2] || 0);
          if (outSec > inSec) totalSeconds += outSec - inSec;
        }
      }
    }

    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);

    return {
      id: s.id,
      name: s.name,
      role: s.role ? s.role.toUpperCase() : "STUDENT",
      details:
        s.role === "faculty" || s.role === "admin"
          ? s.dept
          : `${s.grade} - ${s.section}`,
      ins: totalTimeIns,
      outs: totalTimeOuts,
      durationStr: `${hrs}h ${mins}m`,
      decimalHrs: (totalSeconds / 3600).toFixed(2),
    };
  });

  if (q) {
    processed = processed.filter(
      (item) =>
        item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
    );
  }
  return processed;
}

export const DEMO_STUDENTS: Member[] = [
  {
    id: "2026-001",
    name: "Alice Johnson",
    distinction: "SHS",
    grade: "11",
    section: "Alpha",
    role: "student",
    dept: "—",
    designation: "—",
    photo: "",
  },
  {
    id: "2026-002",
    name: "Bob Smith",
    distinction: "SHS",
    grade: "12",
    section: "Alpha",
    role: "student",
    dept: "—",
    designation: "—",
    photo: "",
  },
  {
    id: "2026-003",
    name: "Charlie Davis",
    distinction: "Tertiary",
    grade: "1st Year",
    section: "BSCS-1A",
    role: "student",
    dept: "—",
    designation: "—",
    photo: "",
  },
  {
    id: "2026-101",
    name: "Dr. Alan Grant",
    distinction: "Faculty",
    grade: "—",
    section: "—",
    role: "faculty",
    dept: "Paleontology",
    designation: "Professor",
    photo: "",
  },
  {
    id: "2026-999",
    name: "Eve Masterson",
    distinction: "Admin",
    grade: "—",
    section: "—",
    role: "admin",
    dept: "Systems",
    designation: "IT Head",
    photo: "",
  },
];
