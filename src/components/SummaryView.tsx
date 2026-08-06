"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { useAttendance } from "@/context/AttendanceContext";
import { useAuth } from "@/context/AuthContext";
import {
  formatDisplayTime,
  getTodayStr,
  memberDetails,
  countSessionAttendance,
  formatDurationSeconds,
  formatMonthDay,
  weekdayShort,
  getAttendanceDateSpan,
  enumerateDatesInclusive,
  dayHasCampusAttendance,
  getTargetCutoffs,
  ATTENDANCE_LETTER,
  ATTENDANCE_POINTS,
} from "@/lib/utils";
import type {
  AttendanceStatus,
  DayRecord,
  EventCategory,
  SessionAttendance,
  SummaryView as SummaryViewId,
} from "@/lib/types";
import { categoryLabel, classLabel } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  Field,
  PageHeader,
  SectionTitle,
  StatCard,
  TableShell,
  inputClass,
} from "./ui";
import { HugeIcon } from "./icons";

const SUMMARY_TABS: {
  id: SummaryViewId;
  perm: string;
  label: string;
  icon: "summary" | "classMode" | "event" | "book";
}[] = [
  { id: "general", perm: "summary.general", label: "Daily Gate Roster", icon: "summary" },
  { id: "class", perm: "summary.class", label: "Classroom Subject Log", icon: "classMode" },
  { id: "event", perm: "summary.event", label: "Events & Venues Log", icon: "event" },
  { id: "library", perm: "summary.library", label: "School Library Log", icon: "book" },
];

