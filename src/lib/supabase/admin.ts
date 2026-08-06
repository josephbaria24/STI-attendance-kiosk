import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

/** Server-only Supabase client with service role (bypasses RLS). */
export function getServiceSupabase() {
  if (admin) return admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL for admin APIs",
    );
  }

  admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export function usernameToAuthEmail(username: string) {
  return `${username.trim().toLowerCase()}@attendx.local`;
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;

export function isValidUsername(username: string) {
  return USERNAME_RE.test(normalizeUsername(username));
}
