"use client";

import type { SVGProps } from "react";
import iconData from "./hugeicons-data.json";

/**
 * Hugeicons SVG bodies from Iconify
 * https://icon-sets.iconify.design/hugeicons/
 */
export const icons = {
  scanner: "qr-code-scan",
  summary: "note-01",
  analytics: "analytics-up",
  admin: "settings-01",
  menu: "menu-01",
  close: "cancel-01",
  timeIn: "login-01",
  timeOut: "logout-01",
  classMode: "teacher",
  event: "calendar-03",
  camera: "camera-01",
  stop: "stop",
  play: "play",
  clock: "time-04",
  add: "add-01",
  delete: "delete-02",
  download: "download-01",
  search: "search-01",
  check: "tick-02",
  book: "book-01",
  chart: "chart-bar-line",
  user: "user",
} as const;

export type AppIconName = keyof typeof icons;

type HugeIconProps = {
  name: AppIconName;
  size?: number | string;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, "width" | "height" | "name">;

export function HugeIcon({
  name,
  size = 20,
  className = "",
  ...rest
}: HugeIconProps) {
  const key = icons[name];
  const entry = (iconData as Record<string, { body: string }>)[key];
  if (!entry?.body) return null;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-300 ${className}`}
      dangerouslySetInnerHTML={{ __html: entry.body }}
      {...rest}
    />
  );
}