export function SummaryView() {
  const {
    db,
    summaryView,
    setSummaryView,
    openStatusModal,
    showToast,
  } = useAttendance();
  const { can } = useAuth();

  const allowedTabs = useMemo(
    () => SUMMARY_TABS.filter((t) => can(t.perm)),
    [can],
  );
  const activeSummaryView =
    allowedTabs.find((t) => t.id === summaryView)?.id ??
    allowedTabs[0]?.id ??
    null;
  const canExport = can("summary.export");
  const canOverride = can("summary.statusOverride");

  const [dateStr, setDateStr] = useState(getTodayStr());
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name_asc");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [exportName, setExportName] = useState("");
  const [classExportFrom, setClassExportFrom] = useState(getTodayStr);
  const [classExportTo, setClassExportTo] = useState(getTodayStr);

  const dailyData = db.logs[dateStr] || {};
  const q = search.toLowerCase().trim();
  const timeFormat = db.settings.timeFormat || "12h";
  const fmt = (t: string) => formatDisplayTime(t, timeFormat);
  const eventMap = useMemo(() => {
    const map = new Map((db.events || []).map((e) => [e.id, e]));
    return map;
  }, [db.events]);

  const classMap = useMemo(() => {
    const map = new Map((db.classes || []).map((c) => [c.id, c]));
    return map;
  }, [db.classes]);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    Object.values(dailyData).forEach((record) => {
      if (record.classes)
        Object.keys(record.classes).forEach((id) => {
          const cls = classMap.get(id);
          set.add(cls ? classLabel(cls) : id);
        });
    });
    return Array.from(set).sort();
  }, [dailyData, classMap]);

  function resolveClassLabel(classKey: string) {
    const cls = classMap.get(classKey);
    return cls ? classLabel(cls) : classKey;
  }

  const eventOptions = useMemo(() => {
    const ids = new Set<string>();
    Object.values(dailyData).forEach((record) => {
      if (record.events) Object.keys(record.events).forEach((id) => ids.add(id));
    });
    return Array.from(ids)
      .map((id) => ({
        id,
        label: eventMap.get(id)?.name || id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [dailyData, eventMap]);

  function guardExport() {
    if (canExport) return true;
    showToast(
      "Export Denied",
      "Your account cannot export spreadsheets.",
      "warning",
    );
    return false;
  }

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, excused: 0, absent: 0 };
    db.students.forEach((s) => {
      const r = dailyData[s.id] || { status: "Absent" as AttendanceStatus };
      if (r.status === "Present") c.present++;
      else if (r.status === "Late") c.late++;
      else if (r.status === "Excused") c.excused++;
      else c.absent++;
    });
    return c;
  }, [db.students, dailyData]);

  const generalRows = useMemo(() => {
    let rows = db.students.map((student) => {
      const record: DayRecord = dailyData[student.id] || {
        timeIn: "—",
        timeOut: "—",
        status: "Absent",
        scans: [],
        classes: {},
        events: {},
      };
      return { student, record };
    });

    rows = rows.filter(({ student: s }) => {
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.distinction || "").toLowerCase().includes(q) ||
        (s.grade || "").toLowerCase().includes(q) ||
        (s.dept || "").toLowerCase().includes(q)
      );
    });

    rows.sort((a, b) => {
      if (sort === "name_asc") return a.student.name.localeCompare(b.student.name);
      if (sort === "name_desc") return b.student.name.localeCompare(a.student.name);
      if (sort === "timein_asc" || sort === "timein_desc") {
        const tA =
          a.record.timeIn && a.record.timeIn !== "—"
            ? a.record.timeIn
            : "99:99:99";
        const tB =
          b.record.timeIn && b.record.timeIn !== "—"
            ? b.record.timeIn
            : "99:99:99";
        return sort === "timein_asc" ? tA.localeCompare(tB) : tB.localeCompare(tA);
      }
      if (sort === "status") return a.record.status.localeCompare(b.record.status);
      return 0;
    });
    return rows;
  }, [db.students, dailyData, q, sort]);

  const classRows = useMemo(() => {
    const structured: {
      studentId: string;
      student: (typeof db.students)[0];
      classKey: string;
      subjectName: string;
      timeIn: string;
      timeOut: string;
    }[] = [];
    const uniqueStudents = new Set<string>();
    const uniqueSubjects = new Set<string>();

    Object.keys(dailyData).forEach((studentId) => {
      const record = dailyData[studentId];
      const student = db.students.find((s) => String(s.id) === String(studentId));
      if (!student || !record.classes) return;

      Object.keys(record.classes).forEach((classKey) => {
        const subjectName = resolveClassLabel(classKey);
        uniqueSubjects.add(subjectName);
        if (subjectFilter !== "all" && subjectName !== subjectFilter) return;
        const session = record.classes[classKey];
        if (!session?.timeIn && !session?.timeOut && !(session?.scans?.length > 0))
          return;
        uniqueStudents.add(studentId);
        if (
          q &&
          !student.name.toLowerCase().includes(q) &&
          !student.id.toLowerCase().includes(q) &&
          !subjectName.toLowerCase().includes(q)
        )
          return;
        structured.push({
          studentId,
          student,
          classKey,
          subjectName,
          timeIn: session.timeIn || "—",
          timeOut: session.timeOut || "—",
        });
      });
    });

    structured.sort((a, b) => {
      if (sort === "name_asc") return a.student.name.localeCompare(b.student.name);
      if (sort === "name_desc") return b.student.name.localeCompare(a.student.name);
      if (sort === "timein_asc")
        return (a.timeIn || "").localeCompare(b.timeIn || "");
      if (sort === "timein_desc")
        return (b.timeIn || "").localeCompare(a.timeIn || "");
      return 0;
    });

    return {
      rows: structured,
      totalStudents: uniqueStudents.size,
      totalSubjects: uniqueSubjects.size,
    };
  }, [dailyData, db.students, subjectFilter, q, sort, classMap]);

  const eventRows = useMemo(() => {
    const structured: {
      studentId: string;
      student: (typeof db.students)[0];
      eventId: string;
      eventName: string;
      category: string;
      timeIn: string;
      timeOut: string;
    }[] = [];
    const uniqueStudents = new Set<string>();
    const uniqueEvents = new Set<string>();

    Object.keys(dailyData).forEach((studentId) => {
      const record = dailyData[studentId];
      const student = db.students.find((s) => String(s.id) === String(studentId));
      if (!student || !record.events) return;

      Object.keys(record.events).forEach((eventId) => {
        uniqueEvents.add(eventId);
        if (eventFilter !== "all" && eventId !== eventFilter) return;
        const eventName = eventMap.get(eventId)?.name || eventId;
        const category = eventMap.get(eventId)?.category || "other";
        const session = record.events[eventId];
        if (!session?.timeIn && !session?.timeOut && !(session?.scans?.length > 0))
          return;
        uniqueStudents.add(studentId);
        if (
          q &&
          !student.name.toLowerCase().includes(q) &&
          !student.id.toLowerCase().includes(q) &&
          !eventName.toLowerCase().includes(q)
        )
          return;
        structured.push({
          studentId,
          student,
          eventId,
          eventName,
          category,
          timeIn: session.timeIn || "—",
          timeOut: session.timeOut || "—",
        });
      });
    });

    structured.sort((a, b) => {
      if (sort === "name_asc") return a.student.name.localeCompare(b.student.name);
      if (sort === "name_desc") return b.student.name.localeCompare(a.student.name);
      if (sort === "timein_asc")
        return (a.timeIn || "").localeCompare(b.timeIn || "");
      if (sort === "timein_desc")
        return (b.timeIn || "").localeCompare(a.timeIn || "");
      return 0;
    });

    return {
      rows: structured,
      totalStudents: uniqueStudents.size,
      totalEvents: uniqueEvents.size,
    };
  }, [dailyData, db.students, eventFilter, eventMap, q, sort]);

  const libraryRows = useMemo(() => {
    const structured: {
      studentId: string;
      student: (typeof db.students)[0];
      timeIn: string;
      timeOut: string;
      durationStr: string;
      visits: number;
      ins: number;
      outs: number;
      stampLog: string;
      openVisit: boolean;
    }[] = [];

    Object.keys(dailyData).forEach((studentId) => {
      const record = dailyData[studentId];
      const student = db.students.find((s) => String(s.id) === String(studentId));
      const session = record?.library;
      if (!student || !session) return;
      if (!session.timeIn && !session.timeOut && !(session.scans?.length > 0))
        return;
      if (
        q &&
        !student.name.toLowerCase().includes(q) &&
        !student.id.toLowerCase().includes(q)
      )
        return;
      const counted = countSessionAttendance(session);
      const { durationStr } = formatDurationSeconds(counted.seconds);
      const last = session.scans?.[session.scans.length - 1];
      const stampLog =
        session.scans && session.scans.length > 0
          ? session.scans
              .map(
                (s) =>
                  `${s.type === "out" ? "OUT" : "IN"} ${fmt(s.time)}`
              )
              .join(" · ")
          : [
              session.timeIn ? `IN ${fmt(session.timeIn)}` : "",
              session.timeOut ? `OUT ${fmt(session.timeOut)}` : "",
            ]
              .filter(Boolean)
              .join(" · ");
      structured.push({
        studentId,
        student,
        timeIn: session.timeIn || "—",
        timeOut: session.timeOut || "—",
        durationStr,
        visits: counted.visits,
        ins: counted.ins,
        outs: counted.outs,
        stampLog: stampLog || "—",
        openVisit: Boolean(last && last.type === "in"),
      });
    });

    structured.sort((a, b) => {
      if (sort === "name_asc") return a.student.name.localeCompare(b.student.name);
      if (sort === "name_desc") return b.student.name.localeCompare(a.student.name);
      if (sort === "timein_asc")
        return (a.timeIn || "").localeCompare(b.timeIn || "");
      if (sort === "timein_desc")
        return (b.timeIn || "").localeCompare(a.timeIn || "");
      return 0;
    });

    return structured;
  }, [dailyData, db.students, q, sort, timeFormat]);

  const libraryDayStats = useMemo(() => {
    let totalSeconds = 0;
    let completedVisits = 0;
    let currentlyIn = 0;
    for (const row of libraryRows) {
      const session = dailyData[row.studentId]?.library;
      if (!session) continue;
      const counted = countSessionAttendance(session);
      totalSeconds += counted.seconds;
      completedVisits += counted.visits;
      if (row.openVisit) currentlyIn++;
    }
    return {
      visitors: libraryRows.length,
      completedVisits,
      currentlyIn,
      ...formatDurationSeconds(totalSeconds),
    };
  }, [dailyData, libraryRows]);

  async function exportSummary() {
    if (!guardExport()) return;
    if (db.students.length === 0) return alert("No database elements available.");
    let customFileName = exportName.trim() || `Attendance_Report_${dateStr}`;
    if (!customFileName.endsWith(".xlsx")) customFileName += ".xlsx";

    const { dates } = getAttendanceDateSpan(db.logs, db.settings, dateStr);
    const classDaySet = new Set(
      dates.filter((d) => dayHasCampusAttendance(db.logs[d])),
    );
    const classDayCount = classDaySet.size;

    const baseHeaders = [
      "Member ID",
      "Name",
      "Role",
      "Distinction",
      "Details / Class",
      "Time In",
      "Time Out",
      "Classes Tracked",
      "Status",
    ];
    const scoreHeaders = ["Points", "Possible", "Score %"];
    const attendanceStart = baseHeaders.length + 1; // 1-based excel col
    const attendanceEnd = dates.length
      ? attendanceStart + dates.length - 1
      : attendanceStart - 1;
    const pointsStart = dates.length
      ? attendanceEnd + 1
      : baseHeaders.length + 1;
    const headerRows = 4; // ATTENDANCE / # / weekday / MM/DD

    const thin: ExcelJS.Border = {
      style: "thin",
      color: { argb: "FF000000" },
    };
    const borderAll: Partial<ExcelJS.Borders> = {
      top: thin,
      left: thin,
      bottom: thin,
      right: thin,
    };
    const center: Partial<ExcelJS.Alignment> = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    const statusFill: Record<string, string> = {
      P: "FFC6EFCE",
      L: "FFFFEB9C",
      E: "FFBDD7EE",
      A: "FFFFC7CE",
    };

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Daily Logs", {
      views: [{ state: "frozen", xSplit: baseHeaders.length, ySplit: headerRows }],
    });

    // Row 1: base titles + ATTENDANCE + score titles
    const row1 = ws.getRow(1);
    baseHeaders.forEach((h, i) => {
      const cell = row1.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 10 };
      cell.alignment = center;
      cell.border = borderAll;
    });
    if (dates.length > 0) {
      const cell = row1.getCell(attendanceStart);
      cell.value = "ATTENDANCE";
      cell.font = { bold: true, size: 12 };
      cell.alignment = center;
      cell.border = borderAll;
      if (dates.length > 1) {
        ws.mergeCells(1, attendanceStart, 1, attendanceEnd);
      }
      for (let c = attendanceStart; c <= attendanceEnd; c++) {
        row1.getCell(c).border = borderAll;
        row1.getCell(c).alignment = center;
        row1.getCell(c).font = { bold: true, size: 12 };
      }
    }
    scoreHeaders.forEach((h, i) => {
      const cell = row1.getCell(pointsStart + i);
      cell.value = h;
      cell.font = { bold: true, size: 10 };
      cell.alignment = center;
      cell.border = borderAll;
    });

    // Rows 2–4: day index / weekday / MM/DD under ATTENDANCE
    const row2 = ws.getRow(2);
    const row3 = ws.getRow(3);
    const row4 = ws.getRow(4);
    dates.forEach((d, i) => {
      const col = attendanceStart + i;
      const c2 = row2.getCell(col);
      c2.value = i + 1;
      c2.font = { bold: true, size: 9 };
      c2.alignment = center;
      c2.border = borderAll;

      const c3 = row3.getCell(col);
      c3.value = weekdayShort(d);
      c3.font = { bold: true, size: 9 };
      c3.alignment = center;
      c3.border = borderAll;

      const c4 = row4.getCell(col);
      c4.value = formatMonthDay(d);
      c4.font = { bold: true, size: 9 };
      c4.alignment = center;
      c4.border = borderAll;
    });

    // Merge identity + score headers across the 4 header rows
    baseHeaders.forEach((_, i) => {
      ws.mergeCells(1, i + 1, headerRows, i + 1);
      for (let r = 1; r <= headerRows; r++) {
        const cell = ws.getRow(r).getCell(i + 1);
        cell.border = borderAll;
        cell.alignment = center;
        cell.font = { bold: true, size: 10 };
      }
    });
    scoreHeaders.forEach((_, i) => {
      const col = pointsStart + i;
      ws.mergeCells(1, col, headerRows, col);
      for (let r = 1; r <= headerRows; r++) {
        const cell = ws.getRow(r).getCell(col);
        cell.border = borderAll;
        cell.alignment = center;
        cell.font = { bold: true, size: 10 };
      }
    });

    // Thick line under header block
    for (let c = 1; c <= pointsStart + scoreHeaders.length - 1; c++) {
      const cell = row4.getCell(c);
      cell.border = {
        ...borderAll,
        bottom: { style: "medium", color: { argb: "FF1E293B" } },
      };
    }

    db.students.forEach((s) => {
      const r = dailyData[s.id] || {
        timeIn: "—",
        timeOut: "—",
        status: "Absent" as AttendanceStatus,
        classes: {},
      };
      let points = 0;
      const letters = dates.map((d) => {
        if (!classDaySet.has(d)) return "";
        const status: AttendanceStatus = db.logs[d]?.[s.id]?.status || "Absent";
        points += ATTENDANCE_POINTS[status];
        return ATTENDANCE_LETTER[status];
      });
      const possible = classDayCount * ATTENDANCE_POINTS.Present;
      const scorePct =
        possible > 0 ? Math.round((points / possible) * 1000) / 10 : 0;

      const row = ws.addRow([
        s.id,
        s.name,
        s.role ? s.role.toUpperCase() : "STUDENT",
        s.distinction || "—",
        s.role === "faculty" || s.role === "admin"
          ? s.dept
          : `${s.grade} - ${s.section}`,
        fmt(r.timeIn || "—"),
        fmt(r.timeOut || "—"),
        r.classes
          ? Object.keys(r.classes)
              .map((id) => {
                const cls = classMap.get(id);
                return cls ? classLabel(cls) : id;
              })
              .join(", ")
          : "—",
        r.status,
        ...letters,
        points,
        possible,
        scorePct,
      ]);

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = borderAll;
        cell.alignment = center;
        if (
          dates.length > 0 &&
          colNumber >= attendanceStart &&
          colNumber <= attendanceEnd
        ) {
          const letter = String(cell.value || "");
          if (letter && statusFill[letter]) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: statusFill[letter] },
            };
            cell.font = { bold: true, size: 10 };
          }
        }
      });
    });

    baseHeaders.forEach((_, i) => {
      ws.getColumn(i + 1).width = i === 1 ? 22 : i === 4 ? 18 : 12;
    });
    dates.forEach((_, i) => {
      ws.getColumn(attendanceStart + i).width = 5;
    });
    scoreHeaders.forEach((_, i) => {
      ws.getColumn(pointsStart + i).width = 10;
    });

    const key = wb.addWorksheet("Attendance Key");
    key.addRows([
      ["Code", "Meaning", "Points"],
      ["P", "Present", ATTENDANCE_POINTS.Present],
      ["L", "Late", ATTENDANCE_POINTS.Late],
      ["E", "Excuse", ATTENDANCE_POINTS.Excused],
      ["A", "Absent", ATTENDANCE_POINTS.Absent],
      [],
      ["Blank cell", "No class that day (nobody scanned on campus)."],
      [
        "Scope",
        db.settings.termStartDate
          ? "Full term calendar (day # / weekday / date)."
          : "Calendar from first to last log date.",
      ],
    ]);

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = customFileName;
    a.click();
    URL.revokeObjectURL(url);

    showToast(
      "Export Dispatched",
      dates.length
        ? `Saved ${customFileName} with ${dates.length} day columns (${classDayCount} class day(s)).`
        : `Saved ${customFileName}.`,
      "success",
    );
  }

  async function exportClassLogs() {
    if (!guardExport()) return;
    const from =
      classExportFrom <= classExportTo ? classExportFrom : classExportTo;
    const to =
      classExportFrom <= classExportTo ? classExportTo : classExportFrom;
    const dates = enumerateDatesInclusive(from, to);
    if (dates.length === 0) return alert("Invalid date range.");

    const subjectsInRange = new Set<string>();
    dates.forEach((d) => {
      Object.values(db.logs[d] || {}).forEach((record) => {
        Object.keys(record.classes || {}).forEach((classKey) => {
          subjectsInRange.add(resolveClassLabel(classKey));
        });
      });
    });

    const subjectsToExport =
      subjectFilter === "all"
        ? Array.from(subjectsInRange).sort()
        : subjectsInRange.has(subjectFilter)
          ? [subjectFilter]
          : [];

    if (subjectsToExport.length === 0) {
      return alert(
        subjectFilter === "all"
          ? "No classroom entries found in that date range."
          : `No entries for "${subjectFilter}" in that date range.`,
      );
    }

    const lateTime = getTargetCutoffs(db.settings, "class").lateTime;
    const thin: ExcelJS.Border = {
      style: "thin",
      color: { argb: "FF000000" },
    };
    const borderAll: Partial<ExcelJS.Borders> = {
      top: thin,
      left: thin,
      bottom: thin,
      right: thin,
    };
    const center: Partial<ExcelJS.Alignment> = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    const statusFill: Record<string, string> = {
      P: "FFC6EFCE",
      L: "FFFFEB9C",
      E: "FFBDD7EE",
      A: "FFFFC7CE",
    };

    function subjectSession(
      record: DayRecord | undefined,
      subjectName: string,
    ): SessionAttendance | undefined {
      if (!record?.classes) return undefined;
      const matches = Object.entries(record.classes).filter(
        ([key]) => resolveClassLabel(key) === subjectName,
      );
      if (matches.length === 0) return undefined;
      return (
        matches.find(
          ([, s]) => s.timeIn || (s.scans && s.scans.length > 0),
        )?.[1] || matches[0][1]
      );
    }

    function dayHasSubjectClass(
      dayLogs: Record<string, DayRecord> | undefined,
      subjectName: string,
    ): boolean {
      if (!dayLogs) return false;
      return Object.values(dayLogs).some((record) => {
        const session = subjectSession(record, subjectName);
        return Boolean(
          session?.timeIn ||
            session?.timeOut ||
            (session?.scans && session.scans.length > 0),
        );
      });
    }

    function letterForClassDay(
      record: DayRecord | undefined,
      subjectName: string,
    ): "P" | "A" | "L" | "E" {
      if (record?.status === "Excused") return "E";
      const session = subjectSession(record, subjectName);
      const timeIn =
        session?.timeIn ||
        session?.scans?.find((s) => s.type === "in")?.time ||
        "";
      if (!timeIn || timeIn === "—") return "A";
      const normalized =
        timeIn.length === 5 ? `${timeIn}:00` : timeIn;
      if (normalized > `${lateTime}:00`) return "L";
      return "P";
    }

    const wb = new ExcelJS.Workbook();
    const baseHeaders = ["#", "STUDENT NO.", "STUDENT NAME"];
    const scoreHeaders = ["Points", "Possible", "Score %"];
    const headerRows = 4;
    const attendanceStart = baseHeaders.length + 1;
    const attendanceEnd = attendanceStart + dates.length - 1;
    const pointsStart = attendanceEnd + 1;

    for (const subjectName of subjectsToExport) {
      const classDaySet = new Set(
        dates.filter((d) => dayHasSubjectClass(db.logs[d], subjectName)),
      );
      const classDayCount = classDaySet.size;

      const sheetName = subjectName.replace(/[\\/*?[\]:]/g, " ").slice(0, 31);
      const ws = wb.addWorksheet(sheetName || "Class", {
        views: [
          {
            state: "frozen",
            xSplit: baseHeaders.length,
            ySplit: headerRows,
          },
        ],
      });

      const row1 = ws.getRow(1);
      baseHeaders.forEach((h, i) => {
        const cell = row1.getCell(i + 1);
        cell.value = h;
        cell.font = { bold: true, size: 10 };
        cell.alignment = center;
        cell.border = borderAll;
      });
      {
        const cell = row1.getCell(attendanceStart);
        cell.value = "ATTENDANCE";
        cell.font = { bold: true, size: 12 };
        cell.alignment = center;
        if (dates.length > 1) {
          ws.mergeCells(1, attendanceStart, 1, attendanceEnd);
        }
        for (let c = attendanceStart; c <= attendanceEnd; c++) {
          row1.getCell(c).border = borderAll;
          row1.getCell(c).alignment = center;
          row1.getCell(c).font = { bold: true, size: 12 };
        }
      }
      scoreHeaders.forEach((h, i) => {
        const cell = row1.getCell(pointsStart + i);
        cell.value = h;
        cell.font = { bold: true, size: 10 };
        cell.alignment = center;
        cell.border = borderAll;
      });

      const row2 = ws.getRow(2);
      const row3 = ws.getRow(3);
      const row4 = ws.getRow(4);
      dates.forEach((d, i) => {
        const col = attendanceStart + i;
        const c2 = row2.getCell(col);
        c2.value = i + 1;
        c2.font = { bold: true, size: 9 };
        c2.alignment = center;
        c2.border = borderAll;

        const c3 = row3.getCell(col);
        c3.value = weekdayShort(d);
        c3.font = { bold: true, size: 9 };
        c3.alignment = center;
        c3.border = borderAll;

        const c4 = row4.getCell(col);
        c4.value = formatMonthDay(d);
        c4.font = { bold: true, size: 9 };
        c4.alignment = center;
        c4.border = borderAll;
      });

      baseHeaders.forEach((_, i) => {
        ws.mergeCells(1, i + 1, headerRows, i + 1);
        for (let r = 1; r <= headerRows; r++) {
          const cell = ws.getRow(r).getCell(i + 1);
          cell.border = borderAll;
          cell.alignment = center;
          cell.font = { bold: true, size: 10 };
        }
      });
      scoreHeaders.forEach((_, i) => {
        const col = pointsStart + i;
        ws.mergeCells(1, col, headerRows, col);
        for (let r = 1; r <= headerRows; r++) {
          const cell = ws.getRow(r).getCell(col);
          cell.border = borderAll;
          cell.alignment = center;
          cell.font = { bold: true, size: 10 };
        }
      });

      for (let c = 1; c <= pointsStart + scoreHeaders.length - 1; c++) {
        const cell = row4.getCell(c);
        cell.border = {
          ...borderAll,
          bottom: { style: "medium", color: { argb: "FF1E293B" } },
        };
      }

      const scannedIds = new Set<string>();
      dates.forEach((d) => {
        Object.entries(db.logs[d] || {}).forEach(([studentId, record]) => {
          const session = subjectSession(record, subjectName);
          if (
            session?.timeIn ||
            session?.timeOut ||
            (session?.scans && session.scans.length > 0)
          ) {
            scannedIds.add(studentId);
          }
        });
      });

      const roster = db.students
        .filter((s) => scannedIds.has(s.id) || scannedIds.has(String(s.id)))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (roster.length === 0) continue;

      roster.forEach((student, index) => {
        let points = 0;
        const letters = dates.map((d) => {
          if (!classDaySet.has(d)) return "";
          const letter = letterForClassDay(db.logs[d]?.[student.id], subjectName);
          const status: AttendanceStatus =
            letter === "P"
              ? "Present"
              : letter === "L"
                ? "Late"
                : letter === "E"
                  ? "Excused"
                  : "Absent";
          points += ATTENDANCE_POINTS[status];
          return letter;
        });
        const possible = classDayCount * ATTENDANCE_POINTS.Present;
        const scorePct =
          possible > 0 ? Math.round((points / possible) * 1000) / 10 : 0;

        const row = ws.addRow([
          index + 1,
          student.id,
          student.name,
          ...letters,
          points,
          possible,
          scorePct,
        ]);

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.border = borderAll;
          cell.alignment = center;
          if (colNumber === 3) {
            cell.alignment = { horizontal: "left", vertical: "middle" };
          }
          if (colNumber >= attendanceStart && colNumber <= attendanceEnd) {
            const letter = String(cell.value || "");
            if (letter && statusFill[letter]) {
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: statusFill[letter] },
              };
              cell.font = { bold: true, size: 10 };
            }
          }
        });
      });

      ws.getColumn(1).width = 5;
      ws.getColumn(2).width = 14;
      ws.getColumn(3).width = 28;
      dates.forEach((_, i) => {
        ws.getColumn(attendanceStart + i).width = 5;
      });
      scoreHeaders.forEach((_, i) => {
        ws.getColumn(pointsStart + i).width = 10;
      });
    }

    const key = wb.addWorksheet("Attendance Key");
    key.addRows([
      ["Code", "Meaning", "Points"],
      ["P", "Present", ATTENDANCE_POINTS.Present],
      ["L", "Late (after class cutoff)", ATTENDANCE_POINTS.Late],
      ["E", "Excuse", ATTENDANCE_POINTS.Excused],
      ["A", "Absent", ATTENDANCE_POINTS.Absent],
      [],
      ["Blank cell", "No class that day (nobody scanned into the subject)."],
      ["Range", `${from} → ${to}`],
    ]);

    const filename =
      from === to
        ? `Class_Attendance_Report_${from}.xlsx`
        : `Class_Attendance_Report_${from}_to_${to}.xlsx`;

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    showToast(
      "Class Log Exported",
      `${subjectsToExport.length} subject sheet(s) · ${dates.length} day columns`,
      "success",
    );
  }

  function exportEventLogs() {
    if (!guardExport()) return;
    const dataset: Record<string, string>[] = [];
    Object.keys(dailyData).forEach((studentId) => {
      const record = dailyData[studentId];
      const student = db.students.find((s) => String(s.id) === String(studentId));
      if (!student || !record.events) return;
      Object.keys(record.events).forEach((eventId) => {
        if (eventFilter !== "all" && eventId !== eventFilter) return;
        const evt = eventMap.get(eventId);
        const session = record.events[eventId];
        dataset.push({
          "Log Date": dateStr,
          "Student ID": student.id,
          "Full Name": student.name,
          Distinction: student.distinction,
          Event: evt?.name || eventId,
          Category: evt ? categoryLabel(evt.category) : "—",
          Location: evt?.location || "—",
          "Time In": fmt(session.timeIn || "—"),
          "Time Out": fmt(session.timeOut || "—"),
        });
      });
    });
    if (dataset.length === 0) return alert("No event entries found to extract.");
    const ws = XLSX.utils.json_to_sheet(dataset);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Event Tracking");
    const filename = `Event_Attendance_Report_${dateStr}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast(
      "Event Log Exported",
      `Extracted dataset successfully as ${filename}`,
      "success"
    );
  }

  function exportLibraryLogs() {
    if (!guardExport()) return;
    const dataset: Record<string, string | number>[] = libraryRows.map((row) => ({
      "Log Date": dateStr,
      "Student ID": row.student.id,
      "Full Name": row.student.name,
      Distinction: row.student.distinction || "—",
      "Class / Dept": memberDetails(row.student),
      Venue: "School Library",
      "Latest Time In": fmt(row.timeIn),
      "Latest Time Out": row.openVisit ? "Still in library" : fmt(row.timeOut),
      "Time In Stamps": row.ins,
      "Time Out Stamps": row.outs,
      "Completed Visits": row.visits,
      "All Timestamps": row.stampLog,
      "Hours Logged (day)": row.durationStr,
      Status: row.openVisit ? "In library" : "Completed",
    }));
    if (dataset.length === 0)
      return alert("No school library entries found to extract.");
    const ws = XLSX.utils.json_to_sheet(dataset);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Library Tracking");
    const filename = `Library_Attendance_Report_${dateStr}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast(
      "Library Log Exported",
      `Extracted dataset successfully as ${filename}`,
      "success"
    );
  }

  return (
    <section>
      <PageHeader
        title="Attendance Summary"
        subtitle="Gate roster, classroom logs, events, and school library visit hours"
        icon={<HugeIcon name="summary" size={22} />}
      />

      <div className="mb-5 flex flex-wrap gap-2.5">
        {allowedTabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeSummaryView === tab.id ? "primary" : "secondary"}
            onClick={() => setSummaryView(tab.id)}
          >
            <HugeIcon name={tab.icon} size={16} className="icon-pop" />
            {tab.label}
          </Button>
        ))}
      </div>

      {!activeSummaryView ? (
        <Card>
          <p className="text-sm text-slate-500">
            No summary logs are enabled for your account.
          </p>
        </Card>
      ) : (
      <>

      <Card className="flex flex-wrap gap-4 pb-4">
        <Field label="Select Date Record" className="mb-0 max-w-[180px]">
          <input
            type="date"
            className={inputClass}
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
          />
        </Field>
        {activeSummaryView === "class" && (
          <Field label="Filter By Subject" className="mb-0 max-w-[200px]">
            <select
              className={inputClass}
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              <option value="all">All Subjects</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        )}
        {activeSummaryView === "event" && (
          <Field label="Filter By Event" className="mb-0 max-w-[220px]">
            <select
              className={inputClass}
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
            >
              <option value="all">All Events</option>
              {eventOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Sort By" className="mb-0 max-w-[220px]">
          <select
            className={inputClass}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name_asc">Name (A-Z)</option>
            <option value="name_desc">Name (Z-A)</option>
            <option value="timein_asc">Time Record (Earliest)</option>
            <option value="timein_desc">Time Record (Latest)</option>
            <option value="status">Status</option>
          </select>
        </Field>
        <Field label="Live Search Roster" className="mb-0 min-w-[250px] flex-1">
          <input
            className={inputClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search member Name, ID, Level, or department..."
          />
        </Field>
      </Card>

      {activeSummaryView === "general" ? (
        <div className="mb-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Present" value={counts.present} />
          <StatCard label="Total Late" value={counts.late} />
          <StatCard label="Total Excused" value={counts.excused} />
          <StatCard label="Absent / No Scan" value={counts.absent} />
        </div>
      ) : activeSummaryView === "class" ? (
        <div className="mb-6 grid gap-6 md:grid-cols-2">
          <StatCard
            label="Total Attending Students"
            value={classRows.totalStudents}
          />
          <StatCard
            label="Unique Subject Fields Recorded"
            value={classRows.totalSubjects}
          />
        </div>
      ) : activeSummaryView === "library" ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Library Visitors (unique)"
            value={libraryDayStats.visitors}
          />
          <StatCard
            label="Completed Visits"
            value={libraryDayStats.completedVisits}
          />
          <StatCard
            label="Currently In Library"
            value={libraryDayStats.currentlyIn}
          />
          <StatCard
            label="Hours Logged Today"
            value={libraryDayStats.durationStr}
          />
        </div>
      ) : (
        <div className="mb-6 grid gap-6 md:grid-cols-2">
          <StatCard
            label="Total Event Check-ins (unique people)"
            value={eventRows.totalStudents}
          />
          <StatCard
            label="Unique Events Recorded"
            value={eventRows.totalEvents}
          />
        </div>
      )}

      {activeSummaryView === "general" ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>Daily Gate Record Sheet</SectionTitle>
            <div className="flex flex-wrap items-center gap-2.5">
              {canExport && (
                <>
              <input
                className={`${inputClass} w-[220px] py-2 text-[13px]`}
                placeholder="Custom filename (optional)"
                value={exportName}
                onChange={(e) => setExportName(e.target.value)}
              />
              <Button variant="secondary" onClick={exportSummary}>
                <HugeIcon name="download" size={16} className="icon-pop" />
                Export Daily
              </Button>
                </>
              )}
            </div>
          </div>
          <TableShell>
            <thead>
              <tr>
                {[
                  "Member ID",
                  "Name",
                  "Distinction",
                  "Class / Dept",
                  "Time In",
                  "Time Out",
                  "Tracked Classes",
                  "Status",
                  ...(canOverride ? ["Admin Actions"] : []),
                ].map((h) => (
                  <th
                    key={h}
                    className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {generalRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    No records matched search boundaries.
                  </td>
                </tr>
              ) : (
                generalRows.map(({ student, record }) => (
                  <tr key={student.id} className="hover:bg-slate-50">
                    <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                      {student.id}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      {student.name}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-500">
                      {student.distinction || "—"}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      {memberDetails(student)}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      {fmt(record.timeIn || "—")}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      {fmt(record.timeOut || "—")}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      <div className="flex max-w-[240px] flex-wrap gap-1">
                        {record.classes && Object.keys(record.classes).length > 0
                          ? Object.keys(record.classes).map((c) => (
                              <Badge key={c} variant="class">
                                {resolveClassLabel(c)}
                              </Badge>
                            ))
                          : "—"}
                      </div>
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3">
                      <Badge
                        variant={
                          record.status.toLowerCase() as
                            | "present"
                            | "late"
                            | "excused"
                            | "absent"
                        }
                      >
                        {record.status}
                      </Badge>
                    </td>
                    {canOverride && (
                    <td className="border-b border-slate-200 px-4 py-3">
                      <Button
                        variant="secondary"
                        className="px-2 py-1 text-[11px]"
                        onClick={() =>
                          openStatusModal({
                            id: student.id,
                            name: student.name,
                            status: record.status,
                            dateStr,
                          })
                        }
                      >
                        Edit Status
                      </Button>
                    </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </Card>
      ) : activeSummaryView === "class" ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>Classroom Subject Attendance Sheet</SectionTitle>
            {canExport && (
              <div className="flex flex-wrap items-end gap-2.5">
                <Field label="From" className="mb-0 max-w-[150px]">
                  <input
                    type="date"
                    className={inputClass}
                    value={classExportFrom}
                    max={classExportTo || undefined}
                    onChange={(e) => setClassExportFrom(e.target.value)}
                  />
                </Field>
                <Field label="To" className="mb-0 max-w-[150px]">
                  <input
                    type="date"
                    className={inputClass}
                    value={classExportTo}
                    min={classExportFrom || undefined}
                    onChange={(e) => setClassExportTo(e.target.value)}
                  />
                </Field>
                <Button variant="teal" onClick={exportClassLogs}>
                  <HugeIcon name="download" size={16} className="icon-pop" />
                  Export Class Logs
                </Button>
              </div>
            )}
          </div>
          <TableShell>
            <thead>
              <tr>
                {[
                  "Member ID",
                  "Name",
                  "Distinction",
                  "Class / Dept",
                  "Tracked Subject",
                  "Time In",
                  "Time Out",
                ].map((h) => (
                  <th
                    key={h}
                    className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classRows.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    No localized classroom records found.
                  </td>
                </tr>
              ) : (
                classRows.rows.map((row, i) => (
                  <tr
                    key={`${row.studentId}-${row.classKey}-${i}`}
                    className="hover:bg-slate-50"
                  >
                    <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                      {row.student.id}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      {row.student.name}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-500">
                      {row.student.distinction || "—"}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      {memberDetails(row.student)}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3">
                      <Badge variant="class">{row.subjectName}</Badge>
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                      {fmt(row.timeIn)}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                      {fmt(row.timeOut)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </Card>
      ) : activeSummaryView === "library" ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>School Library Attendance Sheet</SectionTitle>
            {canExport && (
            <Button variant="secondary" onClick={exportLibraryLogs}>
              <HugeIcon name="download" size={16} className="icon-pop" />
              Export Library Logs
            </Button>
            )}
          </div>
          <p className="mb-3 text-[12px] text-slate-500">
            Auto In / Out visits for this date. Duration counts completed
            In→Out pairs (students need 3 hours per term — see Analytics).
          </p>
          <TableShell>
            <thead>
              <tr>
                {[
                  "Member ID",
                  "Name",
                  "Distinction",
                  "Class / Dept",
                  "Venue",
                  "Time In",
                  "Time Out",
                  "In Stamps",
                  "Out Stamps",
                  "Visits",
                  "Hours (day)",
                ].map((h) => (
                  <th
                    key={h}
                    className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {libraryRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    No school library visits found for this date.
                  </td>
                </tr>
              ) : (
                libraryRows.map((row) => (
                  <tr key={row.studentId} className="hover:bg-slate-50">
                    <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                      {row.student.id}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      {row.student.name}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-500">
                      {row.student.distinction || "—"}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      {memberDetails(row.student)}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3">
                      <Badge variant="class">School Library</Badge>
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                      {fmt(row.timeIn)}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                      {row.openVisit ? (
                        <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-800 ring-1 ring-indigo-200">
                          Still in
                        </span>
                      ) : (
                        fmt(row.timeOut)
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                      {row.ins}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                      {row.outs}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      {row.visits}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-[var(--sidebar)]">
                      {row.durationStr}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </Card>
      ) : (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>Events & Venues Attendance Sheet</SectionTitle>
            {canExport && (
            <Button variant="secondary" onClick={exportEventLogs}>
              <HugeIcon name="download" size={16} className="icon-pop" />
              Export Event Logs
            </Button>
            )}
          </div>
          <TableShell>
            <thead>
              <tr>
                {[
                  "Member ID",
                  "Name",
                  "Distinction",
                  "Class / Dept",
                  "Event",
                  "Category",
                  "Time In",
                  "Time Out",
                ].map((h) => (
                  <th
                    key={h}
                    className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eventRows.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    No event / venue check-ins found for this date.
                  </td>
                </tr>
              ) : (
                eventRows.rows.map((row, i) => (
                  <tr
                    key={`${row.studentId}-${row.eventId}-${i}`}
                    className="hover:bg-slate-50"
                  >
                    <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                      {row.student.id}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      {row.student.name}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-500">
                      {row.student.distinction || "—"}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      {memberDetails(row.student)}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3">
                      <Badge variant="late">{row.eventName}</Badge>
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      {categoryLabel(row.category as EventCategory)}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                      {fmt(row.timeIn)}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                      {fmt(row.timeOut)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </Card>
      )}
      </>
      )}
    </section>
  );
}
