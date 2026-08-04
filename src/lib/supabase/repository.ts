import type {
  AppDb,
  AttendanceClass,
  AttendanceEvent,
  AttendanceStatus,
  DayRecord,
  EventCategory,
  Member,
  Role,
  ScanEntry,
  SessionAttendance,
  Settings,
  ThresholdMode,
  TimeFormat,
} from "@/lib/types";
import {
  DEFAULT_SETTINGS,
  EMPTY_DB,
  emptyDayRecord,
  emptySessionAttendance,
} from "@/lib/types";
import { getSupabase } from "./client";
import { readLocalTimeFormat, writeLocalTimeFormat } from "@/lib/utils";

function timeToHHMM(value: string | null | undefined) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function timeToHHMMSS(value: string | null | undefined) {
  if (!value) return "";
  const v = String(value);
  if (v.length === 5) return `${v}:00`;
  return v.slice(0, 8);
}

function memberFromRow(row: {
  id: string;
  name: string;
  role: string;
  distinction: string;
  membership?: string;
  grade: string;
  section: string;
  dept: string;
  designation: string;
  photo_url: string;
}): Member {
  return {
    id: row.id,
    name: row.name,
    role: row.role as Role,
    distinction: row.distinction || "",
    membership: row.membership || "",
    grade: row.grade || "—",
    section: row.section || "—",
    dept: row.dept || "—",
    designation: row.designation || "—",
    photo: row.photo_url || "",
  };
}

function memberToRow(m: Member) {
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    distinction: m.distinction || "",
    membership: m.membership || "",
    grade: m.grade || "—",
    section: m.section || "—",
    dept: m.dept || "—",
    designation: m.designation || "—",
    photo_url: m.photo || "",
  };
}

