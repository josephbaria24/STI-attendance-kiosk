"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis, YAxis } from "recharts";
import { useAttendance } from "@/context/AttendanceContext";
import { getTodayStr, memberDetails } from "@/lib/utils";
import { Badge, Button, Card, Field, PageHeader, SectionTitle, TableShell, inputClass } from "./ui";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "./ui/chart";
import { HugeIcon } from "./icons";

const analyticsColumnWidths = ["12%", "22%", "10%", "14%", "12%", "13%", "17%"];

export function AnalyticsView() {
  const { db, showToast } = useAttendance();
  const [search, setSearch] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [target, setTarget] = useState<"gate" | "class" | "event" | "library">(
    "gate"
  );
  const [targetEventId, setTargetEventId] = useState("all");
  const [targetClassId, setTargetClassId] = useState("all");
  const [sort, setSort] = useState("name_asc");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const eventOptions = useMemo(
    () => [{ id: "all", label: "All Events" }, ...(db.events || []).map((e) => ({ id: e.id, label: e.name }))],
    [db.events]
  );
  const classOptions = useMemo(
    () => [{ id: "all", label: "All Classes" }, ...(db.classes || []).map((c) => ({ id: c.id, label: c.name }))],
    [db.classes]
  );

  function parseTimeToSeconds(value: string) {
    if (!value || value === "—") return null;
    const [h, m, s] = value.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 3600 + m * 60 + (Number.isFinite(s) ? s : 0);
  }

  function countSession(session: {
    timeIn?: string;
    timeOut?: string;
    scans?: { type: "in" | "out"; time: string }[];
  }) {
    let ins = 0;
    let outs = 0;
    let seconds = 0;

    if (session.scans && session.scans.length > 0) {
      for (const scan of session.scans) {
        if (scan.type === "in") ins++;
        if (scan.type === "out") outs++;
      }
    } else {
      if (session.timeIn) ins++;
      if (session.timeOut) outs++;
    }

    const inSec = parseTimeToSeconds(session.timeIn || "");
    const outSec = parseTimeToSeconds(session.timeOut || "");
    if (inSec !== null && outSec !== null && outSec > inSec) {
      seconds += outSec - inSec;
    }
    return { ins, outs, seconds };
  }

  const metrics = useMemo(() => {
    const q = search.toLowerCase().trim();
    const rows = db.students.map((student) => {
      let ins = 0;
      let outs = 0;
      let totalSeconds = 0;

      for (const dateKey of Object.keys(db.logs || {})) {
        const rec = db.logs[dateKey]?.[student.id];
        if (!rec) continue;

        if (target === "gate") {
          if (rec.scans && rec.scans.length > 0) {
            for (const scan of rec.scans) {
              if (scan.type === "in") ins++;
              if (scan.type === "out") outs++;
            }
          } else {
            if (rec.timeIn) ins++;
            if (rec.timeOut) outs++;
          }
          const inSec = parseTimeToSeconds(rec.timeIn);
          const outSec = parseTimeToSeconds(rec.timeOut);
          if (inSec !== null && outSec !== null && outSec > inSec) {
            totalSeconds += outSec - inSec;
          }
        } else if (target === "class") {
          for (const [classId, session] of Object.entries(rec.classes || {})) {
            if (targetClassId !== "all" && classId !== targetClassId) continue;
            const c = countSession(session);
            ins += c.ins;
            outs += c.outs;
            totalSeconds += c.seconds;
          }
        } else if (target === "event") {
          for (const [eventId, session] of Object.entries(rec.events || {})) {
            if (targetEventId !== "all" && eventId !== targetEventId) continue;
            const c = countSession(session);
            ins += c.ins;
            outs += c.outs;
            totalSeconds += c.seconds;
          }
        } else {
          const c = countSession(rec.library || {});
          ins += c.ins;
          outs += c.outs;
          totalSeconds += c.seconds;
        }
      }

      const hrs = Math.floor(totalSeconds / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      return {
        id: student.id,
        name: student.name,
        role: student.role ? student.role.toUpperCase() : "STUDENT",
        details: memberDetails(student),
        ins,
        outs,
        durationStr: `${hrs}h ${mins}m`,
        decimalHrs: (totalSeconds / 3600).toFixed(2),
      };
    });

    const filtered = q
      ? rows.filter(
          (item) =>
            item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
        )
      : rows;
    filtered.sort((a, b) => {
      if (sort === "name_asc") return a.name.localeCompare(b.name);
      if (sort === "name_desc") return b.name.localeCompare(a.name);
      if (sort === "hours_desc")
        return parseFloat(b.decimalHrs) - parseFloat(a.decimalHrs);
      if (sort === "hours_asc")
        return parseFloat(a.decimalHrs) - parseFloat(b.decimalHrs);
      if (sort === "ins_desc") return b.ins - a.ins;
      return 0;
    });
    return filtered;
  }, [db, search, sort, target, targetClassId, targetEventId]);

  const topHours = useMemo(
    () =>
      [...metrics]
        .sort((a, b) => parseFloat(b.decimalHrs) - parseFloat(a.decimalHrs))
        .slice(0, 8)
        .map((m) => ({
          // Keep compact but still readable for axis labels.
          name: m.name.length > 18 ? `${m.name.slice(0, 18)}...` : m.name,
          hours: Number.parseFloat(m.decimalHrs),
        })),
    [metrics]
  );

  const scanTotals = useMemo(() => {
    const ins = metrics.reduce((sum, m) => sum + m.ins, 0);
    const outs = metrics.reduce((sum, m) => sum + m.outs, 0);
    return [
      { label: "Time In", total: ins },
      { label: "Time Out", total: outs },
    ];
  }, [metrics]);

  const roleBreakdown = useMemo(() => {
    const counts = metrics.reduce<Record<string, number>>((acc, row) => {
      const role = row.role || "UNKNOWN";
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts).map(([role, count]) => ({
      role,
      count,
    }));
  }, [metrics]);

  const tableFilteredMetrics = useMemo(() => {
    const q = tableSearch.toLowerCase().trim();
    if (!q) return metrics;
    return metrics.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        m.details.toLowerCase().includes(q)
    );
  }, [metrics, tableSearch]);

  const totalPages = Math.max(1, Math.ceil(tableFilteredMetrics.length / pageSize));
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(tableFilteredMetrics.length, startIndex + pageSize);
  const paginatedMetrics = tableFilteredMetrics.slice(startIndex, endIndex);

  useEffect(() => {
    setPage(1);
  }, [search, sort, tableSearch, target, targetClassId, targetEventId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function exportAnalyticsReport() {
    if (metrics.length === 0)
      return alert("No analytics database entries compiled.");

    const outputRows = metrics.map((m) => ({
      "Member ID": m.id,
      "Full Name": m.name,
      "System Role": m.role,
      "Class Assignment / Dept": m.details,
      "Aggregated Time-Ins": m.ins,
      "Aggregated Time-Outs": m.outs,
      "Total Accumulated Hours": m.durationStr,
      "Decimal Value Hours": parseFloat(m.decimalHrs),
    }));

    let customFileName = `Overall_Metrics_Summary_${getTodayStr()}`;
    if (!customFileName.endsWith(".xlsx")) customFileName += ".xlsx";

    const ws = XLSX.utils.json_to_sheet(outputRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Analytics Tracking");
    XLSX.writeFile(wb, customFileName);
    showToast(
      "Data Collection Dispatched",
      `Analytics file compiled as: ${customFileName}`,
      "success"
    );
  }

  return (
    <section>
      <PageHeader
        title="Data Analytics"
        subtitle="Accumulated hours and scan metrics across the roster"
        icon={<HugeIcon name="analytics" size={22} />}
      />

      <Card className="flex flex-wrap items-end gap-4 pb-4">
        <Field label="Filter Analytics Matrix" className="mb-0 min-w-[250px] flex-1">
          <input
            className={inputClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search profile identity or name..."
          />
        </Field>
        <Field label="Sort By" className="mb-0 max-w-[220px]">
          <select
            className={inputClass}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name_asc">Name (A-Z)</option>
            <option value="name_desc">Name (Z-A)</option>
            <option value="hours_desc">Total Hours (Highest)</option>
            <option value="hours_asc">Total Hours (Lowest)</option>
            <option value="ins_desc">Total Time-Ins (Highest)</option>
          </select>
        </Field>
        <Field label="Analytics Target" className="mb-0 max-w-[220px]">
          <select
            className={inputClass}
            value={target}
            onChange={(e) =>
              setTarget(
                e.target.value as "gate" | "class" | "event" | "library"
              )
            }
          >
            <option value="gate">Campus Gate</option>
            <option value="class">Class Session</option>
            <option value="event">Events</option>
            <option value="library">School Library</option>
          </select>
        </Field>
        {target === "event" && (
          <Field label="Select Event" className="mb-0 max-w-[240px]">
            <select
              className={inputClass}
              value={targetEventId}
              onChange={(e) => setTargetEventId(e.target.value)}
            >
              {eventOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {target === "class" && (
          <Field label="Select Class" className="mb-0 max-w-[240px]">
            <select
              className={inputClass}
              value={targetClassId}
              onChange={(e) => setTargetClassId(e.target.value)}
            >
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Button variant="purple" onClick={exportAnalyticsReport}>
          <HugeIcon name="download" size={16} className="icon-pop" />
          Export Overall Analytics
        </Button>
      </Card>

      <Card>
        <SectionTitle>Visual Analytics</SectionTitle>
        <div className="mb-4 mt-2 text-[13px] text-slate-500">
          Charts update from current filter + sort context.
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200/80 bg-white p-3.5">
            <div className="mb-2 text-sm font-semibold text-slate-700">
              Top Accumulated Hours
            </div>
            <ChartContainer
              config={{ hours: { label: "Hours", color: "#6d28d9" } }}
              className="h-[220px] w-full"
            >
              <BarChart data={topHours} layout="vertical" margin={{ left: 12, right: 10 }}>
                <CartesianGrid horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={128}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="hours"
                  radius={[0, 6, 6, 0]}
                  className="color-hours"
                />
              </BarChart>
            </ChartContainer>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3.5">
            <div className="mb-2 text-sm font-semibold text-slate-700">
              Total Scans (In/Out)
            </div>
            <ChartContainer
              config={{ total: { label: "Total", color: "#0284c7" } }}
              className="h-[220px] w-full"
            >
              <BarChart data={scanTotals}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="total"
                  radius={[6, 6, 0, 0]}
                  className="color-total"
                />
              </BarChart>
            </ChartContainer>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3.5">
            <div className="mb-2 text-sm font-semibold text-slate-700">
              Role Distribution
            </div>
            <ChartContainer
              config={{
                count: { label: "Members", color: "#0f766e" },
              }}
              className="h-[220px] w-full"
            >
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie
                  data={roleBreakdown}
                  dataKey="count"
                  nameKey="role"
                  innerRadius={44}
                  outerRadius={76}
                  className="color-count"
                  label
                />
              </PieChart>
            </ChartContainer>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Accumulated Hours & Scan Metrics</SectionTitle>
        <div className="mt-3 max-w-[320px]">
          <Field label="Search This Table" className="mb-0">
            <input
              className={inputClass}
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Filter current analytics rows..."
            />
          </Field>
        </div>
        <div className="mb-3 mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Showing {tableFilteredMetrics.length === 0 ? 0 : startIndex + 1}–
            {endIndex} of {tableFilteredMetrics.length} records
          </span>
          <span>
            Page {page} of {totalPages}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/95">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed border-collapse text-left">
              <colgroup>
                {analyticsColumnWidths.map((w, idx) => (
                  <col key={`head-${idx}-${w}`} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {[
                    "Member ID",
                    "Name",
                    "Role",
                    "Class / Dept",
                    "Total Time-Ins",
                    "Total Time-Outs",
                    "Total Hours Spent",
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
            </table>

            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full min-w-[980px] table-fixed border-collapse text-left">
                <colgroup>
                  {analyticsColumnWidths.map((w, idx) => (
                    <col key={`body-${idx}-${w}`} style={{ width: w }} />
                  ))}
                </colgroup>
                <tbody>
                  {tableFilteredMetrics.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                        No analytics parameters match.
                      </td>
                    </tr>
                  ) : (
                    paginatedMetrics.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                          {m.id}
                        </td>
                        <td className="border-b border-slate-200 px-4 py-3 text-sm">
                          {m.name}
                        </td>
                        <td className="border-b border-slate-200 px-4 py-3">
                          <Badge variant="role">{m.role}</Badge>
                        </td>
                        <td className="border-b border-slate-200 px-4 py-3 text-sm">
                          {m.details}
                        </td>
                        <td className="border-b border-slate-200 px-4 py-3 text-sm">
                          {m.ins}
                        </td>
                        <td className="border-b border-slate-200 px-4 py-3 text-sm">
                          {m.outs}
                        </td>
                        <td className="border-b border-slate-200 px-4 py-3 text-sm">
                          <strong className="text-[var(--sidebar)]">{m.durationStr}</strong>{" "}
                          <span className="text-xs text-slate-500">
                            ({m.decimalHrs} hrs)
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {tableFilteredMetrics.length > 0 && (
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </Card>
    </section>
  );
}
