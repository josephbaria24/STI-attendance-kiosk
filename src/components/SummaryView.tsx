"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useAttendance } from "@/context/AttendanceContext";
import { formatDisplayTime, getTodayStr, memberDetails } from "@/lib/utils";
import type { AttendanceStatus, DayRecord, EventCategory } from "@/lib/types";
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

export function SummaryView() {
  const {
    db,
    summaryView,
    setSummaryView,
    openStatusModal,
    showToast,
  } = useAttendance();

  const [dateStr, setDateStr] = useState(getTodayStr());
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name_asc");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [exportName, setExportName] = useState("");

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
      structured.push({
        studentId,
        student,
        timeIn: session.timeIn || "—",
        timeOut: session.timeOut || "—",
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
  }, [dailyData, db.students, q, sort]);

  function exportSummary() {
    if (db.students.length === 0) return alert("No database elements available.");
    let customFileName = exportName.trim() || `Attendance_Report_${dateStr}`;
    if (!customFileName.endsWith(".xlsx")) customFileName += ".xlsx";

    const exportArr = db.students.map((s) => {
      const r = dailyData[s.id] || {
        timeIn: "—",
        timeOut: "—",
        status: "Absent",
        classes: {},
      };
      return {
        Date: dateStr,
        "Member ID": s.id,
        Name: s.name,
        Role: s.role ? s.role.toUpperCase() : "STUDENT",
        Distinction: s.distinction || "—",
        "Details / Class":
          s.role === "faculty" || s.role === "admin"
            ? s.dept
            : `${s.grade} - ${s.section}`,
        "Time In": fmt(r.timeIn || "—"),
        "Time Out": fmt(r.timeOut || "—"),
        "Classes Tracked": r.classes
          ? Object.keys(r.classes)
              .map((id) => {
                const cls = classMap.get(id);
                return cls ? classLabel(cls) : id;
              })
              .join(", ")
          : "—",
        Status: r.status,
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportArr);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily Logs");
    XLSX.writeFile(wb, customFileName);
    showToast("Export Dispatched", `Saved file as: ${customFileName}`, "success");
  }

  function exportClassLogs() {
    const dataset: Record<string, string>[] = [];
    Object.keys(dailyData).forEach((studentId) => {
      const record = dailyData[studentId];
      const student = db.students.find((s) => String(s.id) === String(studentId));
      if (!student || !record.classes) return;
      Object.keys(record.classes).forEach((classKey) => {
        const subjectName = resolveClassLabel(classKey);
        if (subjectFilter !== "all" && subjectName !== subjectFilter) return;
        const session = record.classes[classKey];
        dataset.push({
          "Log Date": dateStr,
          "Student ID": student.id,
          "Full Name": student.name,
          Distinction: student.distinction,
          "Class Structure": `${student.grade} - ${student.section}`,
          "Subject / Course": subjectName,
          "Time In": fmt(session.timeIn || "—"),
          "Time Out": fmt(session.timeOut || "—"),
        });
      });
    });
    if (dataset.length === 0) return alert("No classroom entries found to extract.");
    const ws = XLSX.utils.json_to_sheet(dataset);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Classroom Tracking");
    const filename = `Class_Attendance_Report_${dateStr}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast(
      "Class Log Exported",
      `Extracted dataset successfully as ${filename}`,
      "success"
    );
  }

  function exportEventLogs() {
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
    const dataset: Record<string, string>[] = libraryRows.map((row) => ({
      "Log Date": dateStr,
      "Student ID": row.student.id,
      "Full Name": row.student.name,
      Distinction: row.student.distinction || "—",
      "Class / Dept": memberDetails(row.student),
      Venue: "School Library",
      "Time In": fmt(row.timeIn),
      "Time Out": fmt(row.timeOut),
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
        subtitle="Gate roster, classroom logs, and event / venue check-ins"
        icon={<HugeIcon name="summary" size={22} />}
      />

      <div className="mb-5 flex flex-wrap gap-2.5">
        <Button
          variant={summaryView === "general" ? "primary" : "secondary"}
          onClick={() => setSummaryView("general")}
        >
          <HugeIcon name="summary" size={16} className="icon-pop" />
          Daily Gate Roster
        </Button>
        <Button
          variant={summaryView === "class" ? "primary" : "secondary"}
          onClick={() => setSummaryView("class")}
        >
          <HugeIcon name="classMode" size={16} className="icon-pop" />
          Classroom Subject Log
        </Button>
        <Button
          variant={summaryView === "event" ? "primary" : "secondary"}
          onClick={() => setSummaryView("event")}
        >
          <HugeIcon name="event" size={16} className="icon-pop" />
          Events & Venues Log
        </Button>
        <Button
          variant={summaryView === "library" ? "primary" : "secondary"}
          onClick={() => setSummaryView("library")}
        >
          <HugeIcon name="book" size={16} className="icon-pop" />
          School Library Log
        </Button>
      </div>

      <Card className="flex flex-wrap gap-4 pb-4">
        <Field label="Select Date Record" className="mb-0 max-w-[180px]">
          <input
            type="date"
            className={inputClass}
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
          />
        </Field>
        {summaryView === "class" && (
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
        {summaryView === "event" && (
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

      {summaryView === "general" ? (
        <div className="mb-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Present" value={counts.present} />
          <StatCard label="Total Late" value={counts.late} />
          <StatCard label="Total Excused" value={counts.excused} />
          <StatCard label="Absent / No Scan" value={counts.absent} />
        </div>
      ) : summaryView === "class" ? (
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
      ) : summaryView === "library" ? (
        <div className="mb-6 grid gap-6 md:grid-cols-2">
          <StatCard
            label="Library Visitors (unique)"
            value={libraryRows.length}
          />
          <StatCard label="Venue" value="School Library" />
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

      {summaryView === "general" ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>Daily Gate Record Sheet</SectionTitle>
            <div className="flex flex-wrap items-center gap-2.5">
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
                  "Admin Actions",
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
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </Card>
      ) : summaryView === "class" ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>Classroom Subject Attendance Sheet</SectionTitle>
            <Button variant="teal" onClick={exportClassLogs}>
              <HugeIcon name="download" size={16} className="icon-pop" />
              Export Class Logs
            </Button>
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
      ) : summaryView === "library" ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>School Library Attendance Sheet</SectionTitle>
            <Button variant="secondary" onClick={exportLibraryLogs}>
              <HugeIcon name="download" size={16} className="icon-pop" />
              Export Library Logs
            </Button>
          </div>
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
                    colSpan={7}
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
                      {fmt(row.timeOut)}
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
            <Button variant="secondary" onClick={exportEventLogs}>
              <HugeIcon name="download" size={16} className="icon-pop" />
              Export Event Logs
            </Button>
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
    </section>
  );
}