function eventFromRow(row: {
  id: string;
  name: string;
  category: string;
  location: string;
  description: string;
  active: boolean;
  created_at: string;
}): AttendanceEvent {
  return {
    id: row.id,
    name: row.name,
    category: row.category as EventCategory,
    location: row.location || "",
    description: row.description || "",
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

function classFromRow(row: {
  id: string;
  name: string;
  section: string;
  description: string;
  active: boolean;
  created_at: string;
}): AttendanceClass {
  return {
    id: row.id,
    name: row.name,
    section: row.section || "",
    description: row.description || "",
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

function applySessionScan(
  session: SessionAttendance,
  scanType: "in" | "out",
  time: string
): SessionAttendance {
  const next = {
    ...session,
    scans: [...session.scans, { type: scanType, time }],
  };
  if (scanType === "in") next.timeIn = time;
  else next.timeOut = time;
  return next;
}

function ensureLogSlot(
  logs: AppDb["logs"],
  date: string,
  memberId: string
): DayRecord {
  if (!logs[date]) logs[date] = {};
  if (!logs[date][memberId]) logs[date][memberId] = emptyDayRecord();
  return logs[date][memberId];
}

export async function fetchAppState(): Promise<AppDb> {
  const sb = getSupabase();

  const [
    membersRes,
    settingsRes,
    daysRes,
    scansRes,
    classRes,
    eventsRes,
    eventAttRes,
    classesRes,
    libraryRes,
  ] = await Promise.all([
    sb.from("members").select("*").order("name"),
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("attendance_days").select("*"),
    sb.from("attendance_scans").select("*").order("scanned_at"),
    sb.from("class_attendance").select("*").order("scanned_at"),
    sb.from("events").select("*").order("name"),
    sb.from("event_attendance").select("*").order("scanned_at"),
    sb.from("classes").select("*").order("section").order("name"),
    sb.from("library_attendance").select("*").order("scanned_at"),
  ]);

  if (membersRes.error) throw membersRes.error;
  if (settingsRes.error) throw settingsRes.error;
  if (daysRes.error) throw daysRes.error;
  if (scansRes.error) throw scansRes.error;
  if (classRes.error) throw classRes.error;

  const eventsError = eventsRes.error;
  const eventAttError = eventAttRes.error;
  const classesError = classesRes.error;
  const libraryError = libraryRes.error;
  if (eventsError && !String(eventsError.message).includes("does not exist")) {
    console.warn("events:", eventsError.message);
  }
  if (eventAttError && !String(eventAttError.message).includes("does not exist")) {
    console.warn("event_attendance:", eventAttError.message);
  }
  if (classesError && !String(classesError.message).includes("does not exist")) {
    console.warn("classes:", classesError.message);
  }
  if (libraryError && !String(libraryError.message).includes("does not exist")) {
    console.warn("library_attendance:", libraryError.message);
  }

  const settingsRow = settingsRes.data;
  if (!settingsRow) {
    await saveSettings(DEFAULT_SETTINGS);
  }

  const settings: Settings = {
    lateTime: timeToHHMM(settingsRow?.late_time) || DEFAULT_SETTINGS.lateTime,
    timeoutTime:
      timeToHHMM(settingsRow?.timeout_time) || DEFAULT_SETTINGS.timeoutTime,
    thresholdMode:
      (settingsRow?.threshold_mode as ThresholdMode) ||
      DEFAULT_SETTINGS.thresholdMode,
    timeFormat:
      (settingsRow?.time_format as TimeFormat) ||
      readLocalTimeFormat() ||
      DEFAULT_SETTINGS.timeFormat,
    currentEventId: settingsRow?.current_event_id || "",
  };

  const students = (membersRes.data || []).map(memberFromRow);
  const events = (eventsRes.data || []).map(eventFromRow);
  const classes = (classesRes.data || []).map(classFromRow);

  const logs: AppDb["logs"] = {};

  for (const day of daysRes.data || []) {
    const date = String(day.log_date);
    const memberId = String(day.member_id);
    if (!logs[date]) logs[date] = {};
    logs[date][memberId] = {
      timeIn: timeToHHMMSS(day.time_in),
      timeOut: timeToHHMMSS(day.time_out),
      status: day.status as AttendanceStatus,
      scans: [],
      classes: {},
      events: {},
      library: emptySessionAttendance(),
    };
  }

  for (const scan of scansRes.data || []) {
    const date = String(scan.log_date);
    const memberId = String(scan.member_id);
    const slot = ensureLogSlot(logs, date, memberId);
    slot.scans.push({
      type: scan.scan_type as ScanEntry["type"],
      time: timeToHHMMSS(scan.scanned_at),
    });
  }

  for (const row of classRes.data || []) {
    const date = String(row.log_date);
    const memberId = String(row.member_id);
    const key = String(row.class_id || row.subject);
    const time = timeToHHMMSS(row.scanned_at);
    const scanType: "in" | "out" =
      row.scan_type === "out" ? "out" : row.scan_type === "in" ? "in" : "in";
    const slot = ensureLogSlot(logs, date, memberId);
    const prev = slot.classes[key] || emptySessionAttendance();
    // Legacy rows without scan_type: first stamp = in, later = out alternating
    const inferred: "in" | "out" =
      row.scan_type === "in" || row.scan_type === "out"
        ? scanType
        : prev.scans.length % 2 === 0
          ? "in"
          : "out";
    slot.classes[key] = applySessionScan(prev, inferred, time);
  }

  for (const row of eventAttRes.data || []) {
    const date = String(row.log_date);
    const memberId = String(row.member_id);
    const eventId = String(row.event_id);
    const time = timeToHHMMSS(row.scanned_at);
    const slot = ensureLogSlot(logs, date, memberId);
    const prev = slot.events[eventId] || emptySessionAttendance();
    const inferred: "in" | "out" =
      row.scan_type === "out"
        ? "out"
        : row.scan_type === "in"
          ? "in"
          : prev.scans.length % 2 === 0
            ? "in"
            : "out";
    slot.events[eventId] = applySessionScan(prev, inferred, time);
  }

  for (const row of libraryRes.data || []) {
    const date = String(row.log_date);
    const memberId = String(row.member_id);
    const time = timeToHHMMSS(row.scanned_at);
    const slot = ensureLogSlot(logs, date, memberId);
    const prev = slot.library || emptySessionAttendance();
    const inferred: "in" | "out" =
      row.scan_type === "out"
        ? "out"
        : row.scan_type === "in"
          ? "in"
          : prev.scans.length % 2 === 0
            ? "in"
            : "out";
    slot.library = applySessionScan(prev, inferred, time);
  }

  return { settings, students, events, classes, logs };
}

export async function saveSettings(settings: Settings) {
  const sb = getSupabase();
  if (settings.timeFormat) writeLocalTimeFormat(settings.timeFormat);
  const payload: Record<string, unknown> = {
    id: 1,
    late_time: timeToHHMMSS(settings.lateTime) || "08:00:00",
    timeout_time: timeToHHMMSS(settings.timeoutTime) || "16:00:00",
    threshold_mode: settings.thresholdMode,
    time_format: settings.timeFormat || "12h",
  };
  if (settings.currentEventId !== undefined) {
    payload.current_event_id = settings.currentEventId || null;
  }

  const { error } = await sb.from("settings").upsert(payload, { onConflict: "id" });
  if (error) {
    const msg = String(error.message);
    // Retry without optional columns if missing in older schemas
    if (msg.includes("current_event_id") || msg.includes("time_format")) {
      if (msg.includes("current_event_id")) delete payload.current_event_id;
      if (msg.includes("time_format")) delete payload.time_format;
      const retry = await sb.from("settings").upsert(payload, { onConflict: "id" });
      if (retry.error) {
        const msg2 = String(retry.error.message);
        if (msg2.includes("current_event_id") || msg2.includes("time_format")) {
          if (msg2.includes("current_event_id")) delete payload.current_event_id;
          if (msg2.includes("time_format")) delete payload.time_format;
          const retry2 = await sb
            .from("settings")
            .upsert(payload, { onConflict: "id" });
          if (retry2.error) throw retry2.error;
          return;
        }
        throw retry.error;
      }
      return;
    }
    throw error;
  }
}

export async function upsertMember(member: Member) {
  const sb = getSupabase();
  const row = memberToRow(member);
  const { error } = await sb.from("members").upsert(row, {
    onConflict: "id",
  });
  if (error) {
    if (String(error.message).includes("membership")) {
      const fallback = { ...row };
      delete (fallback as { membership?: string }).membership;
      const retry = await sb.from("members").upsert(fallback, {
        onConflict: "id",
      });
      if (retry.error) throw retry.error;
      return;
    }
    throw error;
  }
}

export async function upsertMembers(members: Member[]) {
  if (members.length === 0) return;
  const sb = getSupabase();
  const rows = members.map(memberToRow);
  const { error } = await sb.from("members").upsert(rows, {
    onConflict: "id",
  });
  if (error) {
    if (String(error.message).includes("membership")) {
      const fallback = rows.map((r) => {
        const copy = { ...r };
        delete (copy as { membership?: string }).membership;
        return copy;
      });
      const retry = await sb.from("members").upsert(fallback, {
        onConflict: "id",
      });
      if (retry.error) throw retry.error;
      return;
    }
    throw error;
  }
}

export async function deleteMember(id: string) {
  const sb = getSupabase();
  const { error } = await sb.from("members").delete().eq("id", id);
  if (error) throw error;
}

export async function ensureAttendanceDay(params: {
  logDate: string;
  memberId: string;
  timeIn?: string;
  timeOut?: string;
  status: AttendanceStatus;
}) {
  const sb = getSupabase();
  const { data: existing, error: findErr } = await sb
    .from("attendance_days")
    .select("id")
    .eq("log_date", params.logDate)
    .eq("member_id", params.memberId)
    .maybeSingle();
  if (findErr) throw findErr;

  const row = {
    log_date: params.logDate,
    member_id: params.memberId,
    time_in: params.timeIn ? timeToHHMMSS(params.timeIn) : null,
    time_out: params.timeOut ? timeToHHMMSS(params.timeOut) : null,
    status: params.status,
  };

  if (existing?.id) {
    const { data, error } = await sb
      .from("attendance_days")
      .update(row)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  const { data, error } = await sb
    .from("attendance_days")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function insertGateScan(params: {
  attendanceDayId: string;
  memberId: string;
  logDate: string;
  scanType: "in" | "out";
  scannedAt: string;
}) {
  const sb = getSupabase();
  const { error } = await sb.from("attendance_scans").insert({
    attendance_day_id: params.attendanceDayId,
    member_id: params.memberId,
    log_date: params.logDate,
    scan_type: params.scanType,
    scanned_at: timeToHHMMSS(params.scannedAt),
  });
  if (error) throw error;
}

export async function insertClassScan(params: {
  logDate: string;
  memberId: string;
  subject: string;
  classId?: string;
  scanType: "in" | "out";
  scannedAt: string;
}) {
  const sb = getSupabase();
  const payload: Record<string, unknown> = {
    log_date: params.logDate,
    member_id: params.memberId,
    subject: params.subject,
    scanned_at: timeToHHMMSS(params.scannedAt),
    scan_type: params.scanType,
  };
  if (params.classId) payload.class_id = params.classId;

  const { error } = await sb.from("class_attendance").insert(payload);
  if (error) {
    // Fallback if classes.sql (scan_type / class_id) not applied yet
    if (
      String(error.message).includes("scan_type") ||
      String(error.message).includes("class_id")
    ) {
      const retry = await sb.from("class_attendance").insert({
        log_date: params.logDate,
        member_id: params.memberId,
        subject: params.subject,
        scanned_at: timeToHHMMSS(params.scannedAt),
      });
      if (retry.error) throw retry.error;
      return;
    }
    throw error;
  }
}

export async function insertEventScan(params: {
  logDate: string;
  eventId: string;
  memberId: string;
  scanType: "in" | "out";
  scannedAt: string;
}) {
  const sb = getSupabase();
  const payload: Record<string, unknown> = {
    log_date: params.logDate,
    event_id: params.eventId,
    member_id: params.memberId,
    scanned_at: timeToHHMMSS(params.scannedAt),
    scan_type: params.scanType,
  };
  const { error } = await sb.from("event_attendance").insert(payload);
  if (error) {
    if (String(error.message).includes("scan_type")) {
      const retry = await sb.from("event_attendance").insert({
        log_date: params.logDate,
        event_id: params.eventId,
        member_id: params.memberId,
        scanned_at: timeToHHMMSS(params.scannedAt),
      });
      if (retry.error) throw retry.error;
      return;
    }
    throw error;
  }
}

export async function insertLibraryScan(params: {
  logDate: string;
  memberId: string;
  scanType: "in" | "out";
  scannedAt: string;
}) {
  const sb = getSupabase();
  const { error } = await sb.from("library_attendance").insert({
    log_date: params.logDate,
    member_id: params.memberId,
    scan_type: params.scanType,
    scanned_at: timeToHHMMSS(params.scannedAt),
  });
  if (error) throw error;
}

export async function updateDayStatus(params: {
  logDate: string;
  memberId: string;
  status: AttendanceStatus;
}) {
  const dayId = await ensureAttendanceDay({
    logDate: params.logDate,
    memberId: params.memberId,
    status: params.status,
  });
  const sb = getSupabase();
  const { error } = await sb
    .from("attendance_days")
    .update({ status: params.status })
    .eq("id", dayId);
  if (error) throw error;
}

export async function createEventRow(event: AttendanceEvent) {
  const sb = getSupabase();
  const { error } = await sb.from("events").insert({
    id: event.id,
    name: event.name,
    category: event.category,
    location: event.location,
    description: event.description,
    active: event.active,
    created_at: event.createdAt,
  });
  if (error) throw error;
}

export async function updateEventRow(
  id: string,
  patch: Partial<Omit<AttendanceEvent, "id" | "createdAt">>
) {
  const sb = getSupabase();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.active !== undefined) row.active = patch.active;
  const { error } = await sb.from("events").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteEventRow(id: string) {
  const sb = getSupabase();
  const { error } = await sb.from("events").delete().eq("id", id);
  if (error) throw error;
}

export async function createClassRow(cls: AttendanceClass) {
  const sb = getSupabase();
  const { error } = await sb.from("classes").insert({
    id: cls.id,
    name: cls.name,
    section: cls.section,
    description: cls.description,
    active: cls.active,
    created_at: cls.createdAt,
  });
  if (error) throw error;
}

export async function updateClassRow(
  id: string,
  patch: Partial<Omit<AttendanceClass, "id" | "createdAt">>
) {
  const sb = getSupabase();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.section !== undefined) row.section = patch.section;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.active !== undefined) row.active = patch.active;
  const { error } = await sb.from("classes").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteClassRow(id: string) {
  const sb = getSupabase();
  const { error } = await sb.from("classes").delete().eq("id", id);
  if (error) throw error;
}

export async function factoryResetRemote() {
  const sb = getSupabase();
  const tables = [
    "attendance_scans",
    "class_attendance",
    "event_attendance",
    "library_attendance",
    "attendance_days",
    "events",
    "classes",
    "members",
  ];
  for (const table of tables) {
    const { error } = await sb.from(table).delete().not("id", "is", null);
    if (error && !String(error.message).toLowerCase().includes("does not exist")) {
      console.warn(`reset ${table}:`, error.message);
    }
  }
  await saveSettings({ ...DEFAULT_SETTINGS, currentEventId: "" });
}

export function emptyRemoteDb(): AppDb {
  return {
    ...EMPTY_DB,
    settings: { ...DEFAULT_SETTINGS },
    students: [],
    events: [],
    classes: [],
    logs: {},
  };
}

/** Persist gate day snapshot after local mutation */
export async function persistGateDay(
  logDate: string,
  memberId: string,
  record: DayRecord,
  latestScan?: ScanEntry
) {
  const dayId = await ensureAttendanceDay({
    logDate,
    memberId,
    timeIn: record.timeIn || undefined,
    timeOut: record.timeOut || undefined,
    status: record.status,
  });
  if (latestScan) {
    await insertGateScan({
      attendanceDayId: dayId,
      memberId,
      logDate,
      scanType: latestScan.type,
      scannedAt: latestScan.time,
    });
  }
}
