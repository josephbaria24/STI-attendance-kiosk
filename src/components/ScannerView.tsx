"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useAttendance } from "@/context/AttendanceContext";
import { useAuth } from "@/context/AuthContext";
import { resumeAudio } from "@/lib/audio";
import { Button, Card, Field, PageHeader, SectionTitle, inputClass } from "./ui";
import { HugeIcon } from "./icons";
import { Combobox } from "./ui/combobox";
import { classLabel } from "@/lib/types";
import { formatDisplayTime, getTargetCutoffs, memberDetails } from "@/lib/utils";

function nowHms(d = new Date()) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function isAppleTouchDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS desktop UA
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function patchScannerVideo(rootId: string) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const videos = root.querySelectorAll("video");
  videos.forEach((video) => {
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("autoplay", "true");
    video.setAttribute("muted", "true");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    // Avoid iOS hijacking into native fullscreen player
    try {
      (video as HTMLVideoElement & { disablePictureInPicture?: boolean }).disablePictureInPicture =
        true;
    } catch {
      /* ignore */
    }
    video.style.objectFit = "cover";
    video.style.width = "100%";
    video.style.height = "100%";
    void video.play().catch(() => undefined);
  });
}

export function ScannerView() {
  const {
    db,
    view,
    scanMode,
    setScanMode,
    classSubject,
    setClassSubject,
    sessionIo,
    setSessionIo,
    currentEventId,
    setCurrentEventId,
    consoleLogs,
    logConsole,
    processAttendanceRecord,
    showToast,
  } = useAttendance();
  const { can } = useAuth();

  const readerDomId = `qr-reader-${useId().replace(/:/g, "")}`;
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [running, setRunning] = useState(false);
  const [scannerReadiness, setScannerReadiness] = useState<{
    secure: boolean;
    cameraApi: boolean;
    permission: "granted" | "denied" | "prompt" | "unknown";
  }>({
    secure: true,
    cameraApi: true,
    permission: "unknown",
  });
  const [manualId, setManualId] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const manualWrapRef = useRef<HTMLDivElement | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const runningRef = useRef(false);
  const wantRunningRef = useRef(false);
  const startingRef = useRef(false);
  const lastScan = useRef({ data: "", time: 0 });
  const processRef = useRef(processAttendanceRecord);
  const isOpen = db.settings.thresholdMode === "open";
  const [clockNow, setClockNow] = useState(() => new Date());
  const activeEvents = (db.events || []).filter((e) => e.active);
  const activeClasses = (db.classes || []).filter((c) => c.active);
  const selectedEvent = activeEvents.find((e) => e.id === currentEventId);
  const selectedClass = activeClasses.find((c) => c.id === classSubject);

  const manualMatches = useMemo(() => {
    const q = manualId.toLowerCase().trim();
    const list = db.students || [];
    if (!q) return list;
    return list.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.distinction || "").toLowerCase().includes(q)
    );
  }, [db.students, manualId]);

  type AttendanceTarget = "gate" | "class" | "event" | "library";
  const canGate = can("scanner.gate");
  const canClass = can("scanner.class");
  const canEvent = can("scanner.event");
  const canLibrary = can("scanner.library");

  const attendanceTarget: AttendanceTarget =
    scanMode === "class"
      ? "class"
      : scanMode === "event"
        ? "event"
        : scanMode === "library"
          ? "library"
          : "gate";

  useEffect(() => {
    const allowed: Record<AttendanceTarget, boolean> = {
      gate: canGate,
      class: canClass,
      event: canEvent,
      library: canLibrary,
    };
    if (allowed[attendanceTarget]) return;
    if (canGate) selectGate();
    else if (canClass) selectClass();
    else if (canLibrary) selectLibrary();
    else if (canEvent) {
      const first = (db.events || []).find((e) => e.active);
      if (first) selectEvent(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canGate, canClass, canEvent, canLibrary, attendanceTarget]);

  const ioActive =
    attendanceTarget === "gate"
      ? scanMode === "in" || scanMode === "out"
        ? scanMode
        : "in"
      : sessionIo;

  function selectGate() {
    const dir = sessionIo === "out" && outAllowed ? "out" : "in";
    setScanMode(dir);
  }

  function selectClass() {
    setScanMode("class");
  }

  function selectEvent(eventId: string) {
    setCurrentEventId(eventId);
    setScanMode("event");
  }

  function selectLibrary() {
    setScanMode("library");
  }

  const cutoffTarget =
    attendanceTarget === "class" || attendanceTarget === "event"
      ? attendanceTarget
      : "gate";
  const targetCutoffs = getTargetCutoffs(db.settings, cutoffTarget);
  const timeoutCutoff = `${targetCutoffs.timeoutTime || "16:00"}:00`;
  const outAllowed = isOpen || nowHms(clockNow) >= timeoutCutoff;
  const timeoutLabel = formatDisplayTime(
    targetCutoffs.timeoutTime || "16:00",
    db.settings.timeFormat || "12h"
  );

  function setIoDirection(dir: "in" | "out") {
    if (dir === "out" && !outAllowed) return;
    setSessionIo(dir);
    if (attendanceTarget === "gate") setScanMode(dir);
  }

  useEffect(() => {
    processRef.current = processAttendanceRecord;
  }, [processAttendanceRecord]);

  useEffect(() => {
    const tick = () => setClockNow(new Date());
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (outAllowed || ioActive !== "out") return;
    setSessionIo("in");
    if (attendanceTarget === "gate") setScanMode("in");
  }, [outAllowed, ioActive, attendanceTarget, setSessionIo, setScanMode]);

  useEffect(() => {
    if (!manualOpen) return;
    function onDocDown(e: MouseEvent) {
      if (!manualWrapRef.current?.contains(e.target as Node)) {
        setManualOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [manualOpen]);

  function submitManual() {
    if (!manualId.trim()) return;
    processAttendanceRecord(manualId.trim());
    setManualId("");
    setManualOpen(false);
  }

  const stopScanner = useCallback(
    async (opts?: { userInitiated?: boolean }) => {
      if (opts?.userInitiated) {
        wantRunningRef.current = false;
      }

      const scanner = scannerRef.current;
      if (!scanner) {
        runningRef.current = false;
        setRunning(false);
        return;
      }

      try {
        // html5-qrcode owns #reader children — stop before React touches that node
        if (runningRef.current) {
          await scanner.stop();
        }
      } catch {
        /* already stopped */
      }

      try {
        scanner.clear();
      } catch {
        /* ignore */
      }

      scannerRef.current = null;
      runningRef.current = false;
      setRunning(false);
      if (opts?.userInitiated) {
        logConsole("Scanner Offline.");
      }
    },
    [logConsole],
  );

  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      wantRunningRef.current = false;
      if (!scanner) return;
      runningRef.current = false;
      scannerRef.current = null;
      // Fire-and-forget cleanup; avoid React/DOM race on unmount
      scanner
        .stop()
        .catch(() => undefined)
        .finally(() => {
          try {
            scanner.clear();
          } catch {
            /* node may already be gone */
          }
        });
    };
  }, []);

  async function refreshCameras() {
    try {
      const list = await Html5Qrcode.getCameras();
      setCameras(
        (list || []).map((c) => ({
          id: c.id,
          label: c.label || `Camera Hardware (${c.id.slice(0, 5)}...)`,
        }))
      );
    } catch {
      /* camera list optional until permission */
    }
  }

  useEffect(() => {
    refreshCameras();
  }, []);

  useEffect(() => {
    let mounted = true;

    async function refreshScannerReadiness() {
      const secure =
        typeof window !== "undefined"
          ? window.isSecureContext || window.location.hostname === "localhost"
          : true;
      const cameraApi =
        typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia);

      let permission: "granted" | "denied" | "prompt" | "unknown" = "unknown";
      try {
        if (
          typeof navigator !== "undefined" &&
          "permissions" in navigator &&
          navigator.permissions?.query
        ) {
          const res = await navigator.permissions.query({
            name: "camera" as PermissionName,
          });
          permission =
            res.state === "granted" || res.state === "denied" || res.state === "prompt"
              ? res.state
              : "unknown";
        }
      } catch {
        permission = "unknown";
      }

      if (!mounted) return;
      setScannerReadiness({ secure, cameraApi, permission });
    }

    void refreshScannerReadiness();
    const onVisibility = () => {
      if (!document.hidden) void refreshScannerReadiness();
    };
    window.addEventListener("focus", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted = false;
      window.removeEventListener("focus", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  async function startScanner() {
    if (startingRef.current) return;
    if (runningRef.current && scannerRef.current) {
      patchScannerVideo(readerDomId);
      return;
    }

    wantRunningRef.current = true;
    resumeAudio();

    if (
      typeof window !== "undefined" &&
      !window.isSecureContext &&
      location.hostname !== "localhost"
    ) {
      logConsole("Scanner blocked: HTTPS required by browser camera policy.");
      showToast(
        "Secure Context Required",
        "Camera access needs HTTPS in production (or localhost in development).",
        "error"
      );
      return;
    }

    if (
      typeof navigator !== "undefined" &&
      (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
    ) {
      logConsole("Scanner blocked: mediaDevices API unavailable.");
      showToast(
        "Camera Not Supported",
        "This browser does not expose camera APIs required for scanning.",
        "error"
      );
      return;
    }

    startingRef.current = true;

    // Ensure previous instance is fully released (keep wantRunning)
    if (scannerRef.current) {
      await stopScanner();
      wantRunningRef.current = true;
    }

    const apple = isAppleTouchDevice();

    const dynamicQrBox = (
      viewfinderWidth: number,
      viewfinderHeight: number
    ) => {
      const minimalBound = Math.min(viewfinderWidth, viewfinderHeight);
      const activeBoxEdge = Math.floor(minimalBound * (apple ? 0.72 : 0.68));
      return { width: activeBoxEdge, height: activeBoxEdge };
    };

    const scanConfig = apple
      ? { fps: 8, qrbox: dynamicQrBox }
      : { fps: 20, qrbox: dynamicQrBox, aspectRatio: 1.0 };

    const cameraConfigs: Array<string | MediaTrackConstraints> = [];
    if (cameraId) {
      cameraConfigs.push({ deviceId: { exact: cameraId } });
      cameraConfigs.push({ deviceId: cameraId });
    }
    cameraConfigs.push({ facingMode: { ideal: "environment" } });
    cameraConfigs.push({ facingMode: "environment" });
    cameraConfigs.push({ facingMode: "user" });

    let started = false;
    let lastError: unknown;

    try {
      for (const config of cameraConfigs) {
        if (!wantRunningRef.current) break;
        try {
          const scanner = new Html5Qrcode(readerDomId);
          scannerRef.current = scanner;
          await scanner.start(
            config,
            scanConfig,
            (text) => {
              const now = Date.now();
              if (
                text === lastScan.current.data &&
                now - lastScan.current.time < 2500
              )
                return;
              lastScan.current = { data: text, time: now };

              let id = text.trim();
              try {
                const parsed = JSON.parse(text) as {
                  studentId?: string;
                  id?: string;
                };
                if (parsed.studentId) id = parsed.studentId;
                else if (parsed.id) id = parsed.id;
              } catch {
                /* plain id */
              }
              processRef.current(id);
            },
            () => undefined
          );
          started = true;
          break;
        } catch (err) {
          lastError = err;
          try {
            scannerRef.current?.clear();
          } catch {
            /* ignore */
          }
          scannerRef.current = null;
        }
      }

      if (!started || !wantRunningRef.current) {
        throw lastError || new Error("Camera start failed");
      }

      runningRef.current = true;
      setRunning(true);
      patchScannerVideo(readerDomId);
      // iOS sometimes mounts video a tick later
      window.setTimeout(() => patchScannerVideo(readerDomId), 120);
      window.setTimeout(() => patchScannerVideo(readerDomId), 400);
      logConsole("Scanner Online.");
      setTimeout(refreshCameras, 1000);
    } catch {
      scannerRef.current = null;
      runningRef.current = false;
      setRunning(false);
      logConsole("Scanner Hardware Error: Check permissions.");
      showToast(
        "Camera Access Error",
        "Please allow camera access inside browser/app configurations.",
        "error"
      );
    } finally {
      startingRef.current = false;
    }
  }

  const startScannerRef = useRef(startScanner);
  startScannerRef.current = startScanner;

  // Auto-start when entering Scanning Kiosk (avoids extra tap on iOS)
  useEffect(() => {
    if (view !== "scanner") {
      wantRunningRef.current = false;
      return;
    }
    wantRunningRef.current = true;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      void startScannerRef.current();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [view]);

  // iOS Safari pauses/blacks the camera when the tab backgrounds — resume or restart
  useEffect(() => {
    let reviveTimer: number | undefined;

    async function reviveCamera() {
      if (document.hidden || view !== "scanner" || !wantRunningRef.current) {
        return;
      }
      if (startingRef.current) return;

      const video = document
        .getElementById(readerDomId)
        ?.querySelector("video") as HTMLVideoElement | null;

      if (runningRef.current && video) {
        patchScannerVideo(readerDomId);
        if (!video.paused && video.readyState >= 2) return;
        try {
          await video.play();
          if (!video.paused && video.readyState >= 2) return;
        } catch {
          /* fall through to full restart */
        }
      }

      await stopScanner();
      wantRunningRef.current = true;
      window.setTimeout(() => {
        if (wantRunningRef.current && view === "scanner") {
          void startScannerRef.current();
        }
      }, 200);
    }

    function onVisibility() {
      if (document.hidden) return;
      window.clearTimeout(reviveTimer);
      reviveTimer = window.setTimeout(() => {
        void reviveCamera();
      }, 350);
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    return () => {
      window.clearTimeout(reviveTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
    };
  }, [view, readerDomId, stopScanner]);

  useEffect(() => {
    (
      window as unknown as {
        __attendxStopScanner?: () => void;
        __attendxStartScanner?: () => void;
      }
    ).__attendxStopScanner = () => {
      void stopScanner({ userInitiated: true });
    };
    (
      window as unknown as { __attendxStartScanner?: () => void }
    ).__attendxStartScanner = () => {
      wantRunningRef.current = true;
      void startScannerRef.current();
    };
    return () => {
      const w = window as unknown as {
        __attendxStopScanner?: () => void;
        __attendxStartScanner?: () => void;
      };
      delete w.__attendxStopScanner;
      delete w.__attendxStartScanner;
    };
  }, [stopScanner]);

  const ioLabel =
    attendanceTarget === "library"
      ? "Auto In / Out"
      : ioActive === "out"
        ? "Time Out"
        : "Time In";
  let targetTitle = "Campus Gate";
  let targetDetail = "Daily roster";
  let targetTone = "gate" as "gate" | "class" | "event" | "library" | "warn";

  if (attendanceTarget === "class") {
    if (selectedClass) {
      targetTitle = selectedClass.name;
      targetDetail = selectedClass.section || "Class session";
      targetTone = "class";
    } else {
      targetTitle = "Class Session";
      targetDetail = "Select a subject below";
      targetTone = "warn";
    }
  } else if (attendanceTarget === "library") {
    targetTitle = "School Library";
    targetDetail = "Auto In / Out · 1 min cooldown";
    targetTone = "library";
  } else if (attendanceTarget === "event") {
    if (selectedEvent) {
      targetTitle = selectedEvent.name;
      targetDetail = selectedEvent.location || selectedEvent.category;
      targetTone = "event";
    } else {
      targetTitle = "Event / Venue";
      targetDetail = "Select an event below";
      targetTone = "warn";
    }
  }

  const targetToneClass =
    targetTone === "class"
      ? "bg-teal-600 text-white ring-teal-300/40"
      : targetTone === "event"
        ? "bg-amber-500 text-white ring-amber-200/50"
        : targetTone === "library"
          ? "bg-indigo-600 text-white ring-indigo-300/40"
          : targetTone === "warn"
            ? "bg-orange-500 text-white ring-orange-200/50"
            : "bg-white text-[var(--primary)] ring-white/70";

  const scanTargetAside = (
    <div
      className={`max-w-[min(100%,22rem)] rounded-2xl px-3.5 py-2.5 shadow-lg ring-2 ${targetToneClass}`}
    >
      <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] opacity-80">
        Scanning into
      </div>
      <div className="mt-0.5 truncate text-sm font-extrabold leading-tight">
        {targetTitle}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="truncate text-[11px] font-semibold opacity-90">
          {targetDetail}
        </span>
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
            attendanceTarget === "library"
              ? "bg-indigo-800 text-white"
              : ioActive === "out"
                ? "bg-orange-600 text-white"
                : "bg-sky-600 text-white"
          }`}
        >
          {ioLabel}
        </span>
      </div>
    </div>
  );

  return (
    <section>
      <PageHeader
        title="Scanning Kiosk"
        subtitle="Live check-in station for QR and manual attendance"
        icon={<HugeIcon name="scanner" size={22} />}
        aside={scanTargetAside}
      />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <SectionTitle>1. Select Mode</SectionTitle>
            <span
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold tracking-wide ${
                attendanceTarget === "library"
                  ? "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200"
                  : isOpen
                    ? "bg-sky-100 text-sky-800 ring-1 ring-sky-200"
                    : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
              }`}
            >
              {attendanceTarget === "library"
                ? "No Strict Rules"
                : isOpen
                  ? "Open Time Active"
                  : "Strict Rules Enforced"}
            </span>
          </div>

          {attendanceTarget === "library" ? (
            <div className="mb-5 rounded-xl bg-indigo-600 px-3 py-2.5 text-center text-sm font-bold text-white">
              LIBRARY AUTO MODE — no Strict rules · first scan = In, next after 1
              min = Out
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-slate-100/90 p-1 ring-1 ring-slate-200/80">
                {(
                  [
                    ["in", "TIME IN", "bg-sky-600", "timeIn"],
                    ["out", "TIME OUT", "bg-orange-500", "timeOut"],
                  ] as const
                ).map(([mode, label, activeBg, iconName]) => {
                  const locked = mode === "out" && !outAllowed;
                  return (
                    <button
                      key={mode}
                      type="button"
                      disabled={locked}
                      aria-disabled={locked}
                      title={
                        locked
                          ? `Time Out unlocks at ${timeoutLabel} (Strict Mode)`
                          : undefined
                      }
                      onClick={() => setIoDirection(mode)}
                      className={`group mode-btn-anim flex min-w-[72px] flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-center text-sm font-bold ${
                        locked
                          ? "cursor-not-allowed bg-slate-200/80 text-slate-400 opacity-60"
                          : ioActive === mode
                            ? `${activeBg} text-white shadow-sm`
                            : mode === "in"
                              ? "text-sky-700 hover:bg-sky-50 hover:text-sky-800"
                              : "text-orange-700 hover:bg-orange-50 hover:text-orange-800"
                      }`}
                    >
                      <HugeIcon
                        name={iconName}
                        size={16}
                        className="icon-pop opacity-90"
                      />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              {!isOpen && !outAllowed && (
                <p className="mb-5 text-[12px] font-medium text-slate-500">
                  Strict Mode — Time Out unlocks at {timeoutLabel}.
                </p>
              )}

              {isOpen && attendanceTarget === "gate" && (
                <div className="mb-5 rounded-xl bg-[var(--primary)] px-3 py-2.5 text-center text-sm font-bold text-white">
                  OPEN TIME MODE — gate scans auto-toggle In / Out
                </div>
              )}

              {attendanceTarget !== "gate" && (
                <p className="mb-5 text-[12px] font-medium text-slate-500">
                  Time In / Out applies to the selected class or event (separate
                  from campus gate).
                </p>
              )}
            </>
          )}

          <SectionTitle>2. Select Attendance Target</SectionTitle>
          <p className="mb-3 mt-1 text-[13px] text-slate-500">
            Choose campus gate, class session, school library, or an
            admin-created event below.
          </p>

          <div className="mb-4 grid grid-cols-3 gap-1.5">
            {canGate && (
            <button
              type="button"
              onClick={selectGate}
              className={`group flex flex-col items-start gap-1 rounded-lg border p-2 text-left transition duration-200 sm:flex-row sm:items-center sm:gap-2 ${
                attendanceTarget === "gate"
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <HugeIcon
                name="timeIn"
                size={14}
                className={`shrink-0 icon-pop ${
                  attendanceTarget === "gate"
                    ? "text-white"
                    : "text-slate-400"
                }`}
              />
              <span className="min-w-0">
                <span
                  className={`block text-[11px] font-bold leading-tight sm:text-xs ${
                    attendanceTarget === "gate" ? "text-white" : "text-slate-800"
                  }`}
                >
                  Campus Gate
                </span>
                <span
                  className={`mt-0.5 block text-[9px] leading-tight sm:text-[10px] ${
                    attendanceTarget === "gate"
                      ? "text-white/75"
                      : "text-slate-500"
                  }`}
                >
                  Daily roster
                </span>
              </span>
            </button>
            )}

            {canClass && (
            <button
              type="button"
              onClick={selectClass}
              className={`group flex flex-col items-start gap-1 rounded-lg border p-2 text-left transition duration-200 sm:flex-row sm:items-center sm:gap-2 ${
                attendanceTarget === "class"
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <HugeIcon
                name="classMode"
                size={14}
                className={`shrink-0 icon-pop ${
                  attendanceTarget === "class"
                    ? "text-white"
                    : "text-slate-400"
                }`}
              />
              <span className="min-w-0">
                <span
                  className={`block text-[11px] font-bold leading-tight sm:text-xs ${
                    attendanceTarget === "class"
                      ? "text-white"
                      : "text-slate-800"
                  }`}
                >
                  Class Session
                </span>
                <span
                  className={`mt-0.5 block text-[9px] leading-tight sm:text-[10px] ${
                    attendanceTarget === "class"
                      ? "text-white/75"
                      : "text-slate-500"
                  }`}
                >
                  Subject check-in
                </span>
              </span>
            </button>
            )}

            {canLibrary && (
            <button
              type="button"
              onClick={selectLibrary}
              className={`group flex flex-col items-start gap-1 rounded-lg border p-2 text-left transition duration-200 sm:flex-row sm:items-center sm:gap-2 ${
                attendanceTarget === "library"
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <HugeIcon
                name="book"
                size={14}
                className={`shrink-0 icon-pop ${
                  attendanceTarget === "library"
                    ? "text-white"
                    : "text-slate-400"
                }`}
              />
              <span className="min-w-0">
                <span
                  className={`block text-[11px] font-bold leading-tight sm:text-xs ${
                    attendanceTarget === "library"
                      ? "text-white"
                      : "text-slate-800"
                  }`}
                >
                  School Library
                </span>
                <span
                  className={`mt-0.5 block text-[9px] leading-tight sm:text-[10px] ${
                    attendanceTarget === "library"
                      ? "text-white/75"
                      : "text-slate-500"
                  }`}
                >
                  Auto in / out
                </span>
              </span>
            </button>
            )}
          </div>

          {attendanceTarget === "class" && (
            <div className="mb-5 rounded-xl border border-teal-600 bg-teal-600 p-3.5 text-white">
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-white">
                Target Subject / Classroom
              </label>
              {activeClasses.length === 0 ? (
                <p className="mt-2 text-sm text-white/85">
                  No classes yet. Add subjects in Admin Control → Classes.
                </p>
              ) : (
                <div className="mt-1.5">
                  <Combobox
                    options={activeClasses.map((c) => ({
                      value: c.id,
                      label: c.name,
                      description: c.section || undefined,
                    }))}
                    value={classSubject}
                    onValueChange={setClassSubject}
                    placeholder="Select subject / classroom…"
                    searchPlaceholder="Search subject or section…"
                    emptyText="No matching subject or section."
                    triggerClassName="border-white bg-white text-slate-800"
                  />
                </div>
              )}
              {selectedClass && (
                <p className="mt-2 text-[12px] font-medium text-white/90">
                  Selected: <strong>{classLabel(selectedClass)}</strong>
                </p>
              )}
            </div>
          )}

          {canEvent && (
          <>
          <div className="mb-3.5 flex items-center gap-2 px-1 text-slate-400">
            <span className="h-px flex-1 bg-slate-300" />
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em]">
              or
            </span>
            <span className="h-px flex-1 bg-slate-300" />
          </div>

          <div className="mb-5 rounded-xl border border-[var(--primary)] bg-[var(--primary)] p-3.5 text-white">
            <div className="mb-2 flex items-center gap-2">
              <HugeIcon name="event" size={18} className="text-white" />
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-white">
                School Events & Venues
              </label>
            </div>
            <p className="mb-2.5 text-[12px] text-white/85">
              Created by admin — campus events, labs, and more. School Library
              uses its own target above (not an event).
            </p>
            {activeEvents.length === 0 ? (
              <p className="text-sm text-white/85">
                No active events yet. Add them in Admin Control → Events.
              </p>
            ) : (
              <div className="grid gap-2">
                {activeEvents.map((e) => {
                  const selected =
                    attendanceTarget === "event" && currentEventId === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => selectEvent(e.id)}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                        selected
                          ? "border-white bg-white text-[var(--primary)] shadow-sm"
                          : "border-white/40 bg-[var(--primary-hover)] text-white hover:bg-[var(--primary)]"
                      }`}
                    >
                      <span>
                        <span
                          className={`block text-sm font-bold ${
                            selected ? "text-[var(--primary)]" : "text-white"
                          }`}
                        >
                          {e.name}
                        </span>
                        <span
                          className={`text-[11px] font-semibold uppercase tracking-wide ${
                            selected ? "text-[var(--primary)]" : "text-white/80"
                          }`}
                        >
                          {e.category}
                          {e.location ? ` · ${e.location}` : ""}
                        </span>
                      </span>
                      {selected && (
                        <HugeIcon
                          name="check"
                          size={16}
                          className="text-[var(--primary)]"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          </>
          )}

          {isOpen &&
            attendanceTarget !== "gate" &&
            attendanceTarget !== "library" && (
            <div className="mb-2 rounded-lg bg-sky-50 px-3 py-2 text-[12px] font-medium text-sky-800 ring-1 ring-sky-100">
              Gate open-time auto in/out is paused while Class / Event target is
              active. Use Time In / Out above for this session.
            </div>
          )}
        </Card>

        <Card id="kiosk-scanner-section" className="flex flex-col scroll-mt-4">
          <SectionTitle>3. Kiosk Scanner</SectionTitle>
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-600">
            <span className="font-bold text-slate-700">Scanner readiness:</span>{" "}
            {scannerReadiness.secure ? "Secure Context OK" : "Needs HTTPS"} ·{" "}
            {scannerReadiness.cameraApi ? "Camera API OK" : "Camera API Missing"} ·{" "}
            Permission:{" "}
            <span
              className={
                scannerReadiness.permission === "granted"
                  ? "text-emerald-700"
                  : scannerReadiness.permission === "denied"
                    ? "text-red-600"
                    : scannerReadiness.permission === "prompt"
                      ? "text-amber-700"
                      : "text-slate-500"
              }
            >
              {scannerReadiness.permission}
            </span>
          </div>
          <div className="mb-3" />
          <Field label="Select Camera Hardware">
            <select
              className={inputClass}
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
            >
              <option value="">Auto-Detect (Rear Camera)</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="mb-4 flex flex-wrap gap-2.5">
            <Button
              variant="success"
              className="flex-1"
              disabled={running}
              onClick={() => void startScanner()}
            >
              <HugeIcon name="camera" size={16} className="icon-pop" />
              Start Scanner
            </Button>
            {running && (
              <Button
                variant="danger"
                onClick={() => void stopScanner({ userInitiated: true })}
              >
                <HugeIcon name="stop" size={16} className="icon-pop" />
                Stop
              </Button>
            )}
          </div>

          {/*
            Keep React children OUT of #reader — html5-qrcode mutates that node.
            Placeholder is a sibling overlay so React never removeChilds library nodes.
          */}
          <div className="relative mb-6 min-h-[220px] w-full overflow-hidden rounded-2xl border-2 border-dashed border-emerald-200/80 bg-gradient-to-b from-slate-50 to-emerald-50/40">
            {!running && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-5 text-center text-sm font-medium text-slate-500">
                Camera feed will appear here
              </div>
            )}
            <div id={readerDomId} className="relative z-0 min-h-[220px] w-full" />
          </div>

          <SectionTitle>Manual Entry</SectionTitle>
          <div className="mb-3" />
          <Field label="Member ID Number">
            <div className="flex gap-2">
              <div ref={manualWrapRef} className="relative min-w-0 flex-1">
                <div className="flex gap-1">
                  <input
                    className={inputClass}
                    value={manualId}
                    onChange={(e) => {
                      setManualId(e.target.value);
                      setManualOpen(true);
                    }}
                    onFocus={() => setManualOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitManual();
                      }
                      if (e.key === "Escape") setManualOpen(false);
                    }}
                    placeholder="Enter ID or Name..."
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    aria-label="Show members"
                    aria-expanded={manualOpen}
                    onClick={() => setManualOpen((v) => !v)}
                    className="inline-flex h-[42px] w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      aria-hidden
                    >
                      <path
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d={manualOpen ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"}
                      />
                    </svg>
                  </button>
                </div>

                {manualOpen && (
                  <div className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    <div className="max-h-[220px] overflow-y-auto overscroll-contain p-1">
                      {manualMatches.length === 0 ? (
                        <p className="px-3 py-4 text-center text-sm text-slate-500">
                          No members match.
                        </p>
                      ) : (
                        manualMatches.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setManualId(s.id);
                              setManualOpen(false);
                            }}
                            className="flex w-full flex-col rounded-lg px-3 py-2 text-left transition hover:bg-slate-100"
                          >
                            <span className="text-sm font-semibold text-slate-800">
                              {s.name}
                            </span>
                            <span className="text-[11px] font-medium text-slate-500">
                              {s.id}
                              {s.distinction ? ` · ${s.distinction}` : ""}
                              {" · "}
                              {memberDetails(s)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <Button onClick={submitManual}>Submit</Button>
            </div>
          </Field>

          <div className="mt-6 mb-3">
            <SectionTitle>Recent System Logs</SectionTitle>
          </div>
          <div className="max-h-[200px] flex-1 overflow-y-auto rounded-xl bg-black p-3.5 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-[var(--accent-sky)] ring-1 ring-white/10">
            {consoleLogs.map((line, i) => (
              <div key={`${i}-${line.slice(0, 24)}`} className="py-0.5">
                {line}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
