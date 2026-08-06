/** @deprecated Prefer AuthContext + Supabase Auth. Kept for any leftover imports. */

export type AuthSession = {
  username: string;
  loggedInAt: string;
};

export function readSession(): AuthSession | null {
  return null;
}

export function clearSession() {
  /* no-op — use AuthContext.logout */
}

export function writeSession(_username: string): AuthSession {
  return { username: _username, loggedInAt: new Date().toISOString() };
}

export function authenticate(
  _username: string,
  _password: string,
): { ok: true; session: AuthSession } | { ok: false; error: string } {
  return {
    ok: false,
    error: "Use Supabase Auth via AuthContext.login",
  };
}
