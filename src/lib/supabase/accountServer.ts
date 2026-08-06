import { createClient, type User } from "@supabase/supabase-js";
import {
  ALL_PERMISSIONS,
  normalizePermissions,
  type AppPermissions,
} from "@/lib/permissions";
import { getServiceSupabase } from "./admin";

export type AppProfile = {
  id: string;
  username: string;
  display_name: string;
  is_superadmin: boolean;
  is_active: boolean;
  permissions: AppPermissions;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type PasswordResetRequest = {
  id: string;
  username: string;
  note: string;
  status: "pending" | "resolved" | "rejected";
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  admin_note: string;
  target_user_id: string | null;
};

function mapProfile(row: Record<string, unknown>): AppProfile {
  return {
    id: String(row.id),
    username: String(row.username),
    display_name: String(row.display_name ?? ""),
    is_superadmin: Boolean(row.is_superadmin),
    is_active: Boolean(row.is_active),
    permissions: row.is_superadmin
      ? structuredClone(ALL_PERMISSIONS)
      : normalizePermissions(row.permissions),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    created_by: row.created_by ? String(row.created_by) : null,
  };
}

export async function getUserFromBearer(authHeader: string | null): Promise<
  | { ok: true; user: User; token: string }
  | { ok: false; error: string; status: number }
> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, error: "Missing authorization", status: 401 };
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false, error: "Missing authorization", status: 401 };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, error: "Server misconfigured", status: 500 };
  }

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, error: "Invalid session", status: 401 };
  }

  return { ok: true, user: data.user as User, token };
}

export async function requireUserManager(authHeader: string | null): Promise<
  | { ok: true; user: User; profile: AppProfile; token: string }
  | { ok: false; error: string; status: number }
> {
  const auth = await getUserFromBearer(authHeader);
  if (!auth.ok) return auth;

  const admin = getServiceSupabase();
  const { data, error } = await admin
    .from("app_profiles")
    .select("*")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "Profile not found", status: 403 };
  }

  const profile = mapProfile(data as Record<string, unknown>);
  if (!profile.is_active) {
    return { ok: false, error: "Account disabled", status: 403 };
  }

  const canManage =
    profile.is_superadmin || profile.permissions.admin.users === true;
  if (!canManage) {
    return {
      ok: false,
      error: "User management permission required",
      status: 403,
    };
  }

  return { ok: true, user: auth.user, profile, token: auth.token };
}

export async function fetchProfileById(id: string): Promise<AppProfile | null> {
  const admin = getServiceSupabase();
  const { data, error } = await admin
    .from("app_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapProfile(data as Record<string, unknown>);
}

export async function listProfiles(): Promise<AppProfile[]> {
  const admin = getServiceSupabase();
  const { data, error } = await admin
    .from("app_profiles")
    .select("*")
    .order("username", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapProfile(row as Record<string, unknown>));
}

export { mapProfile };
