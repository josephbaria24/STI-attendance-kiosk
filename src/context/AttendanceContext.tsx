"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { playAudioNotif, resumeAudio } from "@/lib/audio";
import { DEMO_STUDENTS, formatDisplayTime, formatNowTime, getTargetCutoffs, getTodayStr } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  createEventRow,
  createClassRow,
  deleteClassRow,
  deleteEventRow,
  deleteMember,
  emptyRemoteDb,
  factoryResetRemote,
  fetchAppState,
  insertClassScan,
  insertEventScan,
  insertLibraryScan,
  persistGateDay,
  saveSettings,
  updateClassRow,
  updateDayStatus,
  updateEventRow,
  upsertMember,
  upsertMembers,
} from "@/lib/supabase/repository";
import type {
  AppDb,
  AttendanceClass,
  AttendanceEvent,
  AttendanceStatus,
  DayRecord,
  EventCategory,
  Member,
  Role,
  ScanMode,
  Settings,
  SummaryView,
  ToastItem,
  ToastType,
  ViewId,
} from "@/lib/types";
import {
  EMPTY_DB,
  classLabel,
  emptyDayRecord,
  emptySessionAttendance,
} from "@/lib/types";

export interface ScanNotification {
  student: Member;
  mode: ScanMode;
  timeStr: string;
  status: AttendanceStatus;
  customHeader?: string | null;
}

interface StatusModalState {
  id: string;
  name: string;
  status: AttendanceStatus;
  dateStr: string;
}

interface AttendanceContextValue {
  ready: boolean;
  db: AppDb;
  view: ViewId;
  setView: (v: ViewId) => void;
  summaryView: SummaryView;
  setSummaryView: (v: SummaryView) => void;
  scanMode: ScanMode;
  setScanMode: (m: ScanMode) => void;
  classSubject: string;
  setClassSubject: (s: string) => void;
  /** Time In / Out direction for class, library & event sessions (gate uses scanMode) */
  sessionIo: "in" | "out";
  setSessionIo: (d: "in" | "out") => void;
  currentEventId: string;
  setCurrentEventId: (id: string) => void;
  consoleLogs: string[];
  logConsole: (msg: string) => void;
  toasts: ToastItem[];
  showToast: (title: string, message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;
  scanNotif: ScanNotification | null;
  closeScanNotif: () => void;
  statusModal: StatusModalState | null;
  openStatusModal: (s: StatusModalState) => void;
  closeStatusModal: () => void;
  saveStatusOverride: (newStatus: AttendanceStatus) => Promise<void>;
  persist: (next: AppDb) => Promise<void>;
  updateSettings: (partial: Partial<Settings>) => Promise<void>;
  processAttendanceRecord: (studentId: string) => Promise<void>;
  registerMember: (
    member: Omit<Member, "photo"> & { photo?: string }
  ) => Promise<boolean>;
  removeMember: (id: string) => Promise<void>;
  uploadPhoto: (id: string, dataUrl: string) => Promise<void>;
  removePhoto: (id: string) => Promise<void>;
  importRoster: (items: Member[]) => Promise<void>;
  loadDemoData: () => Promise<void>;
  factoryReset: () => Promise<void>;
  createEvent: (input: {
    name: string;
    category: EventCategory;
    location?: string;
    description?: string;
    active?: boolean;
  }) => Promise<boolean>;
  updateEvent: (
    id: string,
    patch: Partial<Omit<AttendanceEvent, "id" | "createdAt">>
  ) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  createClass: (input: {
    name: string;
    section?: string;
    description?: string;
    active?: boolean;
  }) => Promise<boolean>;
  updateClass: (
    id: string,
    patch: Partial<Omit<AttendanceClass, "id" | "createdAt">>
  ) => Promise<void>;
  deleteClass: (id: string) => Promise<void>;
  clock: { time: string; date: string };
}

const AttendanceContext = createContext<AttendanceContextValue | null>(null);

function errMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e) {
    const msg = String((e as { message: string }).message);
    const code =
      "code" in e ? String((e as { code?: string }).code || "") : "";
    if (
      code === "PGRST205" ||
      /could not find the table/i.test(msg) ||
      /schema cache/i.test(msg)
    ) {
      if (/library_attendance/i.test(msg)) {
        return "Missing public.library_attendance. Run supabase/library.sql in the Supabase SQL Editor, then retry.";
      }
      if (/event_attendance|public\.events/i.test(msg)) {
        return "Missing event tables. Run supabase/events.sql in the Supabase SQL Editor, then retry.";
      }
      if (/class_attendance|public\.classes/i.test(msg)) {
        return "Missing class tables. Run supabase/classes.sql in the Supabase SQL Editor, then retry.";
      }
      return `${msg} — Apply the matching file from /supabase in the SQL Editor.`;
    }
    return msg;
  }
  return String(e);
}

