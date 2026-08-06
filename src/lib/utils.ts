import type {
  AnalyticsRow,
  AppDb,
  AttendanceStatus,
  DayRecord,
  Member,
  Settings,
  TimeFormat,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";

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

/** Term requirement: students must log 3 hours in the School Library. */
export const LIBRARY_REQUIRED_HOURS = 3;
export const LIBRARY_REQUIRED_SECONDS = LIBRARY_REQUIRED_HOURS * 3600;

export function parseTimeToSeconds(value: string | null | undefined): number | null {
  if (!value || value === "—") return null;
  const [h, m, s] = String(value).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 3600 + m * 60 + (Number.isFinite(s) ? s : 0);
}

export function formatDurationSeconds(totalSeconds: number): {
  durationStr: string;
  decimalHrs: string;
} {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  return {
    durationStr: `${hrs}h ${mins}m`,
    decimalHrs: (safe / 3600).toFixed(2),
  };
}

/**
 * Count ins/outs and accumulate completed in→out visit durations.
 * Uses the scans timeline when present (supports multiple library visits per day).
 */
export function countSessionAttendance(session: {
  timeIn?: string;
  timeOut?: string;
  scans?: { type: "in" | "out"; time: string }[];
}): { ins: number; outs: number; seconds: number; visits: number } {
  let ins = 0;
  let outs = 0;
  let seconds = 0;
  let visits = 0;

  if (session.scans && session.scans.length > 0) {
    let openIn: number | null = null;
    for (const scan of session.scans) {
      const sec = parseTimeToSeconds(scan.time);
      if (scan.type === "in") {
        ins++;
        openIn = sec;
      } else if (scan.type === "out") {
        outs++;
        if (openIn !== null && sec !== null && sec > openIn) {
          seconds += sec - openIn;
          visits++;
        }
        openIn = null;
      }
    }
    return { ins, outs, seconds, visits };
  }

  if (session.timeIn) ins++;
  if (session.timeOut) outs++;
  const inSec = parseTimeToSeconds(session.timeIn || "");
  const outSec = parseTimeToSeconds(session.timeOut || "");
  if (inSec !== null && outSec !== null && outSec > inSec) {
    seconds = outSec - inSec;
    visits = 1;
  }
  return { ins, outs, seconds, visits };
}

export function libraryRequirementProgress(totalSeconds: number): {
  requiredHours: number;
  remainingSeconds: number;
  remainingStr: string;
  percent: number;
  met: boolean;
} {
  const remainingSeconds = Math.max(0, LIBRARY_REQUIRED_SECONDS - totalSeconds);
  const { durationStr: remainingStr } = formatDurationSeconds(remainingSeconds);
  const percent = Math.min(
    100,
    Math.round((totalSeconds / LIBRARY_REQUIRED_SECONDS) * 100)
  );
  return {
    requiredHours: LIBRARY_REQUIRED_HOURS,
    remainingSeconds,
    remainingStr,
    percent,
    met: totalSeconds >= LIBRARY_REQUIRED_SECONDS,
  };
}

/** Add calendar months to a YYYY-MM-DD date (clamps day when needed). */
export function addMonthsToDateStr(startDate: string, months: number): string {
  const parts = startDate.split("-").map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return "";
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return "";
  const targetMonth = dt.getMonth() + months;
  const target = new Date(dt.getFullYear(), targetMonth, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate();
  target.setDate(Math.min(d, lastDay));
  // End date is exclusive at midnight of this day conceptually — store as last inclusive day (day before)
  // For "lasts N months from start", end = start + N months - 1 day
  target.setDate(target.getDate() - 1);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

export function getTermWindow(settings: {
  termStartDate?: string;
  termMonths?: number;
}): { start: string; end: string } | null {
  const start = (settings.termStartDate || "").trim();
  const months = Number(settings.termMonths);
  if (!start || !Number.isFinite(months) || months <= 0) return null;
  const end = addMonthsToDateStr(start, months);
  if (!end) return null;
  return { start, end };
}

export function isDateInTerm(
  dateStr: string,
  settings: { termStartDate?: string; termMonths?: number }
): boolean {
  const window = getTermWindow(settings);
  if (!window) return true; // no term declared → count all dates
  return dateStr >= window.start && dateStr <= window.end;
}

/** YYYY-MM-DD → M/D/YYYY (e.g. 8/6/2026) */
export function formatShortDate(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return dateStr;
  const [y, m, d] = parts;
  return `${m}/${d}/${y}`;
}

/** YYYY-MM-DD → MM/DD (e.g. 07/20) */
export function formatMonthDay(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return dateStr;
  const [, m, d] = parts;
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function weekdayShort(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return "";
  const [y, m, d] = parts;
  return WEEKDAY_SHORT[new Date(y, m - 1, d).getDay()] || "";
}

/** Inclusive YYYY-MM-DD range as calendar days. */
export function enumerateDatesInclusive(start: string, end: string): string[] {
  const partsS = start.split("-").map(Number);
  const partsE = end.split("-").map(Number);
  if (
    partsS.length < 3 ||
    partsE.length < 3 ||
    partsS.some((n) => !Number.isFinite(n)) ||
    partsE.some((n) => !Number.isFinite(n))
  ) {
    return [];
  }
  const cur = new Date(partsS[0], partsS[1] - 1, partsS[2]);
  const last = new Date(partsE[0], partsE[1] - 1, partsE[2]);
  if (cur > last) return [];
  const out: string[] = [];
  while (cur <= last) {
    out.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`,
    );
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * Calendar span for attendance matrix columns.
 * Prefer configured term; otherwise first→last log date (fallback: today).
 */
export function getAttendanceDateSpan(
  logs: Record<string, unknown>,
  settings: { termStartDate?: string; termMonths?: number },
  fallbackDate: string,
): { start: string; end: string; dates: string[] } {
  const term = getTermWindow(settings);
  if (term) {
    return {
      start: term.start,
      end: term.end,
      dates: enumerateDatesInclusive(term.start, term.end),
    };
  }
  const keys = Object.keys(logs || {}).sort();
  const start = keys[0] || fallbackDate;
  const end = keys[keys.length - 1] || fallbackDate;
  return { start, end, dates: enumerateDatesInclusive(start, end) };
}

export const ATTENDANCE_LETTER: Record<AttendanceStatus, "P" | "A" | "L" | "E"> =
  {
    Present: "P",
    Absent: "A",
    Late: "L",
    Excused: "E",
  };

export const ATTENDANCE_POINTS: Record<AttendanceStatus, number> = {
  Present: 1,
  Absent: 0,
  Late: 0.75,
  Excused: 0.5,
};

/** True when at least one member has campus activity that day (a class day). */
export function dayHasCampusAttendance(
  dayLogs: Record<string, DayRecord> | undefined
): boolean {
  if (!dayLogs) return false;
  return Object.values(dayLogs).some((r) => {
    if (!r) return false;
    if (r.scans?.length) return true;
    if (r.timeIn && r.timeIn !== "—" && r.timeIn !== "") return true;
    if (
      r.status === "Present" ||
      r.status === "Late" ||
      r.status === "Excused"
    ) {
      return true;
    }
    return false;
  });
}

export function formatTermLabel(settings: {
  termName?: string;
  termStartDate?: string;
  termMonths?: number;
}): string {
  const name = (settings.termName || "").trim();
  const window = getTermWindow(settings);
  if (!window) return name || "No term declared";
  const range = `${window.start} → ${window.end}`;
  return name ? `${name} (${range})` : range;
}

const TERM_SETTINGS_KEY = "attendx_term_settings_v1";

export function readLocalTermSettings(): Pick<
  Settings,
  "termName" | "termStartDate" | "termMonths"
> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TERM_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      termName?: string;
      termStartDate?: string;
      termMonths?: number;
    };
    return {
      termName: parsed.termName || "",
      termStartDate: parsed.termStartDate || "",
      termMonths:
        Number.isFinite(Number(parsed.termMonths)) && Number(parsed.termMonths) > 0
          ? Number(parsed.termMonths)
          : DEFAULT_SETTINGS.termMonths,
    };
  } catch {
    return null;
  }
}

export function writeLocalTermSettings(
  settings: Pick<Settings, "termName" | "termStartDate" | "termMonths">
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      TERM_SETTINGS_KEY,
      JSON.stringify({
        termName: settings.termName || "",
        termStartDate: settings.termStartDate || "",
        termMonths: settings.termMonths ?? DEFAULT_SETTINGS.termMonths,
      })
    );
  } catch {
    /* ignore */
  }
}

export type CutoffTarget = "gate" | "class" | "event";

export function getTargetCutoffs(
  settings: Settings,
  target: CutoffTarget
): { lateTime: string; timeoutTime: string } {
  if (target === "class") {
    return {
      lateTime: settings.classLateTime || settings.lateTime || DEFAULT_SETTINGS.classLateTime!,
      timeoutTime:
        settings.classTimeoutTime ||
        settings.timeoutTime ||
        DEFAULT_SETTINGS.classTimeoutTime!,
    };
  }
  if (target === "event") {
    return {
      lateTime: settings.eventLateTime || settings.lateTime || DEFAULT_SETTINGS.eventLateTime!,
      timeoutTime:
        settings.eventTimeoutTime ||
        settings.timeoutTime ||
        DEFAULT_SETTINGS.eventTimeoutTime!,
    };
  }
  return {
    lateTime: settings.lateTime || DEFAULT_SETTINGS.lateTime,
    timeoutTime: settings.timeoutTime || DEFAULT_SETTINGS.timeoutTime,
  };
}

const CUTOFF_SETTINGS_KEY = "attendx_target_cutoffs_v1";

export function readLocalCutoffSettings(): Pick<
  Settings,
  | "classLateTime"
  | "classTimeoutTime"
  | "eventLateTime"
  | "eventTimeoutTime"
> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CUTOFF_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    return {
      classLateTime: parsed.classLateTime || DEFAULT_SETTINGS.classLateTime,
      classTimeoutTime:
        parsed.classTimeoutTime || DEFAULT_SETTINGS.classTimeoutTime,
      eventLateTime: parsed.eventLateTime || DEFAULT_SETTINGS.eventLateTime,
      eventTimeoutTime:
        parsed.eventTimeoutTime || DEFAULT_SETTINGS.eventTimeoutTime,
    };
  } catch {
    return null;
  }
}

export function writeLocalCutoffSettings(
  settings: Pick<
    Settings,
    | "classLateTime"
    | "classTimeoutTime"
    | "eventLateTime"
    | "eventTimeoutTime"
  >
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      CUTOFF_SETTINGS_KEY,
      JSON.stringify({
        classLateTime:
          settings.classLateTime || DEFAULT_SETTINGS.classLateTime,
        classTimeoutTime:
          settings.classTimeoutTime || DEFAULT_SETTINGS.classTimeoutTime,
        eventLateTime:
          settings.eventLateTime || DEFAULT_SETTINGS.eventLateTime,
        eventTimeoutTime:
          settings.eventTimeoutTime || DEFAULT_SETTINGS.eventTimeoutTime,
      })
    );
  } catch {
    /* ignore */
  }
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
