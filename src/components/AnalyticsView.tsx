"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis, YAxis } from "recharts";
import { useAttendance } from "@/context/AttendanceContext";
import { useAuth } from "@/context/AuthContext";
import {
  countSessionAttendance,
  formatDurationSeconds,
  formatTermLabel,
  getTodayStr,
  isDateInTerm,
  LIBRARY_REQUIRED_HOURS,
  libraryRequirementProgress,
  memberDetails,
  parseTimeToSeconds,
} from "@/lib/utils";
import { Badge, Button, Card, Field, PageHeader, SectionTitle, TableShell, inputClass } from "./ui";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "./ui/chart";
import { HugeIcon } from "./icons";

const analyticsColumnWidths = ["12%", "20%", "9%", "13%", "10%", "10%", "14%", "12%"];
const analyticsColumnWidthsGate = ["12%", "22%", "10%", "14%", "12%", "13%", "17%"];

type AnalyticsTarget = "gate" | "class" | "event" | "library";

const ANALYTICS_TARGETS: { id: AnalyticsTarget; perm: string; label: string }[] = [
  { id: "gate", perm: "analytics.gate", label: "Campus Gate" },
  { id: "class", perm: "analytics.class", label: "Class Session" },
  { id: "event", perm: "analytics.event", label: "Events" },
  { id: "library", perm: "analytics.library", label: "School Library" },
];

