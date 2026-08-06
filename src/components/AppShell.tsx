"use client";

import { useEffect, useState } from "react";
import { AttendanceProvider, useAttendance } from "@/context/AttendanceContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import type { ViewId } from "@/lib/types";
import { Sidebar } from "./Sidebar";
import { ToastContainer } from "./ToastContainer";
import { ScanNotificationModal, StatusModal } from "./Modals";
import { ScannerView } from "./ScannerView";
import { SummaryView } from "./SummaryView";
import { AnalyticsView } from "./AnalyticsView";
import { AdminView } from "./AdminView";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";
import { FloatingScannerFab } from "./FloatingScannerFab";
import { LoginPage } from "./LoginPage";
import { AuthToastContainer } from "./AuthToastContainer";

const VIEW_ORDER: ViewId[] = ["scanner", "summary", "analytics", "admin"];

function AppInner({ onLogout }: { onLogout: () => void }) {
  const { ready, view, setView } = useAttendance();
  const { canView, can } = useAuth();

  useEffect(() => {
    if (view !== "scanner") {
      (
        window as unknown as { __attendxStopScanner?: () => void }
      ).__attendxStopScanner?.();
    }
  }, [view]);

  useEffect(() => {
    if (!ready) return;
    if (canView(view)) return;
    const fallback = VIEW_ORDER.find((v) => canView(v));
    if (fallback) setView(fallback);
  }, [ready, view, canView, setView]);

  if (!ready) {
    return (
      <div className="app-shell flex h-screen w-full items-center justify-center">
        <div className="glass-card relative z-10 rounded-2xl px-8 py-6 text-center">
          <div className="page-title text-xl font-extrabold text-[var(--sidebar)]">
            Attendance Pro
          </div>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Loading workspace…
          </p>
        </div>
      </div>
    );
  }

  const showFab = can("views.scanner");

  return (
    <div className="app-shell flex h-screen flex-col overflow-hidden text-slate-800 md:flex-row">
      <ServiceWorkerRegister />
      <ToastContainer />
      <Sidebar
        onLogout={onLogout}
        onNavigate={(id) => {
          if (!canView(id)) return;
          if (id !== "scanner") {
            (
              window as unknown as { __attendxStopScanner?: () => void }
            ).__attendxStopScanner?.();
          }
          setView(id);
        }}
      />
      <main className="main-pane relative z-10 min-h-0 flex-1 overflow-y-auto p-4 pt-1 md:p-8 md:pl-2">
        {canView("scanner") && (
          <div
            className={view === "scanner" ? "view-enter block" : "hidden"}
            aria-hidden={view !== "scanner"}
          >
            <ScannerView />
          </div>
        )}
        {view === "summary" && canView("summary") && (
          <div key="summary" className="view-enter">
            <SummaryView />
          </div>
        )}
        {view === "analytics" && canView("analytics") && (
          <div key="analytics" className="view-enter">
            <AnalyticsView />
          </div>
        )}
        {view === "admin" && canView("admin") && (
          <div key="admin" className="view-enter">
            <AdminView />
          </div>
        )}
      </main>
      {showFab && <FloatingScannerFab />}
      <ScanNotificationModal />
      <StatusModal />
    </div>
  );
}

function AuthGate() {
  const { ready, profile, logout } = useAuth();
  const [gateTick, setGateTick] = useState(0);

  if (!ready) {
    return (
      <div className="app-shell flex h-screen w-full items-center justify-center">
        <div className="glass-card relative z-10 rounded-2xl px-8 py-6 text-center">
          <div className="page-title text-xl font-extrabold text-[var(--sidebar)]">
            Attendance Pro
          </div>
          <p className="mt-2 text-sm font-medium text-slate-500">Loading…</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <>
        <AuthToastContainer />
        <LoginPage
          onSuccess={() => {
            setGateTick((n) => n + 1);
          }}
        />
      </>
    );
  }

  return (
    <AttendanceProvider key={gateTick}>
      <AppInner
        onLogout={async () => {
          (
            window as unknown as { __attendxStopScanner?: () => void }
          ).__attendxStopScanner?.();
          await logout();
        }}
      />
    </AttendanceProvider>
  );
}

export function AppShell() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
