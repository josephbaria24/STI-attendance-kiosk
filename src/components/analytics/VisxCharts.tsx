"use client";

import { useMemo, useCallback, type MouseEvent, type TouchEvent } from "react";
import { Group } from "@visx/group";
import { Bar, Pie } from "@visx/shape";
import { scaleBand, scaleLinear, scaleOrdinal } from "@visx/scale";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridColumns, GridRows } from "@visx/grid";
import { LinearGradient } from "@visx/gradient";
import { ParentSize } from "@visx/responsive";
import { localPoint } from "@visx/event";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";

const TEAL = "#0d9488";
const TEAL_DEEP = "#004953";
const SKY = "#0284c7";
const AMBER = "#d97706";
const ROSE = "#e11d48";
const VIOLET = "#7c3aed";

const tooltipStyles = {
  ...defaultStyles,
  background: "rgba(15, 23, 42, 0.92)",
  border: "1px solid rgba(148, 163, 184, 0.25)",
  color: "#f8fafc",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 12,
  lineHeight: 1.35,
  boxShadow: "0 12px 28px rgba(15, 23, 42, 0.28)",
};

function shortName(name: string, max = 18) {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

export type HoursDatum = {
  id: string;
  name: string;
  hours: number;
};

export type ScanDatum = {
  label: string;
  total: number;
};

export type RoleDatum = {
  role: string;
  count: number;
};

function TopHoursInner({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: HoursDatum[];
}) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<HoursDatum>();

  const margin = { top: 12, right: 56, bottom: 28, left: 132 };
  const xMax = Math.max(0, width - margin.left - margin.right);
  const yMax = Math.max(0, height - margin.top - margin.bottom);
  const maxHours = Math.max(...data.map((d) => d.hours), 0.1);

  const yScale = useMemo(
    () =>
      scaleBand<string>({
        domain: data.map((d) => d.id),
        range: [0, yMax],
        padding: 0.28,
      }),
    [data, yMax],
  );

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, maxHours * 1.08],
        range: [0, xMax],
        nice: true,
      }),
    [maxHours, xMax],
  );

  const onBarMove = useCallback(
    (event: MouseEvent | TouchEvent, datum: HoursDatum) => {
      const point = localPoint(event) || { x: 0, y: 0 };
      showTooltip({
        tooltipData: datum,
        tooltipLeft: point.x,
        tooltipTop: point.y,
      });
    },
    [showTooltip],
  );

  if (width < 80 || height < 80 || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        No hours data yet
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <svg width={width} height={height}>
        <LinearGradient id="hours-bar-grad" from={TEAL} to={TEAL_DEEP} />
        <Group left={margin.left} top={margin.top}>
          <GridColumns
            scale={xScale}
            height={yMax}
            stroke="#e2e8f0"
            strokeDasharray="3,4"
            numTicks={4}
          />
          {data.map((d, i) => {
            const barY = yScale(d.id) ?? 0;
            const barH = yScale.bandwidth();
            const barW = Math.max(0, xScale(d.hours));
            return (
              <Group key={d.id}>
                <Bar
                  x={0}
                  y={barY}
                  width={Math.max(barW, 2)}
                  height={barH}
                  fill="url(#hours-bar-grad)"
                  rx={6}
                  ry={6}
                  className="cursor-pointer transition-opacity hover:opacity-90"
                  onMouseMove={(e) => onBarMove(e, d)}
                  onMouseLeave={hideTooltip}
                  onTouchStart={(e) => onBarMove(e, d)}
                />
                <text
                  x={-10}
                  y={barY + barH / 2}
                  dy="0.35em"
                  textAnchor="end"
                  fontSize={11}
                  fontWeight={600}
                  fill="#334155"
                >
                  <title>{d.name}</title>
                  {`${String(i + 1).padStart(2, "0")}. ${shortName(d.name)}`}
                </text>
                <text
                  x={barW + 8}
                  y={barY + barH / 2}
                  dy="0.35em"
                  fontSize={11}
                  fontWeight={700}
                  fill={TEAL_DEEP}
                >
                  {d.hours.toFixed(1)}h
                </text>
              </Group>
            );
          })}
          <AxisBottom
            top={yMax}
            scale={xScale}
            numTicks={4}
            stroke="#cbd5e1"
            tickStroke="#cbd5e1"
            tickLabelProps={() => ({
              fill: "#94a3b8",
              fontSize: 10,
              fontWeight: 600,
              textAnchor: "middle" as const,
            })}
          />
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={tooltipStyles}
        >
          <div className="font-semibold">{tooltipData.name}</div>
          <div className="mt-0.5 text-teal-200">
            {tooltipData.hours.toFixed(2)} hours
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

function ScansInner({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: ScanDatum[];
}) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<ScanDatum>();

  const margin = { top: 16, right: 12, bottom: 32, left: 36 };
  const xMax = Math.max(0, width - margin.left - margin.right);
  const yMax = Math.max(0, height - margin.top - margin.bottom);
  const maxTotal = Math.max(...data.map((d) => d.total), 1);

  const xScale = useMemo(
    () =>
      scaleBand<string>({
        domain: data.map((d) => d.label),
        range: [0, xMax],
        padding: 0.38,
      }),
    [data, xMax],
  );

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, maxTotal * 1.15],
        range: [yMax, 0],
        nice: true,
      }),
    [maxTotal, yMax],
  );

  if (width < 60 || height < 60) return null;

  return (
    <div className="relative h-full w-full">
      <svg width={width} height={height}>
        <LinearGradient id="scan-in-grad" from="#38bdf8" to={SKY} />
        <LinearGradient id="scan-out-grad" from="#5eead4" to={TEAL} />
        <Group left={margin.left} top={margin.top}>
          <GridRows
            scale={yScale}
            width={xMax}
            stroke="#e2e8f0"
            strokeDasharray="3,4"
            numTicks={3}
          />
          {data.map((d, i) => {
            const x = xScale(d.label) ?? 0;
            const barW = xScale.bandwidth();
            const y = yScale(d.total);
            const barH = Math.max(0, yMax - y);
            const fill = i === 0 ? "url(#scan-in-grad)" : "url(#scan-out-grad)";
            return (
              <Group key={d.label}>
                <Bar
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  fill={fill}
                  rx={8}
                  ry={8}
                  className="cursor-pointer"
                  onMouseMove={(event) => {
                    const point = localPoint(event) || { x: 0, y: 0 };
                    showTooltip({
                      tooltipData: d,
                      tooltipLeft: point.x,
                      tooltipTop: point.y,
                    });
                  }}
                  onMouseLeave={hideTooltip}
                />
                <text
                  x={x + barW / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={800}
                  fill={TEAL_DEEP}
                >
                  {d.total}
                </text>
              </Group>
            );
          })}
          <AxisBottom
            top={yMax}
            scale={xScale}
            stroke="transparent"
            tickStroke="transparent"
            tickLabelProps={() => ({
              fill: "#64748b",
              fontSize: 11,
              fontWeight: 700,
              textAnchor: "middle",
              dy: "0.25em",
            })}
          />
          <AxisLeft
            scale={yScale}
            numTicks={3}
            stroke="transparent"
            tickStroke="transparent"
            tickLabelProps={() => ({
              fill: "#94a3b8",
              fontSize: 10,
              fontWeight: 600,
              textAnchor: "end",
              dx: "-0.35em",
              dy: "0.35em",
            })}
          />
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={tooltipStyles}
        >
          <div className="font-semibold">{tooltipData.label}</div>
          <div className="mt-0.5 text-sky-200">{tooltipData.total} scans</div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

function RoleInner({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: RoleDatum[];
}) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<RoleDatum & { percent: number }>();

  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const colors = [TEAL, SKY, AMBER, VIOLET, ROSE, TEAL_DEEP];
  const colorScale = useMemo(
    () =>
      scaleOrdinal<string, string>({
        domain: data.map((d) => d.role),
        range: colors,
      }),
    [data],
  );

  const size = Math.min(width, height);
  const donutSide = Math.min(size, width * 0.55);
  const radius = Math.max(28, donutSide / 2 - 8);
  const innerRadius = radius * 0.62;
  const centerX = donutSide / 2;
  const centerY = height / 2;

  if (width < 80 || height < 80 || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        No role data
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full items-center gap-2">
      <svg width={donutSide} height={height}>
        <Group top={centerY} left={centerX}>
          <Pie
            data={data}
            pieValue={(d) => d.count}
            outerRadius={radius}
            innerRadius={innerRadius}
            cornerRadius={4}
            padAngle={0.02}
          >
            {(pie) =>
              pie.arcs.map((arc) => {
                const path = pie.path(arc) || "";
                const [centroidX, centroidY] = pie.path.centroid(arc);
                const percent = Math.round((arc.data.count / total) * 100);
                return (
                  <g key={arc.data.role}>
                    <path
                      d={path}
                      fill={colorScale(arc.data.role)}
                      className="cursor-pointer transition-opacity hover:opacity-90"
                      onMouseMove={(event) => {
                        const point = localPoint(event) || { x: 0, y: 0 };
                        showTooltip({
                          tooltipData: { ...arc.data, percent },
                          tooltipLeft: point.x,
                          tooltipTop: point.y,
                        });
                      }}
                      onMouseLeave={hideTooltip}
                    />
                    {percent >= 12 && (
                      <text
                        x={centroidX}
                        y={centroidY}
                        dy="0.35em"
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={800}
                        fill="#fff"
                        pointerEvents="none"
                      >
                        {percent}%
                      </text>
                    )}
                  </g>
                );
              })
            }
          </Pie>
          <text
            textAnchor="middle"
            dy="-0.2em"
            fontSize={18}
            fontWeight={800}
            fill={TEAL_DEEP}
          >
            {total}
          </text>
          <text
            textAnchor="middle"
            dy="1.2em"
            fontSize={10}
            fontWeight={600}
            fill="#94a3b8"
          >
            members
          </text>
        </Group>
      </svg>
      <div className="min-w-0 flex-1 space-y-2 pr-1">
        {data.map((d) => {
          const pct = Math.round((d.count / total) * 100);
          return (
            <div key={d.role} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: colorScale(d.role) }}
              />
              <span className="min-w-0 truncate text-[11px] font-semibold text-slate-600">
                {d.role} · {d.count} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={tooltipStyles}
        >
          <div className="font-semibold">{tooltipData.role}</div>
          <div className="mt-0.5 text-teal-200">
            {tooltipData.count} · {tooltipData.percent}%
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

export function TopHoursChart({ data }: { data: HoursDatum[] }) {
  const rowH = 34;
  const chartHeight = Math.max(280, data.length * rowH + 40);
  return (
    <div style={{ height: chartHeight, minHeight: 280 }} className="w-full">
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <TopHoursInner width={width} height={height} data={data} />
        )}
      </ParentSize>
    </div>
  );
}

export function ScansChart({ data }: { data: ScanDatum[] }) {
  return (
    <div className="h-[150px] w-full">
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <ScansInner width={width} height={height} data={data} />
        )}
      </ParentSize>
    </div>
  );
}

export function RoleDonutChart({ data }: { data: RoleDatum[] }) {
  return (
    <div className="h-[160px] w-full">
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <RoleInner width={width} height={height} data={data} />
        )}
      </ParentSize>
    </div>
  );
}
