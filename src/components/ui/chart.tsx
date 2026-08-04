"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "@/lib/cn";

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode;
    color?: string;
  };
};

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("useChart must be used inside <ChartContainer />");
  return context;
}

export function ChartContainer({
  id,
  className,
  children,
  config,
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-slate-500 [&_.recharts-cartesian-grid_line]:stroke-slate-200 [&_.recharts-tooltip-cursor]:stroke-slate-300 [&_.recharts-reference-line_line]:stroke-slate-300",
          className
        )}
      >
        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: Object.entries(config)
              .map(
                ([key, item]) =>
                  `[data-chart=${chartId}] .color-${key}{color:${item.color || "#0f766e"};fill:${item.color || "#0f766e"};stroke:${item.color || "#0f766e"}}`
              )
              .join("\n"),
          }}
        />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = RechartsPrimitive.Tooltip;

type ChartTooltipPayloadItem = {
  dataKey?: string | number;
  name?: string | number;
  color?: string;
  value?: unknown;
};

export function ChartTooltipContent({
  active,
  payload,
  className,
}: {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  className?: string;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs shadow-md",
        className
      )}
    >
      <div className="space-y-1">
        {payload.map((item, idx) => {
          const key = String(item.dataKey || item.name || "");
          const conf = config[key];
          return (
            <div key={`${key}-${idx}`} className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: item.color || "#64748b" }}
              />
              <span className="text-slate-500">{conf?.label || key}</span>
              <span className="font-semibold text-slate-700">
                {item.value as React.ReactNode}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
