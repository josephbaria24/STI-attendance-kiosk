"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { inputClass } from "./ui";
import { HugeIcon } from "./icons";

const TEAL = "#004953";

function WavyDivider() {
  return (
    <svg
      className="block w-full"
      viewBox="0 0 480 56"
      preserveAspectRatio="none"
      height="56"
      aria-hidden
    >
      <path
        d="M0 28
           C40 8, 80 8, 120 28
           S200 48, 240 28
           S320 8, 360 28
           S440 48, 480 28
           L480 56 L0 56 Z"
        fill={TEAL}
      />
    </svg>
  );
}

function LoginIllustration() {
  return (
    <svg
      viewBox="0 0 320 220"
      className="mx-auto w-full max-w-[280px]"
      aria-hidden
    >
      <defs>
        <linearGradient id="loginGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0d9488" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#004953" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <ellipse cx="160" cy="190" rx="110" ry="16" fill="#004953" opacity="0.12" />
      <rect
        x="48"
        y="36"
        width="140"
        height="140"
        rx="24"
        fill="url(#loginGlow)"
        stroke="#004953"
        strokeWidth="2"
        opacity="0.9"
      />
      <rect
        x="68"
        y="56"
        width="100"
        height="100"
        rx="12"
        fill="#fff"
        stroke="#004953"
        strokeWidth="1.5"
        opacity="0.95"
      />
      {/* QR-style mark */}
      <rect x="82" y="70" width="28" height="28" rx="3" fill="#004953" />
      <rect x="126" y="70" width="28" height="28" rx="3" fill="#004953" />
      <rect x="82" y="114" width="28" height="28" rx="3" fill="#004953" />
      <rect x="118" y="114" width="12" height="12" rx="2" fill="#0d9488" />
      <rect x="136" y="114" width="18" height="8" rx="2" fill="#004953" />
      <rect x="118" y="134" width="36" height="8" rx="2" fill="#004953" />
      <rect x="90" y="78" width="12" height="12" rx="1" fill="#fff" />
      <rect x="134" y="78" width="12" height="12" rx="1" fill="#fff" />
      <rect x="90" y="122" width="12" height="12" rx="1" fill="#fff" />
      {/* Phone / scan device */}
      <rect
        x="198"
        y="58"
        width="72"
        height="118"
        rx="14"
        fill="#fff"
        stroke="#004953"
        strokeWidth="2"
      />
      <rect x="210" y="74" width="48" height="72" rx="6" fill="#e0f2f1" />
      <circle cx="234" cy="162" r="8" fill="#004953" opacity="0.85" />
      <path
        d="M186 96 C176 108, 176 128, 192 138"
        fill="none"
        stroke="#0d9488"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M178 90 C164 108, 164 136, 188 150"
        fill="none"
        stroke="#004953"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* Clock badge */}
      <circle cx="250" cy="48" r="22" fill="#004953" />
      <circle cx="250" cy="48" r="16" fill="#fff" opacity="0.15" />
      <circle cx="250" cy="48" r="3" fill="#7dd3fc" />
      <line
        x1="250"
        y1="48"
        x2="250"
        y2="38"
        stroke="#7dd3fc"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="250"
        y1="48"
        x2="258"
        y2="52"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={20}
        height={20}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5" />
      <path d="M9.4 5.2A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a16.4 16.4 0 0 1-3.2 4.1" />
      <path d="M6.1 6.1A16.3 16.3 0 0 0 2.5 12S6 19 12 19a10.2 10.2 0 0 0 4.2-.9" />
    </svg>
  );
}

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const { login, showToast } = useAuth();
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [resetNote, setResetNote] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "reset") {
        if (!username.trim()) {
          showToast(
            "Missing Username",
            "Enter your username to request a reset.",
            "warning",
          );
          return;
        }
        const res = await fetch("/api/auth/reset-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, note: resetNote }),
        });
        const data = (await res.json()) as { error?: string; message?: string };
        if (!res.ok) {
          showToast(
            "Reset Request Failed",
            data.error || "Could not submit request.",
            "error",
          );
          return;
        }
        showToast(
          "Reset Requested",
          data.message ||
            "An admin will review this and assign a new password.",
          "success",
        );
        setResetNote("");
        return;
      }

      if (!username.trim() || !password) {
        showToast(
          "Missing Credentials",
          "Enter username and password.",
          "warning",
        );
        return;
      }

      const result = await login(username, password);
      if (!result.ok) {
        showToast("Sign In Failed", result.error, "error");
        return;
      }
      showToast("Signed In", "Welcome back.", "success");
      onSuccess();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell flex min-h-screen items-center justify-center p-4 md:p-8">
      <div className="relative z-10 flex w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-slate-800 shadow-2xl shadow-black/20 md:flex-row md:min-h-[540px]">
        {/* Brand / illustration panel — mirrors sidebar */}
        <div className="relative flex w-full flex-col md:w-[44%]">
          <div className="border-b border-slate-200 px-6 py-6 md:border-b-0 md:px-8 md:pt-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/25">
                <HugeIcon
                  name="scanner"
                  size={20}
                  className="text-[var(--primary)]"
                />
              </div>
              <div>
                <div className="page-title text-xl font-extrabold tracking-tight text-slate-800">
                  Attendance Pro
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  AttendX
                </div>
              </div>
            </div>
          </div>

          <div className="hidden flex-1 flex-col px-6 pt-2 md:flex md:px-8">
            <p className="mb-4 max-w-[240px] text-sm font-medium leading-relaxed text-slate-500">
              Sign in to open the scanning kiosk, logs, and admin controls.
            </p>
            <div className="flex flex-1 items-end justify-center pb-2">
              <LoginIllustration />
            </div>
          </div>

          <div className="mt-auto">
            <WavyDivider />
            <div
              className="px-6 pb-6 pt-1 text-center md:px-8"
              style={{ backgroundColor: TEAL }}
            >
              <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
                <div className="mb-1.5 flex justify-center text-sky-300">
                  <HugeIcon name="clock" size={18} className="opacity-90" />
                </div>
                <p className="page-title m-0 text-base font-bold text-white">
                  Secure workspace access
                </p>
                <p className="mt-1 text-[12px] font-medium text-white/65">
                  JP ODASCO · AttendX v7.3
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="flex flex-1 flex-col justify-center border-t border-slate-200 px-6 py-8 md:border-l md:border-t-0 md:px-10 md:py-12">
          <div className="mb-8">
            <h1 className="page-title m-0 text-2xl font-extrabold tracking-tight text-slate-800">
              {mode === "login" ? "Welcome back" : "Request password reset"}
            </h1>
            <p className="mt-1.5 text-sm font-medium text-slate-500">
              {mode === "login"
                ? "Enter your credentials to continue."
                : "An admin will see your request and assign a new password. No email is sent."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-username"
                className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]"
              >
                Username
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <HugeIcon name="user" size={18} />
                </span>
                <input
                  id="login-username"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`${inputClass} pl-11`}
                  placeholder="Enter username"
                  disabled={busy}
                />
              </div>
            </div>

            {mode === "login" ? (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="login-password"
                  className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-11`}
                    placeholder="Enter password"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="reset-note"
                  className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]"
                >
                  Note for admin (optional)
                </label>
                <textarea
                  id="reset-note"
                  value={resetNote}
                  onChange={(e) => setResetNote(e.target.value)}
                  className={`${inputClass} min-h-[88px] resize-y`}
                  placeholder="e.g. Forgot password after weekend shift"
                  disabled={busy}
                  maxLength={500}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--primary)]/25 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
            >
              <HugeIcon name="timeIn" size={18} className="text-white" />
              {busy
                ? mode === "login"
                  ? "Signing in…"
                  : "Submitting…"
                : mode === "login"
                  ? "Sign in"
                  : "Send reset request"}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode((m) => (m === "login" ? "reset" : "login"));
              }}
              className="text-sm font-semibold text-[var(--primary)] transition hover:underline"
            >
              {mode === "login"
                ? "Forgot password? Request a reset"
                : "Back to sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