/** Library re-scan cooldown (prevents accidental double scans). */
const LIBRARY_RESCAN_MS = 60_000;

function libraryScanTimeToMs(timeStr: string, now: Date): number {
  const parts = timeStr.trim().split(":").map((p) => Number(p));
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return NaN;
  const d = new Date(now);
  d.setHours(parts[0], parts[1], parts[2] || 0, 0);
  return d.getTime();
}

const UI_STATE_KEY = "attendx_ui_state_v1";

type PersistedUiState = {
  view?: ViewId;
  summaryView?: SummaryView;
  scanMode?: ScanMode;
  sessionIo?: "in" | "out";
  classSubject?: string;
};

function readPersistedUi(): PersistedUiState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedUiState;
  } catch {
    return {};
  }
}

function writePersistedUi(patch: PersistedUiState) {
  if (typeof window === "undefined") return;
  try {
    const next = { ...readPersistedUi(), ...patch };
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

function initialView(): ViewId {
  const v = readPersistedUi().view;
  if (v === "scanner" || v === "summary" || v === "analytics" || v === "admin") {
    return v;
  }
  return "scanner";
}

function initialSummaryView(): SummaryView {
  const v = readPersistedUi().summaryView;
  if (v === "general" || v === "class" || v === "event" || v === "library")
    return v;
  return "general";
}

function initialScanMode(): ScanMode {
  const v = readPersistedUi().scanMode;
  if (
    v === "in" ||
    v === "out" ||
    v === "class" ||
    v === "event" ||
    v === "library"
  )
    return v;
  return "in";
}

function initialSessionIo(): "in" | "out" {
  const v = readPersistedUi().sessionIo;
  if (v === "in" || v === "out") return v;
  return "in";
}

function initialClassSubject(): string {
  return readPersistedUi().classSubject || "";
}

export function AttendanceProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [db, setDb] = useState<AppDb>(EMPTY_DB);
  const [view, setViewState] = useState<ViewId>(initialView);
  const [summaryView, setSummaryViewState] = useState<SummaryView>(initialSummaryView);
  const [scanMode, setScanModeState] = useState<ScanMode>(initialScanMode);
  const [classSubject, setClassSubjectState] = useState(initialClassSubject);
  const [sessionIo, setSessionIoState] = useState<"in" | "out">(initialSessionIo);
  const [currentEventId, setCurrentEventIdState] = useState("");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    "System ready... Waiting for scans.",
  ]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [scanNotif, setScanNotif] = useState<ScanNotification | null>(null);
  const [statusModal, setStatusModal] = useState<StatusModalState | null>(null);
  const [clock, setClock] = useState({ time: "00:00:00", date: "Loading..." });

  const dbRef = useRef(db);
  const scanModeRef = useRef(scanMode);
  const classSubjectRef = useRef(classSubject);
  const sessionIoRef = useRef(sessionIo);
  const currentEventIdRef = useRef(currentEventId);
  const scanNotifTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);
  useEffect(() => {
    scanModeRef.current = scanMode;
  }, [scanMode]);
  useEffect(() => {
    classSubjectRef.current = classSubject;
  }, [classSubject]);
  useEffect(() => {
    sessionIoRef.current = sessionIo;
  }, [sessionIo]);
  useEffect(() => {
    currentEventIdRef.current = currentEventId;
  }, [currentEventId]);

  const showToast = useCallback(
    (title: string, message: string, type: ToastType = "success") => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, title, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const applyLocal = useCallback((next: AppDb) => {
    setDb(next);
    dbRef.current = next;
  }, []);

  // Local-only shape update (remote writes happen in each action)
  const persist = useCallback(
    async (next: AppDb) => {
      applyLocal(next);
    },
    [applyLocal]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!isSupabaseConfigured()) {
          showToast(
            "Supabase Not Configured",
            "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local",
            "error"
          );
          if (!cancelled) setReady(true);
          return;
        }
        const loaded = await fetchAppState();
        if (cancelled) return;
        applyLocal(loaded);
        setCurrentEventIdState(loaded.settings.currentEventId || "");
        setConsoleLogs((prev) => [
          `[sync] Connected to database — ${loaded.students.length} members loaded.`,
          ...prev,
        ]);
      } catch (e) {
        console.error(e);
        showToast("Database Load Failed", errMsg(e), "error");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyLocal, showToast]);

  useEffect(() => {
    const format = db.settings.timeFormat || "12h";
    const tick = () => {
      const now = new Date();
      setClock({
        time: formatNowTime(now, format),
        date: now.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [db.settings.timeFormat]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const logConsole = useCallback((msg: string) => {
    const format = dbRef.current.settings.timeFormat || "12h";
    const time = formatNowTime(new Date(), format);
    setConsoleLogs((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 80));
  }, []);

  const closeScanNotif = useCallback(() => {
    if (scanNotifTimer.current) clearTimeout(scanNotifTimer.current);
    setScanNotif(null);
  }, []);

  const showScanNotification = useCallback((payload: ScanNotification) => {
    setScanNotif(payload);
    if (scanNotifTimer.current) clearTimeout(scanNotifTimer.current);
    scanNotifTimer.current = setTimeout(() => setScanNotif(null), 3000);
  }, []);

  const setView = useCallback((v: ViewId) => {
    setViewState(v);
    writePersistedUi({ view: v });
  }, []);

  const setSummaryView = useCallback((v: SummaryView) => {
    setSummaryViewState(v);
    writePersistedUi({ summaryView: v });
  }, []);

  const setScanMode = useCallback(
    (m: ScanMode) => {
      setScanModeState(m);
      writePersistedUi({ scanMode: m });
      logConsole(`Mode switched to: ${m.toUpperCase()}`);
    },
    [logConsole]
  );

  const setSessionIo = useCallback((d: "in" | "out") => {
    setSessionIoState(d);
    writePersistedUi({ sessionIo: d });
  }, []);

  const setClassSubject = useCallback((s: string) => {
    setClassSubjectState(s);
    writePersistedUi({ classSubject: s });
  }, []);

  const updateSettings = useCallback(
    async (partial: Partial<Settings>) => {
      const next = {
        ...dbRef.current,
        settings: { ...dbRef.current.settings, ...partial },
      };
      try {
        await saveSettings(next.settings);
        applyLocal(next);
        const mode = next.settings.thresholdMode;
        const tf = next.settings.timeFormat || "12h";
        const keys = Object.keys(partial);
        const termKeys = ["termName", "termStartDate", "termMonths"];
        const cutoffKeys = [
          "lateTime",
          "timeoutTime",
          "classLateTime",
          "classTimeoutTime",
          "eventLateTime",
          "eventTimeoutTime",
        ];
        if (partial.timeFormat && keys.length === 1) {
          showToast(
            "Time Format Updated",
            tf === "12h"
              ? "Using 12-hour clock (AM/PM) across pages and exports."
              : "Using 24-hour clock across pages and exports.",
            "success"
          );
        } else if (keys.every((k) => termKeys.includes(k))) {
          const name = (next.settings.termName || "").trim() || "Unnamed term";
          const start = next.settings.termStartDate || "—";
          const months = next.settings.termMonths ?? 4;
          showToast(
            "Term Updated",
            `${name} · starts ${start} · ${months} month${months === 1 ? "" : "s"}`,
            "success"
          );
        } else if (keys.every((k) => cutoffKeys.includes(k))) {
          showToast(
            "Target Cutoffs Saved",
            "Per-target Time In / Time Out thresholds updated.",
            "success"
          );
        } else {
          showToast(
            "Operational Thresholds Saved",
            mode === "open"
              ? "Switched to Open Time Mode (Flexible hours)."
              : `Strict rules applied. In-Bound Cutoff: ${formatDisplayTime(next.settings.lateTime, tf)} | Out-Bound Cutoff: ${formatDisplayTime(next.settings.timeoutTime, tf)}`,
            "success"
          );
        }
      } catch (e) {
        showToast("Settings Sync Failed", errMsg(e), "error");
      }
    },
    [applyLocal, showToast]
  );

  const processAttendanceRecord = useCallback(
    async (studentId: string) => {
      resumeAudio();
      const current = dbRef.current;
      const student = current.students.find(
        (s) => String(s.id).toLowerCase() === String(studentId).toLowerCase()
      );
      if (!student) {
        logConsole(`ERROR: ID [${studentId}] not found.`);
        showToast(
          "Invalid ID",
          `Scanned ID (${studentId}) does not exist.`,
          "error"
        );
        playAudioNotif("error");
        return;
      }

      const today = getTodayStr();
      const logs = { ...current.logs };
      if (!logs[today]) logs[today] = {};

      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", { hour12: false });
      const tf = current.settings.timeFormat || "12h";
      const tShow = (t: string) => formatDisplayTime(t, tf);

      const dayRecord: DayRecord = {
        ...emptyDayRecord(),
        ...logs[today][student.id],
        scans: [...(logs[today][student.id]?.scans || [])],
        classes: Object.fromEntries(
          Object.entries(logs[today][student.id]?.classes || {}).map(
            ([k, v]) => [
              k,
              {
                timeIn: v.timeIn || "",
                timeOut: v.timeOut || "",
                scans: [...(v.scans || [])],
              },
            ]
          )
        ),
        events: Object.fromEntries(
          Object.entries(logs[today][student.id]?.events || {}).map(([k, v]) => [
            k,
            {
              timeIn: v.timeIn || "",
              timeOut: v.timeOut || "",
              scans: [...(v.scans || [])],
            },
          ])
        ),
        library: {
          timeIn: logs[today][student.id]?.library?.timeIn || "",
          timeOut: logs[today][student.id]?.library?.timeOut || "",
          scans: [...(logs[today][student.id]?.library?.scans || [])],
        },
      };

      const isStrict = current.settings.thresholdMode !== "open";
      let effectiveMode = scanModeRef.current;
      const io = sessionIoRef.current;

      try {
        if (effectiveMode === "event") {
          const eventId = currentEventIdRef.current;
          const eventDef = current.events.find(
            (e) => e.id === eventId && e.active
          );
          if (!eventId || !eventDef) {
            showToast(
              "No Event Selected",
              "Choose an active event or venue in the kiosk before scanning.",
              "warning"
            );
            playAudioNotif("error");
            return;
          }
          const session =
            dayRecord.events[eventId] || emptySessionAttendance();
          if (isStrict && io === "in" && session.timeIn) {
            playAudioNotif("duplicate");
            const overwrite = confirm(
              `${student.name} already timed IN to ${eventDef.name} at ${tShow(session.timeIn)}. Overwrite?`
            );
            if (!overwrite) return;
          }
          if (isStrict && io === "out" && session.timeOut) {
            playAudioNotif("duplicate");
            const overwrite = confirm(
              `${student.name} already timed OUT of ${eventDef.name} at ${tShow(session.timeOut)}. Overwrite?`
            );
            if (!overwrite) return;
          }
          const nextSession = {
            ...session,
            scans: [...session.scans, { type: io, time: timeStr }],
            timeIn: io === "in" ? timeStr : session.timeIn,
            timeOut: io === "out" ? timeStr : session.timeOut,
          };
          dayRecord.events[eventId] = nextSession;
          await insertEventScan({
            logDate: today,
            eventId,
            memberId: student.id,
            scanType: io,
            scannedAt: timeStr,
          });

          const eventCutoffs = getTargetCutoffs(current.settings, "event");
          let eventFlag = "";
          if (isStrict && io === "in" && timeStr > `${eventCutoffs.lateTime}:00`) {
            eventFlag = "LATE";
          } else if (
            isStrict &&
            io === "out" &&
            timeStr < `${eventCutoffs.timeoutTime}:00`
          ) {
            eventFlag = "EARLY OUT";
          }

          logConsole(
            eventFlag
              ? `EVENT ${io.toUpperCase()} (${eventFlag}): ${student.name} → ${eventDef.name}.`
              : `EVENT ${io.toUpperCase()}: ${student.name} → ${eventDef.name}.`
          );
          playAudioNotif("event", eventFlag === "LATE");
          showScanNotification({
            student,
            mode: "event",
            timeStr,
            status: "Present",
            customHeader: eventFlag
              ? `${eventDef.name.toUpperCase()} · TIME ${io.toUpperCase()} · ${eventFlag}`
              : `${eventDef.name.toUpperCase()} · TIME ${io.toUpperCase()}`,
          });
          logs[today][student.id] = dayRecord;
          applyLocal({ ...current, logs });
          return;
        }

        if (effectiveMode === "library") {
          const session = dayRecord.library || emptySessionAttendance();
          const lastLibScan = session.scans[session.scans.length - 1];
          if (lastLibScan) {
            const lastMs = libraryScanTimeToMs(lastLibScan.time, now);
            const elapsed = now.getTime() - lastMs;
            if (Number.isFinite(lastMs) && elapsed < LIBRARY_RESCAN_MS) {
              const waitSec = Math.max(
                1,
                Math.ceil((LIBRARY_RESCAN_MS - elapsed) / 1000)
              );
              playAudioNotif("duplicate");
              showToast(
                "Already Scanned",
                `${student.name} already scanned for School Library. Please wait ${waitSec}s before scanning again.`,
                "warning"
              );
              logConsole(
                `LIBRARY cooldown: ${student.name} must wait ${waitSec}s.`
              );
              return;
            }
          }

          // Auto In on first / re-entry scan; Auto Out on the next scan after cooldown
          const libIo: "in" | "out" =
            !lastLibScan || lastLibScan.type === "out" ? "in" : "out";

          const nextSession = {
            ...session,
            scans: [...session.scans, { type: libIo, time: timeStr }],
            timeIn: libIo === "in" ? timeStr : session.timeIn,
            // New visit clears previous out; out stamps the current visit
            timeOut: libIo === "in" ? "" : timeStr,
          };
          dayRecord.library = nextSession;
          await insertLibraryScan({
            logDate: today,
            memberId: student.id,
            scanType: libIo,
            scannedAt: timeStr,
          });
          logConsole(
            `LIBRARY ${libIo.toUpperCase()}: ${student.name} → School Library.`
          );
          playAudioNotif("library");
          showScanNotification({
            student,
            mode: "library",
            timeStr,
            status: "Present",
            customHeader: `SCHOOL LIBRARY · TIME ${libIo.toUpperCase()}`,
          });
          logs[today][student.id] = dayRecord;
          applyLocal({ ...current, logs });
          return;
        }

        if (effectiveMode === "class") {
          const classId = classSubjectRef.current.trim();
          if (!classId) {
            showToast(
              "Configuration Missing",
              "Select a subject / classroom before scanning.",
              "warning"
            );
            playAudioNotif("error");
            return;
          }
          const classDef = current.classes.find(
            (c) => c.id === classId && c.active
          );
          const subjectLabel = classDef
            ? classLabel(classDef)
            : classId;
          const session =
            dayRecord.classes[classId] || emptySessionAttendance();
          if (isStrict && io === "in" && session.timeIn) {
            playAudioNotif("duplicate");
            const overwrite = confirm(
              `${student.name} already timed IN to ${subjectLabel} at ${tShow(session.timeIn)}. Overwrite?`
            );
            if (!overwrite) return;
          }
          if (isStrict && io === "out" && session.timeOut) {
            playAudioNotif("duplicate");
            const overwrite = confirm(
              `${student.name} already timed OUT of ${subjectLabel} at ${tShow(session.timeOut)}. Overwrite?`
            );
            if (!overwrite) return;
          }
          const nextSession = {
            ...session,
            scans: [...session.scans, { type: io, time: timeStr }],
            timeIn: io === "in" ? timeStr : session.timeIn,
            timeOut: io === "out" ? timeStr : session.timeOut,
          };
          dayRecord.classes[classId] = nextSession;
          await insertClassScan({
            logDate: today,
            memberId: student.id,
            subject: subjectLabel,
            classId: classDef ? classDef.id : undefined,
            scanType: io,
            scannedAt: timeStr,
          });

          const classCutoffs = getTargetCutoffs(current.settings, "class");
          let classFlag = "";
          if (isStrict && io === "in" && timeStr > `${classCutoffs.lateTime}:00`) {
            classFlag = "LATE";
          } else if (
            isStrict &&
            io === "out" &&
            timeStr < `${classCutoffs.timeoutTime}:00`
          ) {
            classFlag = "EARLY OUT";
          }

          logConsole(
            classFlag
              ? `CLASS ${io.toUpperCase()} (${classFlag}): ${student.name} → ${subjectLabel}.`
              : `CLASS ${io.toUpperCase()}: ${student.name} → ${subjectLabel}.`
          );
          playAudioNotif("class", classFlag === "LATE");
          showScanNotification({
            student,
            mode: "class",
            timeStr,
            status: "Present",
            customHeader: classFlag
              ? `${subjectLabel.toUpperCase()} · TIME ${io.toUpperCase()} · ${classFlag}`
              : `${subjectLabel.toUpperCase()} · TIME ${io.toUpperCase()}`,
          });
          logs[today][student.id] = dayRecord;
          applyLocal({ ...current, logs });
          return;
        }

        if (!isStrict) {
          effectiveMode = dayRecord.scans.length % 2 === 0 ? "in" : "out";
        }

        let latestScan: { type: "in" | "out"; time: string } | undefined;

        if (effectiveMode === "in") {
          if (isStrict && dayRecord.timeIn) {
            playAudioNotif("duplicate");
            const overwrite = confirm(
              `Multiple Scans Detected.\n\n${student.name} has already checked IN today at ${tShow(dayRecord.timeIn)}.\n\nDo you want to overwrite this record with the current time (${tShow(timeStr)})?`
            );
            if (!overwrite) {
              logConsole(`Multiple scan dropped for ${student.name}.`);
              return;
            }
            dayRecord.timeIn = timeStr;
          } else if (!dayRecord.timeIn) {
            dayRecord.timeIn = timeStr;
          }

          latestScan = { type: "in", time: timeStr };
          dayRecord.scans.push(latestScan);
          const lateThreshold = `${current.settings.lateTime}:00`;

          if (isStrict && timeStr > lateThreshold) {
            dayRecord.status = "Late";
            logConsole(`SUCCESS: ${student.name} checked IN (LATE).`);
            playAudioNotif("in", true);
          } else {
            dayRecord.status = "Present";
            logConsole(`SUCCESS: ${student.name} checked IN.`);
            playAudioNotif("in", false);
          }
          showScanNotification({
            student,
            mode: "in",
            timeStr,
            status: dayRecord.status,
          });
        } else if (effectiveMode === "out") {
          if (isStrict && dayRecord.timeOut) {
            playAudioNotif("duplicate");
            const overwrite = confirm(
              `Multiple Scans Detected.\n\n${student.name} has already checked OUT today at ${tShow(dayRecord.timeOut)}.\n\nDo you want to overwrite this record with the current time (${tShow(timeStr)})?`
            );
            if (!overwrite) {
              logConsole(
                `Multiple scan check-out dropped for ${student.name}.`
              );
              return;
            }
          }

          dayRecord.timeOut = timeStr;
          latestScan = { type: "out", time: timeStr };
          dayRecord.scans.push(latestScan);
          const timeoutThreshold = `${current.settings.timeoutTime}:00`;

          if (isStrict && timeStr < timeoutThreshold) {
            logConsole(
              `SUCCESS: ${student.name} checked OUT (EARLY DEPARTURE).`
            );
          } else {
            logConsole(`SUCCESS: ${student.name} checked OUT.`);
          }

          if (dayRecord.status === "Absent") {
            dayRecord.status =
              isStrict && dayRecord.timeIn > `${current.settings.lateTime}:00`
                ? "Late"
                : "Present";
          }

          playAudioNotif("out");
          showScanNotification({
            student,
            mode: "out",
            timeStr,
            status: dayRecord.status,
          });
        }

        await persistGateDay(today, student.id, dayRecord, latestScan);
        logs[today][student.id] = dayRecord;
        applyLocal({ ...current, logs });
      } catch (e) {
        console.error(e);
        showToast("Scan Sync Failed", errMsg(e), "error");
        playAudioNotif("error");
      }
    },
    [applyLocal, logConsole, showScanNotification, showToast]
  );

  const registerMember = useCallback(
    async (member: Omit<Member, "photo"> & { photo?: string }) => {
      const current = dbRef.current;
      if (!member.id.trim() || !member.name.trim()) {
        showToast(
          "Validation Error",
          "Please fill in the ID and Full Name fields.",
          "error"
        );
        return false;
      }
      if (
        current.students.some(
          (s) => String(s.id).toLowerCase() === member.id.toLowerCase()
        )
      ) {
        showToast(
          "Duplicate Detected",
          "A member with this ID is already registered.",
          "error"
        );
        return false;
      }
      const full: Member = { ...member, photo: member.photo || "" };
      try {
        await upsertMember(full);
        const nextStudents = [...current.students, full].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        applyLocal({ ...current, students: nextStudents });
        showToast(
          "Registration Complete",
          `${member.name} has been enrolled as ${member.role.toUpperCase()}.`,
          "success"
        );
        return true;
      } catch (e) {
        showToast("Registration Failed", errMsg(e), "error");
        return false;
      }
    },
    [applyLocal, showToast]
  );

  const removeMember = useCallback(
    async (id: string) => {
      if (!confirm(`Remove member profile ${id}?`)) return;
      try {
        await deleteMember(id);
        const current = dbRef.current;
        applyLocal({
          ...current,
          students: current.students.filter((s) => s.id !== id),
        });
      } catch (e) {
        showToast("Delete Failed", errMsg(e), "error");
      }
    },
    [applyLocal, showToast]
  );

  const uploadPhoto = useCallback(
    async (id: string, dataUrl: string) => {
      const current = dbRef.current;
      const students = current.students.map((s) =>
        s.id === id ? { ...s, photo: dataUrl } : s
      );
      const member = students.find((s) => s.id === id);
      if (!member) return;
      try {
        await upsertMember(member);
        applyLocal({ ...current, students });
        showToast(
          "Profile Photo Synced",
          `Photo updated successfully for ${member.name}.`,
          "success"
        );
      } catch (e) {
        showToast("Photo Sync Failed", errMsg(e), "error");
      }
    },
    [applyLocal, showToast]
  );

  const removePhoto = useCallback(
    async (id: string) => {
      const current = dbRef.current;
      const member = current.students.find((s) => s.id === id);
      if (
        !member ||
        !confirm(
          `Are you sure you want to clear the profile photo for ${member.name}?`
        )
      )
        return;
      const updated = { ...member, photo: "" };
      try {
        await upsertMember(updated);
        applyLocal({
          ...current,
          students: current.students.map((s) => (s.id === id ? updated : s)),
        });
        showToast(
          "Photo Cleared",
          "Profile image cleared successfully.",
          "info"
        );
      } catch (e) {
        showToast("Photo Clear Failed", errMsg(e), "error");
      }
    },
    [applyLocal, showToast]
  );

  const importRoster = useCallback(
    async (items: Member[]) => {
      const current = dbRef.current;
      const map = new Map(current.students.map((s) => [s.id, s]));
      items.forEach((ns) => map.set(ns.id, ns));
      const students = Array.from(map.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      try {
        await upsertMembers(items);
        applyLocal({ ...current, students });
        showToast(
          "Roster Unified",
          "Parsed entry sets matched to system records.",
          "success"
        );
      } catch (e) {
        showToast("Import Failed", errMsg(e), "error");
      }
    },
    [applyLocal, showToast]
  );

  const loadDemoData = useCallback(async () => {
    try {
      await upsertMembers(DEMO_STUDENTS);
      applyLocal({ ...dbRef.current, students: [...DEMO_STUDENTS] });
      showToast(
        "Demo Sync complete",
        "Roster simulation populated.",
        "success"
      );
    } catch (e) {
      showToast("Demo Sync Failed", errMsg(e), "error");
    }
  }, [applyLocal, showToast]);

  const createEvent = useCallback(
    async (input: {
      name: string;
      category: EventCategory;
      location?: string;
      description?: string;
      active?: boolean;
    }) => {
      const name = input.name.trim();
      if (!name) {
        showToast("Validation Error", "Event name is required.", "error");
        return false;
      }
      const event: AttendanceEvent = {
        id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        category: input.category,
        location: (input.location || "").trim(),
        description: (input.description || "").trim(),
        active: input.active ?? true,
        createdAt: new Date().toISOString(),
      };
      try {
        await createEventRow(event);
        const current = dbRef.current;
        const events = [...(current.events || []), event].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        applyLocal({ ...current, events });
        showToast(
          "Event Created",
          `${event.name} is ready for kiosk selection.`,
          "success"
        );
        return true;
      } catch (e) {
        showToast(
          "Event Create Failed",
          `${errMsg(e)} — If events table is missing, run supabase/events.sql`,
          "error"
        );
        return false;
      }
    },
    [applyLocal, showToast]
  );

  const updateEvent = useCallback(
    async (
      id: string,
      patch: Partial<Omit<AttendanceEvent, "id" | "createdAt">>
    ) => {
      try {
        await updateEventRow(id, patch);
        const current = dbRef.current;
        const events = current.events.map((e) =>
          e.id === id ? { ...e, ...patch } : e
        );
        let nextSettings = current.settings;
        if (patch.active === false && current.settings.currentEventId === id) {
          nextSettings = { ...current.settings, currentEventId: "" };
          setCurrentEventIdState("");
          await saveSettings(nextSettings);
        }
        applyLocal({ ...current, events, settings: nextSettings });
        showToast("Event Updated", "Event details saved.", "success");
      } catch (e) {
        showToast("Event Update Failed", errMsg(e), "error");
      }
    },
    [applyLocal, showToast]
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      const current = dbRef.current;
      const target = current.events.find((e) => e.id === id);
      if (
        !target ||
        !confirm(
          `Delete event "${target.name}"? Scan history on event_attendance may cascade.`
        )
      )
        return;
      try {
        await deleteEventRow(id);
        const events = current.events.filter((e) => e.id !== id);
        let nextSettings = current.settings;
        if (current.settings.currentEventId === id) {
          nextSettings = { ...current.settings, currentEventId: "" };
          setCurrentEventIdState("");
          await saveSettings(nextSettings);
        }
        applyLocal({ ...current, events, settings: nextSettings });
        showToast("Event Removed", `${target.name} deleted.`, "warning");
      } catch (e) {
        showToast("Event Delete Failed", errMsg(e), "error");
      }
    },
    [applyLocal, showToast]
  );

  const createClass = useCallback(
    async (input: {
      name: string;
      section?: string;
      description?: string;
      active?: boolean;
    }) => {
      const name = input.name.trim();
      if (!name) {
        showToast("Missing Name", "Enter a subject / class name.", "warning");
        return false;
      }
      const section = (input.section || "").trim();
      const id = `cls_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const row: AttendanceClass = {
        id,
        name,
        section,
        description: (input.description || "").trim(),
        active: input.active !== false,
        createdAt: new Date().toISOString(),
      };
      try {
        await createClassRow(row);
        const current = dbRef.current;
        applyLocal({
          ...current,
          classes: [...current.classes, row].sort((a, b) =>
            `${a.section} ${a.name}`.localeCompare(`${b.section} ${b.name}`)
          ),
        });
        showToast("Class Added", classLabel(row), "success");
        return true;
      } catch (e) {
        showToast("Class Create Failed", errMsg(e), "error");
        return false;
      }
    },
    [applyLocal, showToast]
  );

  const updateClass = useCallback(
    async (
      id: string,
      patch: Partial<Omit<AttendanceClass, "id" | "createdAt">>
    ) => {
      try {
        await updateClassRow(id, patch);
        const current = dbRef.current;
        const classes = current.classes.map((c) =>
          c.id === id ? { ...c, ...patch } : c
        );
        applyLocal({ ...current, classes });
        showToast("Class Updated", "Class details saved.", "success");
      } catch (e) {
        showToast("Class Update Failed", errMsg(e), "error");
      }
    },
    [applyLocal, showToast]
  );

  const deleteClass = useCallback(
    async (id: string) => {
      const current = dbRef.current;
      const target = current.classes.find((c) => c.id === id);
      if (
        !target ||
        !confirm(`Delete class "${classLabel(target)}"?`)
      )
        return;
      try {
        await deleteClassRow(id);
        applyLocal({
          ...current,
          classes: current.classes.filter((c) => c.id !== id),
        });
        if (classSubjectRef.current === id) setClassSubject("");
        showToast("Class Removed", classLabel(target), "warning");
      } catch (e) {
        showToast("Class Delete Failed", errMsg(e), "error");
      }
    },
    [applyLocal, showToast]
  );

  const setCurrentEventId = useCallback(
    (id: string) => {
      setCurrentEventIdState(id);
      currentEventIdRef.current = id;
      const current = dbRef.current;
      const nextSettings = { ...current.settings, currentEventId: id };
      applyLocal({ ...current, settings: nextSettings });
      void saveSettings(nextSettings).catch((e) =>
        console.warn("current event save:", errMsg(e))
      );
      const evt = current.events.find((e) => e.id === id);
      if (evt) logConsole(`Current event set: ${evt.name}`);
    },
    [applyLocal, logConsole]
  );

  const factoryReset = useCallback(async () => {
    if (
      !confirm(
        "DANGER: This will wipe members, attendance, and events in Supabase. Proceed?"
      )
    )
      return;
    try {
      await factoryResetRemote();
      setCurrentEventIdState("");
      applyLocal(emptyRemoteDb());
      showToast("System Purged", "All remote attendance data cleared.", "warning");
    } catch (e) {
      showToast("Reset Failed", errMsg(e), "error");
    }
  }, [applyLocal, showToast]);

  const saveStatusOverride = useCallback(
    async (newStatus: AttendanceStatus) => {
      if (!statusModal) return;
      try {
        await updateDayStatus({
          logDate: statusModal.dateStr,
          memberId: statusModal.id,
          status: newStatus,
        });
        const current = dbRef.current;
        const logs = { ...current.logs };
        if (!logs[statusModal.dateStr]) logs[statusModal.dateStr] = {};
        const existing =
          logs[statusModal.dateStr][statusModal.id] || emptyDayRecord();
        logs[statusModal.dateStr][statusModal.id] = {
          ...emptyDayRecord(),
          ...existing,
          status: newStatus,
          events: existing.events || {},
          classes: existing.classes || {},
          library: existing.library || emptySessionAttendance(),
          scans: existing.scans || [],
        };
        applyLocal({ ...current, logs });
        setStatusModal(null);
        showToast(
          "Status Updated",
          `Manual override configured for Student ${statusModal.id}.`,
          "info"
        );
      } catch (e) {
        showToast("Status Update Failed", errMsg(e), "error");
      }
    },
    [applyLocal, showToast, statusModal]
  );

  const value = useMemo<AttendanceContextValue>(
    () => ({
      ready,
      db,
      view,
      setView,
      summaryView,
      setSummaryView,
      scanMode,
      setScanMode,
      classSubject,
      setClassSubject,
      sessionIo,
      setSessionIo,
      currentEventId,
      setCurrentEventId,
      consoleLogs,
      logConsole,
      toasts,
      showToast,
      dismissToast,
      scanNotif,
      closeScanNotif,
      statusModal,
      openStatusModal: setStatusModal,
      closeStatusModal: () => setStatusModal(null),
      saveStatusOverride,
      persist,
      updateSettings,
      processAttendanceRecord,
      registerMember,
      removeMember,
      uploadPhoto,
      removePhoto,
      importRoster,
      loadDemoData,
      factoryReset,
      createEvent,
      updateEvent,
      deleteEvent,
      createClass,
      updateClass,
      deleteClass,
      clock,
    }),
    [
      ready,
      db,
      view,
      setView,
      summaryView,
      setSummaryView,
      scanMode,
      setScanMode,
      classSubject,
      setClassSubject,
      sessionIo,
      setSessionIo,
      currentEventId,
      setCurrentEventId,
      consoleLogs,
      logConsole,
      toasts,
      showToast,
      dismissToast,
      scanNotif,
      closeScanNotif,
      statusModal,
      saveStatusOverride,
      persist,
      updateSettings,
      processAttendanceRecord,
      registerMember,
      removeMember,
      uploadPhoto,
      removePhoto,
      importRoster,
      loadDemoData,
      factoryReset,
      createEvent,
      updateEvent,
      deleteEvent,
      createClass,
      updateClass,
      deleteClass,
      clock,
    ]
  );

  return (
    <AttendanceContext.Provider value={value}>
      {children}
    </AttendanceContext.Provider>
  );
}

export function useAttendance() {
  const ctx = useContext(AttendanceContext);
  if (!ctx) throw new Error("useAttendance must be used within provider");
  return ctx;
}

export type { Role };