export function AnalyticsView() {
  const { db, showToast } = useAttendance();
  const { can } = useAuth();
  const allowedTargets = useMemo(
    () => ANALYTICS_TARGETS.filter((t) => can(t.perm)),
    [can],
  );
  const canExport = can("analytics.export");

  const [search, setSearch] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [target, setTarget] = useState<AnalyticsTarget>("gate");
  const [targetEventId, setTargetEventId] = useState("all");
  const [targetClassId, setTargetClassId] = useState("all");
  const [sort, setSort] = useState("name_asc");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const activeTarget =
    allowedTargets.find((t) => t.id === target)?.id ??
    allowedTargets[0]?.id ??
    null;

  const eventOptions = useMemo(
    () => [{ id: "all", label: "All Events" }, ...(db.events || []).map((e) => ({ id: e.id, label: e.name }))],
    [db.events]
  );
  const classOptions = useMemo(
    () => [{ id: "all", label: "All Classes" }, ...(db.classes || []).map((c) => ({ id: c.id, label: c.name }))],
    [db.classes]
  );

  const metrics = useMemo(() => {
    if (!activeTarget) return [];
    const q = search.toLowerCase().trim();
    const rows = db.students.map((student) => {
      let ins = 0;
      let outs = 0;
      let totalSeconds = 0;
      let visits = 0;

      for (const dateKey of Object.keys(db.logs || {})) {
        const rec = db.logs[dateKey]?.[student.id];
        if (!rec) continue;

        if (activeTarget === "gate") {
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
        } else if (activeTarget === "class") {
          for (const [classId, session] of Object.entries(rec.classes || {})) {
            if (targetClassId !== "all" && classId !== targetClassId) continue;
            const c = countSessionAttendance(session);
            ins += c.ins;
            outs += c.outs;
            totalSeconds += c.seconds;
            visits += c.visits;
          }
        } else if (activeTarget === "event") {
          for (const [eventId, session] of Object.entries(rec.events || {})) {
            if (targetEventId !== "all" && eventId !== targetEventId) continue;
            const c = countSessionAttendance(session);
            ins += c.ins;
            outs += c.outs;
            totalSeconds += c.seconds;
            visits += c.visits;
          }
        } else {
          if (!isDateInTerm(dateKey, db.settings)) continue;
          const c = countSessionAttendance(rec.library || {});
          ins += c.ins;
          outs += c.outs;
          totalSeconds += c.seconds;
          visits += c.visits;
        }
      }

      const { durationStr, decimalHrs } = formatDurationSeconds(totalSeconds);
      const requirement = libraryRequirementProgress(totalSeconds);
      return {
        id: student.id,
        name: student.name,
        role: student.role ? student.role.toUpperCase() : "STUDENT",
        details: memberDetails(student),
        ins,
        outs,
        visits,
        durationStr,
        decimalHrs,
        totalSeconds,
        requirement,
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
  }, [db, search, sort, activeTarget, targetClassId, targetEventId]);

  const libraryStats = useMemo(() => {
    if (activeTarget !== "library") return null;
    const met = metrics.filter((m) => m.requirement.met).length;
    const totalHours = metrics.reduce((sum, m) => sum + m.totalSeconds, 0) / 3600;
    return {
      met,
      short: metrics.length - met,
      totalHours: totalHours.toFixed(1),
    };
  }, [metrics, activeTarget]);

  const colWidths =
    activeTarget === "library" ? analyticsColumnWidths : analyticsColumnWidthsGate;
  const colCount = activeTarget === "library" ? 8 : 7;
  const topHours = useMemo(
    () =>
      [...metrics]
        .sort((a, b) => parseFloat(b.decimalHrs) - parseFloat(a.decimalHrs))
        .slice(0, 40)
        .map((m) => ({
          name: m.name.length > 22 ? `${m.name.slice(0, 22)}...` : m.name,
          hours: Number.parseFloat(m.decimalHrs),
        })),
    [metrics]
  );
  const topHoursChartHeight = Math.max(320, topHours.length * 38);

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
  }, [search, sort, tableSearch, activeTarget, targetClassId, targetEventId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function exportAnalyticsReport() {
    if (!canExport) {
      showToast(
        "Export Denied",
        "Your account cannot export analytics reports.",
        "warning",
      );
      return;
    }
    if (!activeTarget || metrics.length === 0)
      return alert("No analytics database entries compiled.");

    const outputRows = metrics.map((m) => {
      const base: Record<string, string | number> = {
        "Member ID": m.id,
        "Full Name": m.name,
        "System Role": m.role,
        "Class Assignment / Dept": m.details,
        "Aggregated Time-Ins": m.ins,
        "Aggregated Time-Outs": m.outs,
        "Total Accumulated Hours": m.durationStr,
        "Decimal Value Hours": parseFloat(m.decimalHrs),
      };
      if (activeTarget === "library") {
        base["Completed Visits"] = m.visits;
        base[`Required Hours / Term`] = LIBRARY_REQUIRED_HOURS;
        base["Requirement Progress %"] = m.requirement.percent;
        base["Hours Remaining"] = m.requirement.remainingStr;
        base["Requirement Met"] = m.requirement.met ? "Yes" : "No";
      }
      return base;
    });

    let customFileName =
      activeTarget === "library"
        ? `Library_Hours_Requirement_${getTodayStr()}`
        : `Overall_Metrics_Summary_${getTodayStr()}`;
    if (!customFileName.endsWith(".xlsx")) customFileName += ".xlsx";

    const ws = XLSX.utils.json_to_sheet(outputRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      ws,
      activeTarget === "library" ? "Library Hours" : "Analytics Tracking"
    );
    XLSX.writeFile(wb, customFileName);
    showToast(
      "Data Collection Dispatched",
      `Analytics file compiled as: ${customFileName}`,
      "success"
    );
  }

  if (!activeTarget) {
    return (
      <section>
        <PageHeader
          title="Analytics"
          subtitle="Operational insights across gate, class, events, and library"
          icon={<HugeIcon name="analytics" size={22} />}
        />
        <Card>
          <p className="text-sm text-slate-500">
            No analytics targets are enabled for your account.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        title="Data Analytics"
        subtitle={
          activeTarget === "library"
            ? `School Library hours toward the ${LIBRARY_REQUIRED_HOURS}h requirement · ${formatTermLabel(db.settings)}`
            : "Accumulated hours and scan metrics across the roster"
        }
        icon={<HugeIcon name="analytics" size={22} />}
      />

      {libraryStats && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card className="!mb-0">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Requirement Met ({LIBRARY_REQUIRED_HOURS}h)
            </div>
            <div className="mt-1 text-2xl font-extrabold text-emerald-700">
              {libraryStats.met}
            </div>
          </Card>
          <Card className="!mb-0">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Still Short
            </div>
            <div className="mt-1 text-2xl font-extrabold text-amber-700">
              {libraryStats.short}
            </div>
          </Card>
          <Card className="!mb-0">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Roster Library Hours
            </div>
            <div className="mt-1 text-2xl font-extrabold text-indigo-700">
              {libraryStats.totalHours}h
            </div>
          </Card>
        </div>
      )}

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
            value={activeTarget}
            onChange={(e) =>
              setTarget(
                e.target.value as "gate" | "class" | "event" | "library"
              )
            }
          >
            {allowedTargets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        {activeTarget === "event" && (
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
        {activeTarget === "class" && (
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
        {canExport && (
        <Button variant="purple" onClick={exportAnalyticsReport}>
          <HugeIcon name="download" size={16} className="icon-pop" />
          Export Overall Analytics
        </Button>
        )}
      </Card>

      <Card>
        <SectionTitle>Visual Analytics</SectionTitle>
        <div className="mb-4 mt-2 text-[13px] text-slate-500">
          Charts update from current filter + sort context.
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 lg:col-span-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-700">
                Top Accumulated Hours
              </div>
              <div className="text-[11px] font-medium text-slate-400">
                {topHours.length} shown · scroll
              </div>
            </div>
            <div className="h-[420px] overflow-y-auto overflow-x-hidden rounded-lg border border-slate-100 bg-slate-50/40 pr-1">
              <ChartContainer
                config={{ hours: { label: "Hours", color: "#0f766e" } }}
                className="w-full"
                style={{ height: topHoursChartHeight, minHeight: 320 }}
              >
                <BarChart
                  data={topHours}
                  layout="vertical"
                  margin={{ left: 8, right: 12, top: 8, bottom: 8 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={148}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    interval={0}
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
          </div>

          <div className="flex flex-col gap-4 lg:col-span-2">
            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5">
              <div className="mb-2 text-sm font-semibold text-slate-700">
                Total Scans (In/Out)
              </div>
              <ChartContainer
                config={{ total: { label: "Total", color: "#0284c7" } }}
                className="h-[140px] w-full"
              >
                <BarChart data={scanTotals} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={28} />
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
                className="h-[140px] w-full"
              >
                <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={roleBreakdown}
                    dataKey="count"
                    nameKey="role"
                    innerRadius={28}
                    outerRadius={48}
                    className="color-count"
                    label
                  />
                </PieChart>
              </ChartContainer>
            </div>
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
                {colWidths.map((w, idx) => (
                  <col key={`head-${idx}-${w}`} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {(activeTarget === "library"
                    ? [
                        "Member ID",
                        "Name",
                        "Role",
                        "Class / Dept",
                        "Time-Ins",
                        "Time-Outs",
                        "Library Hours",
                        `${LIBRARY_REQUIRED_HOURS}h Term`,
                      ]
                    : [
                        "Member ID",
                        "Name",
                        "Role",
                        "Class / Dept",
                        "Total Time-Ins",
                        "Total Time-Outs",
                        "Total Hours Spent",
                      ]
                  ).map((h) => (
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
                  {colWidths.map((w, idx) => (
                    <col key={`body-${idx}-${w}`} style={{ width: w }} />
                  ))}
                </colgroup>
                <tbody>
                  {tableFilteredMetrics.length === 0 ? (
                    <tr>
                      <td
                        colSpan={colCount}
                        className="px-4 py-6 text-center text-slate-500"
                      >
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
                          <strong className="text-[var(--sidebar)]">
                            {m.durationStr}
                          </strong>{" "}
                          <span className="text-xs text-slate-500">
                            ({m.decimalHrs} hrs
                            {activeTarget === "library" ? ` · ${m.visits} visits` : ""}
                            )
                          </span>
                        </td>
                        {activeTarget === "library" && (
                          <td className="border-b border-slate-200 px-4 py-3 text-sm">
                            {m.requirement.met ? (
                              <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200">
                                Met · {m.requirement.percent}%
                              </span>
                            ) : (
                              <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200">
                                {m.requirement.remainingStr} left
                              </span>
                            )}
                          </td>
                        )}
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
