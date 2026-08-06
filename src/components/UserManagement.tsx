"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch, useAuth } from "@/context/AuthContext";
import { useAttendance } from "@/context/AttendanceContext";
import {
  DEFAULT_STAFF_PERMISSIONS,
  NAV_MASTER_KEYS,
  PERMISSION_ACCENT_STYLES,
  PERMISSION_GROUPS,
  applyViewMasterToggle,
  getPermissionAt,
  setPermissionAt,
  type AppPermissions,
} from "@/lib/permissions";
import { Badge, Button, Card, Field, SectionTitle, inputClass } from "./ui";
import { HugeIcon } from "./icons";

type ManagedUser = {
  id: string;
  username: string;
  display_name: string;
  is_superadmin: boolean;
  is_active: boolean;
  permissions: AppPermissions;
  created_at: string;
};

type ResetRequest = {
  id: string;
  username: string;
  note: string;
  status: "pending" | "resolved" | "rejected";
  requested_at: string;
  admin_note: string;
  assigned_password?: string | null;
  previous_password?: string | null;
};

function Toggle({
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-3 py-2.5 transition ${
        checked
          ? "border-[var(--primary)]/30 bg-[var(--primary)]/5"
          : "border-slate-200 bg-white"
      } ${disabled ? "cursor-not-allowed opacity-50" : "hover:border-slate-300"}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800">
          {label}
        </span>
        {hint && (
          <span className="mt-0.5 block text-[11px] text-slate-500">{hint}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-[var(--primary)]" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

function PermissionEditor({
  value,
  onChange,
  disabled,
  allowDangerous,
}: {
  value: AppPermissions;
  onChange: (next: AppPermissions) => void;
  disabled?: boolean;
  allowDangerous: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const group of PERMISSION_GROUPS) {
      const parentOn = group.parentView ? value.views[group.parentView] : true;
      init[group.title] = parentOn;
    }
    return init;
  });

  // Keep locked groups collapsed by default when a master turns off
  useEffect(() => {
    setExpanded((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const group of PERMISSION_GROUPS) {
        const parentOn = group.parentView
          ? value.views[group.parentView]
          : true;
        if (!parentOn && next[group.title]) {
          next[group.title] = false;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [value.views]);

  function toggleExpanded(title: string) {
    setExpanded((prev) => ({ ...prev, [title]: !prev[title] }));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Master navigation controls */}
      <div className="overflow-hidden rounded-2xl border-2 border-[var(--primary)]/25 bg-gradient-to-br from-[var(--primary)]/[0.07] via-white to-teal-50/80 shadow-sm">
        <div className="flex items-start gap-3 border-b border-[var(--primary)]/15 bg-[var(--primary)] px-4 py-3 text-white sm:px-5">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <HugeIcon name="admin" size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
              Main access
            </div>
            <h3 className="page-title m-0 text-base font-extrabold tracking-tight">
              Module masters
            </h3>
            <p className="mt-0.5 text-[12px] font-medium text-white/75">
              Turn a module off to hide it from the sidebar and clear every
              permission under it.
            </p>
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          {NAV_MASTER_KEYS.map((master) => {
            const checked = getPermissionAt(value, master.path);
            const accent = PERMISSION_ACCENT_STYLES[master.accent];
            return (
              <label
                key={master.path}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3.5 py-3.5 transition ${
                  checked
                    ? `${accent.border} bg-white shadow-sm`
                    : "border-slate-200/90 bg-white/70 opacity-90"
                } ${disabled ? "cursor-not-allowed opacity-50" : "hover:brightness-[0.99]"}`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${accent.masterIconWrap}`}
                >
                  <HugeIcon
                    name={master.icon}
                    size={18}
                    className={accent.icon}
                  />
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  disabled={disabled}
                  onClick={() => {
                    const next = applyViewMasterToggle(
                      value,
                      master.view,
                      !checked,
                      allowDangerous,
                    );
                    onChange(next);
                    // Expand detail groups for this master when turning on
                    if (!checked) {
                      setExpanded((prev) => {
                        const copy = { ...prev };
                        for (const g of PERMISSION_GROUPS) {
                          if (g.parentView === master.view) copy[g.title] = true;
                        }
                        return copy;
                      });
                    }
                  }}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                    checked ? "bg-[var(--primary)]" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                      checked ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={`block text-sm font-extrabold ${accent.masterLabel}`}
                    >
                      {master.label}
                    </span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        checked
                          ? accent.masterBadge
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {checked ? "On" : "Off"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                    {master.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Detail groups — disabled when parent master is off */}
      <div className="flex flex-col gap-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
          Detail controls
        </div>
        {PERMISSION_GROUPS.map((group) => {
          const parentOn = group.parentView
            ? value.views[group.parentView]
            : true;
          const accent = PERMISSION_ACCENT_STYLES[group.accent];
          const isOpen = Boolean(expanded[group.title]);
          return (
            <div
              key={group.title}
              className={`overflow-hidden rounded-xl border-2 transition ${accent.panel} ${
                parentOn ? "" : "opacity-55"
              }`}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                aria-label={
                  isOpen ? `Collapse ${group.title}` : `Expand ${group.title}`
                }
                onClick={() => toggleExpanded(group.title)}
                className={`flex w-full flex-wrap items-center gap-3 px-3.5 py-3 text-left ${accent.headerBar} transition hover:brightness-110`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${accent.iconWrap}`}
                >
                  <HugeIcon
                    name={group.icon}
                    size={17}
                    className={accent.icon}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      className={`text-[12px] font-extrabold uppercase tracking-wider ${accent.header}`}
                    >
                      {group.title}
                    </div>
                    {!parentOn && (
                      <span className="rounded-md bg-black/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Locked — turn on module master
                      </span>
                    )}
                  </div>
                  {group.description && (
                    <p className={`mt-0.5 text-[12px] ${accent.desc}`}>
                      {group.description}
                    </p>
                  )}
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-white/25">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width={18}
                    height={18}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-transform duration-200 ${
                      isOpen ? "rotate-180" : "rotate-0"
                    }`}
                    aria-hidden
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>
              <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div
                      className={`grid gap-2 border-t bg-white p-3.5 sm:grid-cols-2 ${accent.border} transition-opacity duration-200 ${
                        isOpen ? "opacity-100 delay-75" : "opacity-0"
                      }`}
                    >
                      {group.keys.map((key) => {
                        const locked =
                          disabled ||
                          !parentOn ||
                          (!allowDangerous &&
                            (key.path === "admin.users" ||
                              key.path === "admin.factoryReset"));
                        return (
                          <Toggle
                            key={key.path}
                            label={key.label}
                            hint={key.hint}
                            checked={
                              parentOn && getPermissionAt(value, key.path)
                            }
                            disabled={locked}
                            onChange={(v) =>
                              onChange(setPermissionAt(value, key.path, v))
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UserManagement() {
  const { accessToken, profile, canManageUsers } = useAuth();
  const { showToast } = useAttendance();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPerms, setNewPerms] = useState<AppPermissions>(
    structuredClone(DEFAULT_STAFF_PERMISSIONS),
  );
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPerms, setEditPerms] = useState<AppPermissions>(
    structuredClone(DEFAULT_STAFF_PERMISSIONS),
  );
  const [editPassword, setEditPassword] = useState("");
  const [editActive, setEditActive] = useState(true);

  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolvePassword, setResolvePassword] = useState("");
  const [resolveNote, setResolveNote] = useState("");
  const [revealedHistory, setRevealedHistory] = useState<Record<string, boolean>>(
    {},
  );

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests],
  );

  const load = useCallback(async () => {
    if (!accessToken || !canManageUsers) return;
    setLoading(true);
    try {
      const [usersRes, reqRes] = await Promise.all([
        authFetch("/api/admin/users", accessToken),
        authFetch("/api/admin/reset-requests?status=all", accessToken),
      ]);
      const usersJson = (await usersRes.json()) as {
        users?: ManagedUser[];
        error?: string;
      };
      const reqJson = (await reqRes.json()) as {
        requests?: ResetRequest[];
        error?: string;
      };
      if (!usersRes.ok) throw new Error(usersJson.error || "Failed to load users");
      if (!reqRes.ok) throw new Error(reqJson.error || "Failed to load resets");
      setUsers(usersJson.users ?? []);
      setRequests(reqJson.requests ?? []);
    } catch (e) {
      showToast(
        "Load Failed",
        e instanceof Error ? e.message : "Could not load accounts.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, canManageUsers, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canManageUsers) {
    return (
      <Card>
        <SectionTitle>Users</SectionTitle>
        <p className="mt-2 text-sm text-slate-500">
          You do not have permission to manage accounts.
        </p>
      </Card>
    );
  }

  async function createUser() {
    if (!accessToken) return;
    const username = newUsername.trim();
    if (!username) {
      showToast(
        "Missing Username",
        "Enter a username for the new account.",
        "warning",
      );
      return;
    }
    if (newPassword.length < 6) {
      showToast(
        "Weak Password",
        "Password must be at least 6 characters.",
        "warning",
      );
      return;
    }
    setBusy(true);
    try {
      const res = await authFetch("/api/admin/users", accessToken, {
        method: "POST",
        body: JSON.stringify({
          username,
          password: newPassword,
          displayName: newDisplayName,
          permissions: newPerms,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Create failed");
      setCreateOpen(false);
      setNewUsername("");
      setNewPassword("");
      setNewDisplayName("");
      setNewPerms(structuredClone(DEFAULT_STAFF_PERMISSIONS));
      showToast(
        "Account Created",
        `@${username.toLowerCase()} is ready to sign in.`,
        "success",
      );
      await load();
    } catch (e) {
      showToast(
        "Create Failed",
        e instanceof Error ? e.message : "Could not create account.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!accessToken || !editId) return;
    const target = users.find((u) => u.id === editId);
    if (editPassword.trim() && editPassword.trim().length < 6) {
      showToast(
        "Weak Password",
        "New password must be at least 6 characters.",
        "warning",
      );
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        displayName: editDisplayName,
        permissions: editPerms,
        isActive: editActive,
      };
      if (editPassword.trim()) body.password = editPassword.trim();
      const res = await authFetch(`/api/admin/users/${editId}`, accessToken, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Update failed");
      const label = target?.username ? `@${target.username}` : "Account";
      const extras: string[] = [];
      if (editPassword.trim()) extras.push("password updated");
      if (target && target.is_active !== editActive) {
        extras.push(editActive ? "activated" : "disabled");
      }
      showToast(
        "Account Updated",
        extras.length
          ? `${label} saved (${extras.join(", ")}).`
          : `${label} changes saved.`,
        "success",
      );
      setEditId(null);
      setEditPassword("");
      await load();
    } catch (e) {
      showToast(
        "Update Failed",
        e instanceof Error ? e.message : "Could not save account.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(id: string, username: string) {
    if (!accessToken) return;
    if (!confirm(`Delete account "${username}"? This cannot be undone.`)) {
      showToast("Delete Cancelled", `Kept @${username}.`, "info");
      return;
    }
    setBusy(true);
    try {
      const res = await authFetch(`/api/admin/users/${id}`, accessToken, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Delete failed");
      if (editId === id) setEditId(null);
      showToast("Account Deleted", `@${username} was removed.`, "warning");
      await load();
    } catch (e) {
      showToast(
        "Delete Failed",
        e instanceof Error ? e.message : "Could not delete account.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(id: string, action: "resolve" | "reject") {
    if (!accessToken) return;
    const req = requests.find((r) => r.id === id);
    const label = req?.username ? `@${req.username}` : "Request";
    if (action === "resolve" && resolvePassword.trim().length < 6) {
      showToast(
        "Weak Password",
        "New password must be at least 6 characters.",
        "warning",
      );
      return;
    }
    setBusy(true);
    try {
      const res = await authFetch(
        `/api/admin/reset-requests/${id}`,
        accessToken,
        {
          method: "PATCH",
          body: JSON.stringify({
            action,
            newPassword: resolvePassword,
            adminNote: resolveNote,
          }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed");
      setResolveId(null);
      setResolvePassword("");
      setResolveNote("");
      if (action === "resolve") {
        showToast(
          "Password Assigned",
          `New password set for ${label}. Tell them in person.`,
          "success",
        );
      } else {
        showToast(
          "Reset Rejected",
          `${label} password reset was rejected.`,
          "warning",
        );
      }
      await load();
    } catch (e) {
      showToast(
        action === "resolve" ? "Assign Failed" : "Reject Failed",
        e instanceof Error ? e.message : "Could not update reset request.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  const editing = users.find((u) => u.id === editId);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionTitle>Password reset requests</SectionTitle>
            <p className="mt-1 text-[13px] text-slate-500">
              Forgotten-password queue from the login screen. Assign a new
              password here — no email is sent.
            </p>
          </div>
          {pendingCount > 0 && (
            <Badge variant="late">{pendingCount} pending</Badge>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : requests.filter((r) => r.status === "pending").length === 0 ? (
          <p className="text-sm text-slate-500">No pending reset requests.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {requests
              .filter((r) => r.status === "pending")
              .map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-800">
                        @{r.username}
                      </div>
                      <div className="mt-0.5 text-[12px] text-slate-500">
                        {new Date(r.requested_at).toLocaleString()}
                      </div>
                      {r.note && (
                        <p className="mt-2 text-sm text-slate-700">{r.note}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => {
                          setResolveId(r.id);
                          setResolvePassword("");
                          setResolveNote("");
                        }}
                      >
                        Assign password
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void handleReset(r.id, "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>

                  {resolveId === r.id && (
                    <div className="mt-3 grid gap-3 border-t border-amber-200/80 pt-3 sm:grid-cols-2">
                      <Field label="New password">
                        <input
                          type="text"
                          className={inputClass}
                          value={resolvePassword}
                          onChange={(e) => setResolvePassword(e.target.value)}
                          placeholder="At least 6 characters"
                        />
                      </Field>
                      <Field label="Admin note (optional)">
                        <input
                          className={inputClass}
                          value={resolveNote}
                          onChange={(e) => setResolveNote(e.target.value)}
                          placeholder="Told user in person"
                        />
                      </Field>
                      <div className="flex gap-2 sm:col-span-2">
                        <Button
                          type="button"
                          variant="primary"
                          disabled={busy}
                          onClick={() => void handleReset(r.id, "resolve")}
                        >
                          Save new password
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setResolveId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}

        {requests.some((r) => r.status !== "pending") && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-600">
              History
            </summary>
            <ul className="mt-2 space-y-2 text-[13px] text-slate-500">
              {requests
                .filter((r) => r.status !== "pending")
                .slice(0, 20)
                .map((r) => {
                  const shown = Boolean(revealedHistory[r.id]);
                  const hasPw =
                    r.status === "resolved" &&
                    Boolean(r.assigned_password || r.previous_password);
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2"
                    >
                      <span className="min-w-0">
                        @{r.username} — {r.status} ·{" "}
                        {new Date(r.requested_at).toLocaleString()}
                      </span>
                      {hasPw ? (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {shown ? (
                            <span className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-slate-700">
                              <span
                                className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-800 ring-1 ring-emerald-200"
                                title="Password assigned on this reset"
                              >
                                Current: {r.assigned_password || "—"}
                              </span>
                              <span
                                className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 ring-1 ring-slate-200"
                                title="Previous known password before this reset"
                              >
                                Previous: {r.previous_password || "—"}
                              </span>
                            </span>
                          ) : (
                            <span className="font-mono text-[12px] tracking-widest text-slate-400">
                              Current: •••••• · Previous: ••••••
                            </span>
                          )}
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--primary)] transition hover:bg-white"
                            onClick={() =>
                              setRevealedHistory((prev) => ({
                                ...prev,
                                [r.id]: !prev[r.id],
                              }))
                            }
                          >
                            {shown ? "Hide" : "Show password"}
                          </button>
                        </div>
                      ) : r.status === "resolved" ? (
                        <span className="text-[11px] text-slate-400">
                          No stored password
                        </span>
                      ) : null}
                    </li>
                  );
                })}
            </ul>
          </details>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <SectionTitle>Accounts</SectionTitle>
            <p className="mt-1 text-[13px] text-slate-500">
              Create usernames and passwords, then toggle module access.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setCreateOpen((v) => !v);
            }}
          >
            <HugeIcon name="add" size={16} />
            {createOpen ? "Close" : "New account"}
          </Button>
        </div>

        {createOpen && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Username">
                <input
                  className={inputClass}
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. gate.staff"
                  autoComplete="off"
                />
              </Field>
              <Field label="Display name">
                <input
                  className={inputClass}
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Password" className="sm:col-span-2">
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    className={`${inputClass} pr-11`}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-white"
                    onClick={() => setShowNewPassword((v) => !v)}
                  >
                    {showNewPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </Field>
            </div>
            <div className="mt-4">
              <div className="mb-2 text-sm font-bold text-slate-800">
                Access controls
              </div>
              <PermissionEditor
                value={newPerms}
                onChange={setNewPerms}
                allowDangerous={Boolean(profile?.isSuperadmin)}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() => void createUser()}
              >
                Create account
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Loading accounts…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2.5">User</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-800">
                        @{u.username}
                      </div>
                      <div className="text-[12px] text-slate-500">
                        {u.display_name || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {u.is_superadmin ? (
                        <Badge variant="present">Super admin</Badge>
                      ) : (
                        <Badge>Staff</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {u.is_active ? (
                        <span className="font-medium text-emerald-700">
                          Active
                        </span>
                      ) : (
                        <span className="font-medium text-rose-600">
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setEditId(u.id);
                            setEditDisplayName(u.display_name || "");
                            setEditPerms(
                              u.is_superadmin
                                ? structuredClone(DEFAULT_STAFF_PERMISSIONS)
                                : structuredClone(u.permissions),
                            );
                            setEditActive(u.is_active);
                            setEditPassword("");
                          }}
                        >
                          Edit
                        </Button>
                        {!u.is_superadmin && u.id !== profile?.id && (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void deleteUser(u.id, u.username)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editing && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="page-title m-0 text-base font-bold">
                Edit @{editing.username}
              </h3>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditId(null)}
              >
                Close
              </Button>
            </div>
            {editing.is_superadmin ? (
              <p className="mb-3 text-sm text-slate-500">
                Super admins always have full access. You can still set a new
                password or deactivate (not yourself).
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Display name">
                <input
                  className={inputClass}
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                />
              </Field>
              <Field label="New password (optional)">
                <input
                  type="text"
                  className={inputClass}
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Leave blank to keep"
                  autoComplete="new-password"
                />
              </Field>
            </div>
            {editing.id !== profile?.id && (
              <div className="mt-3">
                <Toggle
                  label="Account active"
                  checked={editActive}
                  onChange={setEditActive}
                />
              </div>
            )}
            {!editing.is_superadmin && (
              <div className="mt-4">
                <div className="mb-2 text-sm font-bold text-slate-800">
                  Access controls
                </div>
                <PermissionEditor
                  value={editPerms}
                  onChange={setEditPerms}
                  allowDangerous={Boolean(profile?.isSuperadmin)}
                />
              </div>
            )}
            <div className="mt-4">
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() => void saveEdit()}
              >
                Save changes
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
