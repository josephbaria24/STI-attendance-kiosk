/** App access toggles stored on each account profile (JSONB). */

export type AppPermissions = {
  views: {
    scanner: boolean;
    summary: boolean;
    analytics: boolean;
    admin: boolean;
  };
  scanner: {
    gate: boolean;
    class: boolean;
    event: boolean;
    library: boolean;
  };
  summary: {
    general: boolean;
    class: boolean;
    event: boolean;
    library: boolean;
    export: boolean;
    statusOverride: boolean;
  };
  analytics: {
    gate: boolean;
    class: boolean;
    event: boolean;
    library: boolean;
    export: boolean;
  };
  admin: {
    settings: boolean;
    events: boolean;
    classes: boolean;
    roster: boolean;
    ids: boolean;
    users: boolean;
    factoryReset: boolean;
    rosterImport: boolean;
    rosterRegister: boolean;
    rosterDemo: boolean;
    rosterPhotos: boolean;
  };
};

export const ALL_PERMISSIONS: AppPermissions = {
  views: { scanner: true, summary: true, analytics: true, admin: true },
  scanner: { gate: true, class: true, event: true, library: true },
  summary: {
    general: true,
    class: true,
    event: true,
    library: true,
    export: true,
    statusOverride: true,
  },
  analytics: {
    gate: true,
    class: true,
    event: true,
    library: true,
    export: true,
  },
  admin: {
    settings: true,
    events: true,
    classes: true,
    roster: true,
    ids: true,
    users: true,
    factoryReset: true,
    rosterImport: true,
    rosterRegister: true,
    rosterDemo: true,
    rosterPhotos: true,
  },
};

/** Sensible defaults for a new staff account (no user management / factory reset). */
export const DEFAULT_STAFF_PERMISSIONS: AppPermissions = {
  views: { scanner: true, summary: true, analytics: true, admin: false },
  scanner: { gate: true, class: true, event: true, library: true },
  summary: {
    general: true,
    class: true,
    event: true,
    library: true,
    export: true,
    statusOverride: false,
  },
  analytics: {
    gate: true,
    class: true,
    event: true,
    library: true,
    export: true,
  },
  admin: {
    settings: false,
    events: false,
    classes: false,
    roster: false,
    ids: false,
    users: false,
    factoryReset: false,
    rosterImport: false,
    rosterRegister: false,
    rosterDemo: false,
    rosterPhotos: false,
  },
};

/** Empty / deny-all — used when reading stored permissions (missing key = denied). */
export const DENY_ALL_PERMISSIONS: AppPermissions = {
  views: { scanner: false, summary: false, analytics: false, admin: false },
  scanner: { gate: false, class: false, event: false, library: false },
  summary: {
    general: false,
    class: false,
    event: false,
    library: false,
    export: false,
    statusOverride: false,
  },
  analytics: {
    gate: false,
    class: false,
    event: false,
    library: false,
    export: false,
  },
  admin: {
    settings: false,
    events: false,
    classes: false,
    roster: false,
    ids: false,
    users: false,
    factoryReset: false,
    rosterImport: false,
    rosterRegister: false,
    rosterDemo: false,
    rosterPhotos: false,
  },
};

export type PermissionGroupAccent =
  | "teal"
  | "sky"
  | "indigo"
  | "amber"
  | "emerald";

export type PermissionGroup = {
  title: string;
  description?: string;
  /** When set, this detail group is controlled by views.<parentView> */
  parentView?: keyof AppPermissions["views"];
  icon: "scanner" | "summary" | "analytics" | "admin" | "user";
  accent: PermissionGroupAccent;
  keys: { path: string; label: string; hint?: string }[];
};

export const PERMISSION_ACCENT_STYLES: Record<
  PermissionGroupAccent,
  {
    panel: string;
    header: string;
    headerBar: string;
    iconWrap: string;
    icon: string;
    badge: string;
    border: string;
    desc: string;
    masterLabel: string;
    masterIconWrap: string;
    masterBadge: string;
  }
