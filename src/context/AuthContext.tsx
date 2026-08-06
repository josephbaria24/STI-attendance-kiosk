"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  ALL_PERMISSIONS,
  getPermissionAt,
  normalizePermissions,
  type AppPermissions,
} from "@/lib/permissions";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { ToastItem, ToastType, ViewId } from "@/lib/types";

export type AuthProfile = {
  id: string;
  username: string;
  displayName: string;
  isSuperadmin: boolean;
  isActive: boolean;
  permissions: AppPermissions;
};

type AuthContextValue = {
  ready: boolean;
  session: Session | null;
  user: User | null;
  profile: AuthProfile | null;
  accessToken: string | null;
  toasts: ToastItem[];
  showToast: (title: string, message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;
  login: (
    username: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  can: (path: string) => boolean;
  canView: (view: ViewId) => boolean;
  canManageUsers: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function mapProfileRow(row: Record<string, unknown>): AuthProfile {
  const isSuperadmin = Boolean(row.is_superadmin);
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name ?? ""),
    isSuperadmin,
    isActive: Boolean(row.is_active),
    permissions: isSuperadmin
      ? structuredClone(ALL_PERMISSIONS)
      : normalizePermissions(row.permissions),
  };
}

async function loadProfileForUser(userId: string): Promise<AuthProfile | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("app_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const profile = mapProfileRow(data as Record<string, unknown>);
  if (!profile.isActive) return null;
  return profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback(
    (title: string, message: string, type: ToastType = "success") => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, title, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshProfile = useCallback(async () => {
    const sb = getSupabase();
    const { data } = await sb.auth.getSession();
    const s = data.session;
    setSession(s);
    if (!s?.user) {
      setProfile(null);
      return;
    }
    const p = await loadProfileForUser(s.user.id);
    if (!p) {
      await sb.auth.signOut();
      setSession(null);
      setProfile(null);
      return;
    }
    setProfile(p);
  }, []);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    async function init() {
      if (!isSupabaseConfigured()) {
        if (mounted) setReady(true);
        return;
      }
      try {
        const sb = getSupabase();
        const { data } = await sb.auth.getSession();
        if (!mounted) return;
        setSession(data.session);
        if (data.session?.user) {
          const p = await loadProfileForUser(data.session.user.id);
          if (!mounted) return;
          if (!p) {
            await sb.auth.signOut();
            setSession(null);
            setProfile(null);
          } else {
            setProfile(p);
          }
        }
        const { data: sub } = sb.auth.onAuthStateChange(async (_event, next) => {
          setSession(next);
          if (!next?.user) {
            setProfile(null);
            return;
          }
          const p = await loadProfileForUser(next.user.id);
          if (!p) {
            await sb.auth.signOut();
            setProfile(null);
            return;
          }
          setProfile(p);
        });
        unsubscribe = () => sub.subscription.unsubscribe();
      } catch {
        /* ignore */
      } finally {
        if (mounted) setReady(true);
      }
    }

    void init();
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const u = username.trim();
    const p = password;
    if (!u || !p) {
      return { ok: false as const, error: "Enter username and password." };
    }
    if (!isSupabaseConfigured()) {
      return {
        ok: false as const,
        error: "Supabase is not configured.",
      };
    }

    try {
      const sb = getSupabase();
      const { data: email, error: resolveErr } = await sb.rpc(
        "resolve_login_email",
        { p_username: u },
      );

      if (resolveErr) {
        return {
          ok: false as const,
          error: resolveErr.message || "Could not resolve account.",
        };
      }
      if (!email || typeof email !== "string") {
        return {
          ok: false as const,
          error: "Invalid username or password.",
        };
      }

      const { error: signErr } = await sb.auth.signInWithPassword({
        email,
        password: p,
      });
      if (signErr) {
        return {
          ok: false as const,
          error: "Invalid username or password.",
        };
      }

      const { data: sess } = await sb.auth.getSession();
      if (!sess.session?.user) {
        return { ok: false as const, error: "Sign-in failed." };
      }

      const profileRow = await loadProfileForUser(sess.session.user.id);
      if (!profileRow) {
        await sb.auth.signOut();
        return {
          ok: false as const,
          error: "Account is disabled or missing a profile.",
        };
      }

      setSession(sess.session);
      setProfile(profileRow);
      return { ok: true as const };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Sign-in failed.",
      };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (isSupabaseConfigured()) {
        await getSupabase().auth.signOut();
      }
    } finally {
      setSession(null);
      setProfile(null);
    }
  }, []);

  const can = useCallback(
    (path: string) => {
      if (!profile) return false;
      if (profile.isSuperadmin) return true;
      if (!getPermissionAt(profile.permissions, path)) return false;
      // Child permissions require their module master (Navigation) to be on
      if (path.startsWith("scanner.")) {
        return getPermissionAt(profile.permissions, "views.scanner");
      }
      if (path.startsWith("summary.")) {
        return getPermissionAt(profile.permissions, "views.summary");
      }
      if (path.startsWith("analytics.")) {
        return getPermissionAt(profile.permissions, "views.analytics");
      }
      if (path.startsWith("admin.")) {
        return getPermissionAt(profile.permissions, "views.admin");
      }
      return true;
    },
    [profile],
  );

  const canView = useCallback(
    (view: ViewId) => can(`views.${view}`),
    [can],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      profile,
      accessToken: session?.access_token ?? null,
      toasts,
      showToast,
      dismissToast,
      login,
      logout,
      refreshProfile,
      can,
      canView,
      canManageUsers: Boolean(
        profile?.isSuperadmin || profile?.permissions.admin.users,
      ),
    }),
    [
      ready,
      session,
      profile,
      toasts,
      showToast,
      dismissToast,
      login,
      logout,
      refreshProfile,
      can,
      canView,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export async function authFetch(
  input: string,
  accessToken: string,
  init?: RequestInit,
) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}
