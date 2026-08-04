"use client";

import { useEffect } from "react";
import { AttendanceProvider, useAttendance } from "@/context/AttendanceContext";
import { Sidebar } from "./Sidebar";
import { ToastContainer } from "./ToastContainer";
import { ScanNotificationModal, StatusModal } from "./Modals";
import { ScannerView } from "./ScannerView";
import { SummaryView } from "./SummaryView";
import { AnalyticsView } from "./AnalyticsView";
import { AdminView } from "./AdminView";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";
import { FloatingScannerFab } from "./FloatingScannerFab";

function AppInner() {
  const { ready, view, setView } = useAttendance();

  useEffect(() => {
    if (view !== "scanner") {
      (
        window as unknown as { __attendxStopScanner?: () => void }
      ).__attendxStopScanner?.();
    }
  }, [view]);

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

  return (
    <div className="app-shell flex h-screen flex-col overflow-hidden text-slate-800 md:flex-row">
      <ServiceWorkerRegister />
      <ToastContainer />
      <Sidebar
        onNavigate={(id) => {
          if (id !== "scanner") {
            (
              window as unknown as { __attendxStopScanner?: () => void }
            ).__attendxStopScanner?.();
          }
          setView(id);
        }}
      />
      <main className="main-pane relative z-10 min-h-0 flex-1 overflow-y-auto p-4 pt-1 md:p-8 md:pl-2">
        <div
          className={view === "scanner" ? "view-enter block" : "hidden"}
          aria-hidden={view !== "scanner"}
        >
          <ScannerView />
        </div>
        {view === "summary" && (
          <div key="summary" className="view-enter">
            <SummaryView />
          </div>
        )}
        {view === "analytics" && (
          <div key="analytics" className="view-enter">
            <AnalyticsView />
          </div>
        )}
        {view === "admin" && (
          <div key="admin" className="view-enter">
            <AdminView />
          </div>
        )}
      </main>
      <FloatingScannerFab />
      <ScanNotificationModal />
      <StatusModal />
    </div>
  );
}

export function AppShell() {
  return (
    <AttendanceProvider>
      <AppInner />
    </AttendanceProvider>
  );
}
