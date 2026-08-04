export type Role = "student" | "faculty" | "admin";
export type ScanMode = "in" | "out" | "class" | "event" | "library";
export type AttendanceStatus = "Present" | "Late" | "Excused" | "Absent";
export type ThresholdMode = "strict" | "open";
export type TimeFormat = "12h" | "24h";
export type ViewId = "scanner" | "summary" | "analytics" | "admin";
export type SummaryView = "general" | "class" | "event" | "library";
export type ToastType = "success" | "error" | "warning" | "info";
export type EventCategory =
  | "event"
  | "library"
  | "lab"
  | "office"
  | "clinic"
  | "other";

export interface Settings {
  lateTime: string;
  timeoutTime: string;
  thresholdMode: ThresholdMode;
  /** Display / export time format (storage stays 24h) */
  timeFormat: TimeFormat;
  /** Last selected kiosk event (session convenience) */
  currentEventId?: string;
}

/** Admin-created venue / activity for kiosk scanning */
export interface AttendanceEvent {
  id: string;
  name: string;
  category: EventCategory;
  location: string;
  description: string;
  active: boolean;
  createdAt: string;
}

/** Admin-created subject + classroom/section for Class Session scanning */
export interface AttendanceClass {
  id: string;
  name: string;
  section: string;
  description: string;
  active: boolean;
  createdAt: string;
}

export interface Member {
  id: string;
  name: string;
  role: Role;
  distinction: string;
  /** Optional organization membership label per role */
  membership?: string;
  grade: string;
  section: string;
  dept: string;
  designation: string;
  photo: string;
}

export interface ScanEntry {
  type: "in" | "out";
  time: string;
}

/** Time in / out scoped to one class or event (separate from campus gate) */
export interface SessionAttendance {
  timeIn: string;
  timeOut: string;
  scans: ScanEntry[];
}

export interface DayRecord {
  timeIn: string;
  timeOut: string;
  status: AttendanceStatus;
  scans: ScanEntry[];
  /** class id (or legacy subject label) → session in/out */
  classes: Record<string, SessionAttendance>;
  /** event id → session in/out */
  events: Record<string, SessionAttendance>;
  /** School library visit (not an admin event) */
  library: SessionAttendance;
}

export interface AppDb {
  settings: Settings;
  students: Member[];
  events: AttendanceEvent[];
  classes: AttendanceClass[];
  logs: Record<string, Record<string, DayRecord>>;
}

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  type: ToastType;
}

export interface AnalyticsRow {
  id: string;
  name: string;
  role: string;
  details: string;
  ins: number;
  outs: number;
  durationStr: string;
  decimalHrs: string;
}

export const EVENT_CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: "event", label: "Campus Event" },
  { value: "library", label: "Library" },
  { value: "lab", label: "Laboratory" },
  { value: "office", label: "Office / Admin" },
  { value: "clinic", label: "Clinic / Health" },
  { value: "other", label: "Other" },
];

export const DEFAULT_SETTINGS: Settings = {
  lateTime: "08:00",
  timeoutTime: "16:00",
  thresholdMode: "strict",
  timeFormat: "12h",
  currentEventId: "",
};

export const EMPTY_DB: AppDb = {
  settings: { ...DEFAULT_SETTINGS },
  students: [],
  events: [],
  classes: [],
  logs: {},
};

export function emptySessionAttendance(): SessionAttendance {
  return { timeIn: "", timeOut: "", scans: [] };
}

export function emptyDayRecord(): DayRecord {
  return {
    timeIn: "",
    timeOut: "",
    status: "Absent",
    scans: [],
    classes: {},
    events: {},
    library: emptySessionAttendance(),
  };
}

export function classLabel(c: Pick<AttendanceClass, "name" | "section">) {
  return c.section ? `${c.name} · ${c.section}` : c.name;
}

export function categoryLabel(category: EventCategory) {
  return EVENT_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