> = {
  teal: {
    panel: "border-teal-700 bg-teal-50",
    header: "text-white",
    headerBar: "border-teal-800 bg-teal-700",
    iconWrap: "bg-white/20 text-white ring-white/30",
    icon: "text-white",
    badge: "bg-white/20 text-white",
    border: "border-teal-700",
    desc: "text-teal-100",
    masterLabel: "text-teal-900",
    masterIconWrap: "bg-teal-700 text-white ring-teal-800/30",
    masterBadge: "bg-teal-100 text-teal-800",
  },
  sky: {
    panel: "border-sky-700 bg-sky-50",
    header: "text-white",
    headerBar: "border-sky-800 bg-sky-700",
    iconWrap: "bg-white/20 text-white ring-white/30",
    icon: "text-white",
    badge: "bg-white/20 text-white",
    border: "border-sky-700",
    desc: "text-sky-100",
    masterLabel: "text-sky-900",
    masterIconWrap: "bg-sky-700 text-white ring-sky-800/30",
    masterBadge: "bg-sky-100 text-sky-800",
  },
  indigo: {
    panel: "border-indigo-700 bg-indigo-50",
    header: "text-white",
    headerBar: "border-indigo-800 bg-indigo-700",
    iconWrap: "bg-white/20 text-white ring-white/30",
    icon: "text-white",
    badge: "bg-white/20 text-white",
    border: "border-indigo-700",
    desc: "text-indigo-100",
    masterLabel: "text-indigo-900",
    masterIconWrap: "bg-indigo-700 text-white ring-indigo-800/30",
    masterBadge: "bg-indigo-100 text-indigo-800",
  },
  amber: {
    panel: "border-amber-700 bg-amber-50",
    header: "text-white",
    headerBar: "border-amber-800 bg-amber-700",
    iconWrap: "bg-white/20 text-white ring-white/30",
    icon: "text-white",
    badge: "bg-white/20 text-white",
    border: "border-amber-700",
    desc: "text-amber-100",
    masterLabel: "text-amber-950",
    masterIconWrap: "bg-amber-700 text-white ring-amber-800/30",
    masterBadge: "bg-amber-100 text-amber-900",
  },
  emerald: {
    panel: "border-emerald-700 bg-emerald-50",
    header: "text-white",
    headerBar: "border-emerald-800 bg-emerald-700",
    iconWrap: "bg-white/20 text-white ring-white/30",
    icon: "text-white",
    badge: "bg-white/20 text-white",
    border: "border-emerald-700",
    desc: "text-emerald-100",
    masterLabel: "text-emerald-900",
    masterIconWrap: "bg-emerald-700 text-white ring-emerald-800/30",
    masterBadge: "bg-emerald-100 text-emerald-800",
  },
};

export const NAV_MASTER_KEYS: {
  path: `views.${keyof AppPermissions["views"]}`;
  view: keyof AppPermissions["views"];
  label: string;
  hint: string;
  icon: "scanner" | "summary" | "analytics" | "admin";
  accent: PermissionGroupAccent;
}[] = [
  {
    path: "views.scanner",
    view: "scanner",
    label: "Scanning Kiosk",
    hint: "Controls all scanner targets below",
    icon: "scanner",
    accent: "teal",
  },
  {
    path: "views.summary",
    view: "summary",
    label: "Summary & Logs",
    hint: "Controls all summary logs, export, and overrides",
    icon: "summary",
    accent: "sky",
  },
  {
    path: "views.analytics",
    view: "analytics",
    label: "Analytics",
    hint: "Controls all analytics targets and export",
    icon: "analytics",
    accent: "indigo",
  },
  {
    path: "views.admin",
    view: "admin",
    label: "Admin Control",
    hint: "Controls admin modules and roster actions",
    icon: "admin",
    accent: "amber",
  },
];

/** Detail permission groups (not including Navigation masters). */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: "Scanner targets",
    parentView: "scanner",
    description: "Requires Scanning Kiosk to be on",
    icon: "scanner",
    accent: "teal",
    keys: [
      { path: "scanner.gate", label: "Campus Gate" },
      { path: "scanner.class", label: "Class Session" },
      { path: "scanner.event", label: "Events" },
      { path: "scanner.library", label: "School Library" },
    ],
  },
  {
    title: "Summary & Logs",
    parentView: "summary",
    description: "Requires Summary & Logs to be on",
    icon: "summary",
    accent: "sky",
    keys: [
      { path: "summary.general", label: "General / Gate log" },
      { path: "summary.class", label: "Class log" },
      { path: "summary.event", label: "Event log" },
      { path: "summary.library", label: "Library log" },
      { path: "summary.export", label: "Export spreadsheets" },
      { path: "summary.statusOverride", label: "Manual status override" },
    ],
  },
  {
    title: "Analytics",
    parentView: "analytics",
    description: "Requires Analytics to be on",
    icon: "analytics",
    accent: "indigo",
    keys: [
      { path: "analytics.gate", label: "Gate analytics" },
      { path: "analytics.class", label: "Class analytics" },
      { path: "analytics.event", label: "Event analytics" },
      { path: "analytics.library", label: "Library analytics" },
      { path: "analytics.export", label: "Export analytics report" },
    ],
  },
  {
    title: "Admin modules",
    parentView: "admin",
    description: "Requires Admin Control to be on",
    icon: "admin",
    accent: "amber",
    keys: [
      { path: "admin.settings", label: "Settings" },
      { path: "admin.events", label: "Events & venues" },
      { path: "admin.classes", label: "Classes" },
      { path: "admin.roster", label: "Roster" },
      { path: "admin.ids", label: "ID Cards" },
      {
        path: "admin.users",
        label: "User management",
        hint: "Create accounts, resets, access toggles",
      },
      { path: "admin.factoryReset", label: "Factory reset all data" },
    ],
  },
  {
    title: "Roster actions",
    parentView: "admin",
    description: "Requires Admin Control to be on",
    icon: "user",
    accent: "emerald",
    keys: [
      { path: "admin.rosterImport", label: "Import roster files" },
      { path: "admin.rosterRegister", label: "Register members" },
      { path: "admin.rosterDemo", label: "Load demo data" },
      { path: "admin.rosterPhotos", label: "Upload / remove photos" },
    ],
  },
];

function setAllKeysInSection(
  perms: AppPermissions,
  section: "scanner" | "summary" | "analytics" | "admin",
  enabled: boolean,
  allowDangerous: boolean,
): AppPermissions {
  const next = structuredClone(perms);
  const block = next[section] as Record<string, boolean>;
  for (const key of Object.keys(block)) {
    if (
      !allowDangerous &&
      section === "admin" &&
      (key === "users" || key === "factoryReset")
    ) {
      block[key] = false;
      continue;
    }
    block[key] = enabled;
  }
  return next;
}

/**
 * Master nav toggle: turns the view on/off and cascades all child permissions.
 * Off → all children off. On → all children on (then refine below).
 */
export function applyViewMasterToggle(
  perms: AppPermissions,
  view: keyof AppPermissions["views"],
  enabled: boolean,
  allowDangerous: boolean,
): AppPermissions {
  let next = setPermissionAt(perms, `views.${view}`, enabled);
  if (view === "scanner") {
    next = setAllKeysInSection(next, "scanner", enabled, allowDangerous);
  } else if (view === "summary") {
    next = setAllKeysInSection(next, "summary", enabled, allowDangerous);
  } else if (view === "analytics") {
    next = setAllKeysInSection(next, "analytics", enabled, allowDangerous);
  } else if (view === "admin") {
    next = setAllKeysInSection(next, "admin", enabled, allowDangerous);
  }
  return next;
}

export function getPermissionAt(
  perms: AppPermissions,
  path: string,
): boolean {
  const parts = path.split(".");
  let cur: unknown = perms;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return false;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur === true;
}

export function setPermissionAt(
  perms: AppPermissions,
  path: string,
  value: boolean,
): AppPermissions {
  const parts = path.split(".");
  const next = structuredClone(perms) as AppPermissions;
  let cur: Record<string, unknown> = next as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
  return next;
}

export function mergePermissions(
  base: AppPermissions,
  patch?: Partial<AppPermissions> | null,
): AppPermissions {
  if (!patch) return structuredClone(base);
  return {
    views: { ...base.views, ...patch.views },
    scanner: { ...base.scanner, ...patch.scanner },
    summary: { ...base.summary, ...patch.summary },
    analytics: { ...base.analytics, ...patch.analytics },
    admin: { ...base.admin, ...patch.admin },
  };
}

export function normalizePermissions(raw: unknown): AppPermissions {
  // Deny-by-default so missing keys never inherit staff defaults as grants.
  if (!raw || typeof raw !== "object") {
    return structuredClone(DENY_ALL_PERMISSIONS);
  }
  return mergePermissions(DENY_ALL_PERMISSIONS, raw as Partial<AppPermissions>);
}
