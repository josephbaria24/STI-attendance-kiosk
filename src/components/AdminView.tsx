"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import * as XLSX from "xlsx";
import { useAttendance } from "@/context/AttendanceContext";
import { memberDetails } from "@/lib/utils";
import type { EventCategory, Member, Role } from "@/lib/types";
import { EVENT_CATEGORIES, categoryLabel } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  Field,
  PageHeader,
  SectionTitle,
  TableShell,
  inputClass,
} from "./ui";
import { HugeIcon } from "./icons";
import { ExpandableText } from "./ExpandableText";

const MEMBERSHIP_KEY = "attendx_membership_types_v1";
type MembershipMap = Record<Role, string[]>;
const DEFAULT_MEMBERSHIPS: MembershipMap = {
  student: ["Regular", "Scholar", "Athlete", "Officer"],
  faculty: ["Full-time", "Part-time", "Guest Lecturer"],
  admin: ["Registrar", "Guidance", "Finance", "IT Support"],
};

export function AdminView() {
  const {
    db,
    updateSettings,
    factoryReset,
    importRoster,
    loadDemoData,
    registerMember,
    removeMember,
    uploadPhoto,
    removePhoto,
    createEvent,
    updateEvent,
    deleteEvent,
    createClass,
    updateClass,
    deleteClass,
    showToast,
  } = useAttendance();

  const [regRole, setRegRole] = useState<Role>("student");
  const [regId, setRegId] = useState("");
  const [regName, setRegName] = useState("");
  const [regDistinction, setRegDistinction] = useState("SHS");
  const [regGrade, setRegGrade] = useState("");
  const [regSection, setRegSection] = useState("");
  const [regDept, setRegDept] = useState("");
  const [regDesignation, setRegDesignation] = useState("");
  const [regMembership, setRegMembership] = useState("");
  const [membershipDraft, setMembershipDraft] = useState("");
  const [membershipTypes, setMembershipTypes] =
    useState<MembershipMap>(DEFAULT_MEMBERSHIPS);
  const [rosterSearch, setRosterSearch] = useState("");
  const [filterDistinction, setFilterDistinction] = useState("all");
  const [filterGrade, setFilterGrade] = useState("all");
  const [filterSection, setFilterSection] = useState("all");
  const [printTargets, setPrintTargets] = useState<Member[] | null>(null);
  const [evtName, setEvtName] = useState("");
  const [evtCategory, setEvtCategory] = useState<EventCategory>("event");
  const [evtLocation, setEvtLocation] = useState("");
  const [evtDescription, setEvtDescription] = useState("");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importRole, setImportRole] = useState<"student" | "faculty">("student");
  const [importDragOver, setImportDragOver] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [clsName, setClsName] = useState("");
  const [clsSection, setClsSection] = useState("");
  const [clsDescription, setClsDescription] = useState("");
  const [classSearch, setClassSearch] = useState("");
  const [adminTab, setAdminTabState] = useState<
    "settings" | "events" | "classes" | "roster" | "ids"
  >(() => {
    if (typeof window === "undefined") return "settings";
    try {
      const raw = localStorage.getItem("attendx_ui_state_v1");
      const tab = raw
        ? (JSON.parse(raw) as { adminTab?: string }).adminTab
        : undefined;
      if (
        tab === "settings" ||
        tab === "events" ||
        tab === "classes" ||
        tab === "roster" ||
        tab === "ids"
      ) {
        return tab;
      }
    } catch {
      /* ignore */
    }
    return "settings";
  });

  function setAdminTab(
    tab: "settings" | "events" | "classes" | "roster" | "ids"
  ) {
    setAdminTabState(tab);
    try {
      const raw = localStorage.getItem("attendx_ui_state_v1");
      const prev = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        "attendx_ui_state_v1",
        JSON.stringify({ ...prev, adminTab: tab })
      );
    } catch {
      /* ignore */
    }
  }

  const printReady = useRef(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const tabs = [
    { id: "settings" as const, label: "Settings", icon: "admin" as const },
    { id: "events" as const, label: "Events", icon: "event" as const },
    { id: "classes" as const, label: "Classes", icon: "classMode" as const },
    { id: "roster" as const, label: "Roster", icon: "user" as const },
    { id: "ids" as const, label: "ID Cards", icon: "scanner" as const },
  ];

  const filteredStudents = useMemo(() => {
    const q = rosterSearch.toLowerCase().trim();
    if (!q) return db.students;
    return db.students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    );
  }, [db.students, rosterSearch]);

  const grades = useMemo(() => {
    const set = new Set<string>();
    db.students.forEach((s) => {
      if (s.grade && s.grade !== "—") set.add(s.grade);
    });
    return Array.from(set).sort();
  }, [db.students]);

  const sections = useMemo(() => {
    const set = new Set<string>();
    db.students.forEach((s) => {
      if (s.section && s.section !== "—") set.add(s.section);
    });
    return Array.from(set).sort();
  }, [db.students]);

  const galleryStudents = useMemo(() => {
    return filteredStudents.filter((s) => {
      const matchDist =
        filterDistinction === "all" || s.distinction === filterDistinction;
      const matchGrade =
        filterGrade === "all" || s.grade === filterGrade || s.grade === "—";
      const matchSec =
        filterSection === "all" ||
        s.section === filterSection ||
        s.section === "—";
      return matchDist && matchGrade && matchSec;
    });
  }, [filteredStudents, filterDistinction, filterGrade, filterSection]);

  const filteredClasses = useMemo(() => {
    const q = classSearch.toLowerCase().trim();
    const list = db.classes || [];
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.section.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [db.classes, classSearch]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MEMBERSHIP_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<MembershipMap>;
      setMembershipTypes({
        student: parsed.student?.length ? parsed.student : DEFAULT_MEMBERSHIPS.student,
        faculty: parsed.faculty?.length ? parsed.faculty : DEFAULT_MEMBERSHIPS.faculty,
        admin: parsed.admin?.length ? parsed.admin : DEFAULT_MEMBERSHIPS.admin,
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!printTargets) return;
    printReady.current = true;
    // Give React time to mount all QR SVGs before print (scales with batch size)
    const delay = Math.min(2500, 600 + printTargets.length * 8);
    const t = setTimeout(() => {
      window.print();
    }, delay);
    const onAfter = () => setPrintTargets(null);
    window.addEventListener("afterprint", onAfter);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", onAfter);
    };
  }, [printTargets]);

  useEffect(() => {
    const list = membershipTypes[regRole] || [];
    if (regMembership && list.includes(regMembership)) return;
    setRegMembership(list[0] || "");
  }, [membershipTypes, regRole, regMembership]);

  function saveMembershipTypes(next: MembershipMap) {
    setMembershipTypes(next);
    try {
      localStorage.setItem(MEMBERSHIP_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  async function handleRegister() {
    let member: Member;
    if (regRole === "student") {
      member = {
        id: regId.trim(),
        name: regName.trim(),
        role: "student",
        distinction: regDistinction,
        membership: regMembership || "",
        grade: regGrade.trim() || "—",
        section: regSection.trim() || "—",
        dept: "—",
        designation: "—",
        photo: "",
      };
    } else if (regRole === "faculty") {
      member = {
        id: regId.trim(),
        name: regName.trim(),
        role: "faculty",
        distinction: "Faculty",
        membership: regMembership || "",
        grade: "—",
        section: "—",
        dept: regDept.trim() || "General",
        designation: regDesignation.trim() || "Faculty Staff",
        photo: "",
      };
    } else {
      member = {
        id: regId.trim(),
        name: regName.trim(),
        role: "admin",
        distinction: "Admin",
        membership: regMembership || "",
        grade: "—",
        section: "—",
        dept: regDept.trim() || "Administration",
        designation: regDesignation.trim() || "Administrator",
        photo: "",
      };
    }
    const ok = await registerMember(member);
    if (ok) {
      setRegId("");
      setRegName("");
      setRegGrade("");
      setRegSection("");
      setRegDept("");
      setRegDesignation("");
    }
  }

  function handleImport(file: File, role: "student" | "faculty") {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const wb = XLSX.read(e.target?.result, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });

      const newItems: Member[] = rows
        .map((r) => {
          if (role === "student") {
            let parsedDistinction = String(
              r["Distinction"] || r["distinction"] || r["Type"] || r["type"] || ""
            ).trim();
            if (
              parsedDistinction.toLowerCase() === "shs" ||
              parsedDistinction.toLowerCase().includes("senior")
            ) {
              parsedDistinction = "SHS";
            } else if (
              parsedDistinction.toLowerCase() === "tertiary" ||
              parsedDistinction.toLowerCase().includes("college")
            ) {
              parsedDistinction = "Tertiary";
            }
            return {
              id: String(r["Student ID"] || r["ID"] || r["id"] || "").trim(),
              name: String(r["Name"] || r["name"] || "").trim(),
              distinction: parsedDistinction,
              membership: String(
                r["Membership"] || r["membership"] || r["Member Type"] || ""
              ).trim(),
              grade: String(r["Grade"] || r["grade"] || "").trim(),
              section: String(r["Section"] || r["section"] || "").trim(),
              role: "student" as const,
              dept: "—",
              designation: "—",
              photo: "",
            };
          }
          let parsedDistinction = String(
            r["Distinction"] || r["Type"] || r["type"] || ""
          ).trim();
          if (!parsedDistinction) parsedDistinction = "Faculty";
          const assignedRole = parsedDistinction
            .toLowerCase()
            .includes("admin")
            ? ("admin" as const)
            : ("faculty" as const);
          return {
            id: String(
              r["Faculty ID"] || r["Employee ID"] || r["ID"] || r["id"] || ""
            ).trim(),
            name: String(r["Name"] || r["name"] || "").trim(),
            distinction: assignedRole === "admin" ? "Admin" : "Faculty",
            membership: String(
              r["Membership"] || r["membership"] || r["Member Type"] || ""
            ).trim(),
            grade: "—",
            section: "—",
            role: assignedRole,
            dept:
              String(r["Department"] || r["Dept"] || r["department"] || "").trim() ||
              "General",
            designation:
              String(r["Designation"] || r["Title"] || r["Role"] || "").trim() ||
              "Staff",
            photo: "",
          };
        })
        .filter((s) => s.id && s.name);

      if (newItems.length === 0)
        return alert("Formatting failure. Check tracking row columns.");
      await importRoster(newItems);
    };
    reader.readAsArrayBuffer(file);
  }

  function openImportDialog(role: "student" | "faculty") {
    setImportRole(role);
    setImportFile(null);
    setImportDragOver(false);
    setImportDialogOpen(true);
  }

  function closeImportDialog() {
    setImportDialogOpen(false);
    setImportFile(null);
    setImportDragOver(false);
  }

  function downloadTemplate(role: "student" | "faculty") {
    const data =
      role === "student"
        ? [
            {
              "Student ID": "2026-001",
              Name: "Juan Dela Cruz",
              Distinction: "SHS",
              Membership: "Regular",
              Grade: "12",
              Section: "HUMSS - G12",
            },
          ]
        : [
            {
              "Faculty ID": "FAC-001",
              Name: "Maria Santos",
              Distinction: "Faculty",
              Membership: "Full-time",
              Department: "General Education",
              Designation: "Instructor",
            },
            {
              "Faculty ID": "ADM-001",
              Name: "Jose Reyes",
              Distinction: "Admin",
              Membership: "Registrar",
              Department: "Administration",
              Designation: "Registrar",
            },
          ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(
      wb,
      role === "student"
        ? "AttendX_Student_Import_Template.xlsx"
        : "AttendX_Faculty_Admin_Import_Template.xlsx"
    );
  }

  function confirmImportDialog() {
    if (!importFile) {
      showToast("No File Selected", "Choose a CSV/XLSX file first.", "warning");
      return;
    }
    handleImport(importFile, importRole);
    closeImportDialog();
  }

  function onPhotoFile(id: string, file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast(
        "Invalid Matrix Type",
        "Please choose a valid graphical image file.",
        "error"
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => uploadPhoto(id, String(reader.result));
    reader.readAsDataURL(file);
  }

  function printIDs(specificId: string | null = null) {
    let targets: Member[];
    if (specificId) {
      targets = db.students.filter((s) => s.id === specificId);
    } else {
      // Match what the ID Cards gallery currently shows
      targets = [...galleryStudents];
    }
    if (targets.length === 0) {
      showToast("Printing Failed", "Empty matrix scope matching filters.", "error");
      return;
    }
    showToast(
      "Preparing Print",
      `Rendering ${targets.length} ID card${targets.length === 1 ? "" : "s"}…`,
      "info"
    );
    setPrintTargets(targets);
  }

  function addMembershipType() {
    const value = membershipDraft.trim();
    if (!value) return;
    const current = membershipTypes[regRole] || [];
    if (current.some((m) => m.toLowerCase() === value.toLowerCase())) {
      showToast("Duplicate Membership", "Membership type already exists.", "warning");
      return;
    }
    const next = { ...membershipTypes, [regRole]: [...current, value] };
    saveMembershipTypes(next);
    setMembershipDraft("");
    setRegMembership(value);
  }

  function editMembershipType(oldValue: string) {
    const nextValue = prompt("Rename membership type:", oldValue)?.trim();
    if (!nextValue || nextValue === oldValue) return;
    const current = membershipTypes[regRole] || [];
    if (current.some((m) => m.toLowerCase() === nextValue.toLowerCase())) {
      showToast("Duplicate Membership", "Membership type already exists.", "warning");
      return;
    }
    const nextList = current.map((m) => (m === oldValue ? nextValue : m));
    saveMembershipTypes({ ...membershipTypes, [regRole]: nextList });
    if (regMembership === oldValue) setRegMembership(nextValue);
  }

  function deleteMembershipType(value: string) {
    const current = membershipTypes[regRole] || [];
    if (current.length <= 1) {
      showToast("Action Blocked", "At least one membership type is required.", "warning");
      return;
    }
    const nextList = current.filter((m) => m !== value);
    saveMembershipTypes({ ...membershipTypes, [regRole]: nextList });
    if (regMembership === value) setRegMembership(nextList[0] || "");
  }

  const isOpen = db.settings.thresholdMode === "open";

  return (
    <section>
      <PageHeader
        title="Admin Control"
        subtitle="Manage settings, events, roster, and ID cards by module"
        icon={<HugeIcon name="admin" size={22} />}
      />

      <div
        role="tablist"
        aria-label="Admin modules"
        className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-white/80 p-1.5 shadow-sm backdrop-blur-sm"
      >
        {tabs.map((tab) => {
          const active = adminTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setAdminTab(tab.id)}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition sm:flex-none sm:px-4 ${
                active
                  ? "bg-[var(--primary)] text-white shadow-sm shadow-emerald-900/20"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <HugeIcon name={tab.icon} size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {adminTab === "events" && (
      <Card>
        <SectionTitle>Events & Venues</SectionTitle>
        <p className="mb-4 mt-2 text-[13px] text-slate-500">
          Create library, campus events, labs, and other check-in points. Active
          events appear in the kiosk Event mode.
          {editingEventId ? (
            <span className="ml-1 font-semibold text-[var(--primary)]">
              Editing selected event…
            </span>
          ) : null}
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Event Name" className="mb-0">
            <input
              className={inputClass}
              value={evtName}
              onChange={(e) => setEvtName(e.target.value)}
              placeholder="e.g. Library Check-in, Orientation Day"
            />
          </Field>
          <Field label="Category" className="mb-0">
            <select
              className={inputClass}
              value={evtCategory}
              onChange={(e) => setEvtCategory(e.target.value as EventCategory)}
            >
              {EVENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location (optional)" className="mb-0">
            <input
              className={inputClass}
              value={evtLocation}
              onChange={(e) => setEvtLocation(e.target.value)}
              placeholder="e.g. Main Library, Gym"
            />
          </Field>
          <Field label="Notes (optional)" className="mb-0">
            <input
              className={inputClass}
              value={evtDescription}
              onChange={(e) => setEvtDescription(e.target.value)}
              placeholder="Short description"
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {editingEventId && (
            <Button
              variant="secondary"
              onClick={() => {
                setEditingEventId(null);
                setEvtName("");
                setEvtLocation("");
                setEvtDescription("");
                setEvtCategory("event");
              }}
            >
              Cancel
            </Button>
          )}
          <Button
            onClick={async () => {
              if (editingEventId) {
                await updateEvent(editingEventId, {
                  name: evtName.trim(),
                  category: evtCategory,
                  location: evtLocation.trim(),
                  description: evtDescription.trim(),
                });
                setEditingEventId(null);
                setEvtName("");
                setEvtLocation("");
                setEvtDescription("");
                setEvtCategory("event");
                return;
              }
              const ok = await createEvent({
                name: evtName,
                category: evtCategory,
                location: evtLocation,
                description: evtDescription,
                active: true,
              });
              if (ok) {
                setEvtName("");
                setEvtLocation("");
                setEvtDescription("");
                setEvtCategory("event");
              }
            }}
          >
            {editingEventId ? (
              <>
                <HugeIcon name="check" size={16} className="icon-pop" />
                Save Changes
              </>
            ) : (
              <>
                <HugeIcon name="add" size={16} className="icon-pop" />
                Create Event
              </>
            )}
          </Button>
        </div>

        <div className="mt-5">
          <TableShell>
            <thead>
              <tr>
                {["Name", "Category", "Location", "Status", "Actions"].map(
                  (h) => (
                    <th
                      key={h}
                      className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {(db.events || []).length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    No events yet. Create Library, campus events, etc. above.
                  </td>
                </tr>
              ) : (
                (db.events || []).map((e) => (
                  <tr
                    key={e.id}
                    className={`hover:bg-slate-50 ${
                      editingEventId === e.id ? "bg-sky-50/80" : ""
                    }`}
                  >
                    <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                      {e.name}
                      {e.description ? (
                        <ExpandableText
                          text={e.description}
                          lines={2}
                          className="mt-0.5"
                        />
                      ) : null}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3">
                      <Badge variant="class">{categoryLabel(e.category)}</Badge>
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      {e.location || "—"}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3">
                      <Badge variant={e.active ? "present" : "absent"}>
                        {e.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-[11px]"
                          onClick={() => {
                            setEditingEventId(e.id);
                            setEvtName(e.name);
                            setEvtCategory(e.category);
                            setEvtLocation(e.location || "");
                            setEvtDescription(e.description || "");
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-[11px]"
                          onClick={() =>
                            updateEvent(e.id, { active: !e.active })
                          }
                        >
                          {e.active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          variant="danger"
                          className="px-2 py-1 text-[11px]"
                          onClick={() => {
                            if (editingEventId === e.id) {
                              setEditingEventId(null);
                              setEvtName("");
                              setEvtLocation("");
                              setEvtDescription("");
                              setEvtCategory("event");
                            }
                            void deleteEvent(e.id);
                          }}
                        >
                          <HugeIcon name="delete" size={14} />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </div>
      </Card>
      )}

      {adminTab === "classes" && (
        <Card>
          <SectionTitle>Subjects & Classrooms</SectionTitle>
          <p className="mb-4 mt-2 text-[13px] text-slate-500">
            Manage subject / section pairs for Class Session scanning. Seed from
            Class Hub CSV via <code>supabase/class_hub_seed.sql</code>.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Subject Name" className="mb-0">
              <input
                className={inputClass}
                value={clsName}
                onChange={(e) => setClsName(e.target.value)}
                placeholder="e.g. GEN MATH, CHEMISTRY 1"
              />
            </Field>
            <Field label="Section / Classroom" className="mb-0">
              <input
                className={inputClass}
                value={clsSection}
                onChange={(e) => setClsSection(e.target.value)}
                placeholder="e.g. STEM - G11, ASSH - G11"
              />
            </Field>
            <Field label="Notes (optional)" className="mb-0">
              <input
                className={inputClass}
                value={clsDescription}
                onChange={(e) => setClsDescription(e.target.value)}
                placeholder="Optional notes"
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <input
              className={`${inputClass} max-w-[280px] py-2`}
              placeholder="Search classes…"
              value={classSearch}
              onChange={(e) => setClassSearch(e.target.value)}
            />
            <Button
              onClick={async () => {
                const ok = await createClass({
                  name: clsName,
                  section: clsSection,
                  description: clsDescription,
                  active: true,
                });
                if (ok) {
                  setClsName("");
                  setClsSection("");
                  setClsDescription("");
                }
              }}
            >
              <HugeIcon name="add" size={16} className="icon-pop" />
              Add Class
            </Button>
          </div>

          <div className="mt-5 max-h-[480px] overflow-auto">
            <TableShell>
              <thead>
                <tr>
                  {["Subject", "Section", "Status", "Actions"].map((h) => (
                    <th
                      key={h}
                      className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredClasses.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-slate-500"
                    >
                      No classes yet. Add one above or run class_hub_seed.sql.
                    </td>
                  </tr>
                ) : (
                  filteredClasses.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                        {c.name}
                      </td>
                      <td className="border-b border-slate-200 px-4 py-3 text-sm">
                        {c.section || "—"}
                      </td>
                      <td className="border-b border-slate-200 px-4 py-3">
                        <Badge variant={c.active ? "present" : "absent"}>
                          {c.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="border-b border-slate-200 px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            className="px-2 py-1 text-[11px]"
                            onClick={() =>
                              updateClass(c.id, { active: !c.active })
                            }
                          >
                            {c.active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            variant="danger"
                            className="px-2 py-1 text-[11px]"
                            onClick={() => deleteClass(c.id)}
                          >
                            <HugeIcon name="delete" size={14} />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableShell>
          </div>
          {(db.classes || []).length > 0 && (
            <p className="mt-3 text-[12px] text-slate-500">
              {(db.classes || []).length} class
              {(db.classes || []).length === 1 ? "" : "es"} in catalog
              {classSearch
                ? ` · ${filteredClasses.length} shown`
                : ""}
            </p>
          )}
        </Card>
      )}

      {adminTab === "settings" && (
      <Card>
          <SectionTitle>System Operational Thresholds</SectionTitle>
          <div className="mb-4" />
          <Field label="Threshold Optimization Rule">
            <select
              className={inputClass}
              value={db.settings.thresholdMode}
              onChange={(e) =>
                updateSettings({
                  thresholdMode: e.target.value as "strict" | "open",
                })
              }
            >
              <option value="strict">
                Strict Mode (Enforce Late / Early Out Flags)
              </option>
              <option value="open">
                Open Time Mode (Flexible Open Scanning - No Penalties)
              </option>
            </select>
            <small className="mt-1 text-[11px] text-slate-500">
              Choosing <b>Open Time Mode</b> allows students to scan at any hour
              without being marked Late or Early Departure.
            </small>
          </Field>

          <div
            className={`mb-3 grid gap-3 md:grid-cols-2 ${
              isOpen ? "pointer-events-none opacity-40" : ""
            }`}
          >
            <Field label="Time In Late Cutoff" className="mb-0">
              <input
                type="time"
                className={inputClass}
                value={db.settings.lateTime}
                onChange={(e) => updateSettings({ lateTime: e.target.value })}
              />
              <small className="text-[11px] text-slate-500">
                Scans after this are marked <b>Late</b>.
              </small>
            </Field>
            <Field label="Early Time Out Cutoff" className="mb-0">
              <input
                type="time"
                className={inputClass}
                value={db.settings.timeoutTime}
                onChange={(e) =>
                  updateSettings({ timeoutTime: e.target.value })
                }
              />
              <small className="text-[11px] text-slate-500">
                Scans before this are flagged.
              </small>
            </Field>
          </div>

          <hr className="my-5 border-slate-200/80" />
          <SectionTitle>Display Preferences</SectionTitle>
          <div className="mb-4" />
          <Field label="Time Format">
            <select
              className={inputClass}
              value={db.settings.timeFormat || "12h"}
              onChange={(e) =>
                updateSettings({
                  timeFormat: e.target.value as "12h" | "24h",
                })
              }
            >
              <option value="12h">12-hour (e.g. 4:12:57 PM)</option>
              <option value="24h">24-hour (e.g. 16:12:57)</option>
            </select>
            <small className="mt-1 text-[11px] text-slate-500">
              Applies to the kiosk clock, scan notifications, summary tables,
              and Excel exports. Times are still stored in 24-hour format
              internally.
            </small>
          </Field>

          <hr className="my-5 border-slate-200/80" />
          <SectionTitle>Database Management</SectionTitle>
          <div className="mb-3" />
          <Button variant="danger" onClick={factoryReset}>
            Reset All Data
          </Button>
        </Card>
      )}

      {adminTab === "roster" && (
        <>
        <Card>
          <SectionTitle>Roster Sync & Import</SectionTitle>
          <p className="mb-4 mt-2 text-[13px] text-slate-500">
            Import via Excel/CSV. Ensure columns match the intended registration
            track.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => openImportDialog("student")}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 transition hover:-translate-y-px hover:bg-[var(--primary-hover)]"
            >
              Import Students
            </button>
            <button
              type="button"
              onClick={() => openImportDialog("faculty")}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-[var(--primary-hover)]"
            >
              Import Faculty/Admin
            </button>
            <Button variant="secondary" onClick={loadDemoData}>
              Inject Demo Data
            </Button>
          </div>
        </Card>

      <Card>
        <SectionTitle>Registration Module</SectionTitle>
        <p className="mb-5 mt-2 text-[13px] text-slate-500">
          Manually enroll students, faculty, or admin profiles into secure local
          enterprise structures.
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Registration Type" className="mb-0">
            <select
              className={inputClass}
              value={regRole}
              onChange={(e) => setRegRole(e.target.value as Role)}
            >
              <option value="student">Student</option>
              <option value="faculty">Faculty Member</option>
              <option value="admin">Admin/AMT</option>
            </select>
          </Field>
          <Field label="ID Reference" className="mb-0">
            <input
              className={inputClass}
              value={regId}
              onChange={(e) => setRegId(e.target.value)}
              placeholder="e.g. 2026-005"
            />
          </Field>
          <Field label="Name" className="mb-0">
            <input
              className={inputClass}
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder="e.g. Emily Watson"
            />
          </Field>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Membership Type (optional)" className="mb-0">
              <select
                className={inputClass}
                value={regMembership}
                onChange={(e) => setRegMembership(e.target.value)}
              >
                {(membershipTypes[regRole] || []).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Create Membership for ${regRole.toUpperCase()}`} className="mb-0">
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  value={membershipDraft}
                  onChange={(e) => setMembershipDraft(e.target.value)}
                  placeholder="e.g. Club Member, Intern"
                />
                <Button type="button" onClick={addMembershipType}>
                  Add
                </Button>
              </div>
            </Field>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(membershipTypes[regRole] || []).map((m) => (
              <div
                key={m}
                className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200"
              >
                <span>{m}</span>
                <button
                  type="button"
                  className="rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => editMembershipType(m)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="rounded px-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                  onClick={() => deleteMembershipType(m)}
                >
                  Del
                </button>
              </div>
            ))}
          </div>
        </div>

        {regRole === "student" ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Field label="Education Tier" className="mb-0">
              <select
                className={inputClass}
                value={regDistinction}
                onChange={(e) => setRegDistinction(e.target.value)}
              >
                <option value="SHS">SHS</option>
                <option value="Tertiary">Tertiary</option>
              </select>
            </Field>
            <Field label="Grade / Year Level" className="mb-0">
              <input
                className={inputClass}
                value={regGrade}
                onChange={(e) => setRegGrade(e.target.value)}
                placeholder="e.g. 11 or 2nd Year"
              />
            </Field>
            <Field label="Assigned Section" className="mb-0">
              <input
                className={inputClass}
                value={regSection}
                onChange={(e) => setRegSection(e.target.value)}
                placeholder="e.g. Beta or BSIT-2B"
              />
            </Field>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Department" className="mb-0">
              <input
                className={inputClass}
                value={regDept}
                onChange={(e) => setRegDept(e.target.value)}
                placeholder="e.g. SHS, TH, IT or GE"
              />
            </Field>
            <Field label="Designation" className="mb-0">
              <input
                className={inputClass}
                value={regDesignation}
                onChange={(e) => setRegDesignation(e.target.value)}
                placeholder="e.g. Faculty member or Admin staff "
              />
            </Field>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button onClick={handleRegister}>Enrollment</Button>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>Master Roster & Data Setup</SectionTitle>
          <input
            className={`${inputClass} max-w-[300px] flex-1 py-2`}
            placeholder="Search by name or ID to add photo..."
            value={rosterSearch}
            onChange={(e) => setRosterSearch(e.target.value)}
          />
        </div>

        <div className="max-h-[400px] overflow-auto">
          <TableShell>
            <thead>
              <tr>
                {[
                  "Photo",
                  "ID",
                  "Name",
                  "Role",
                  "Distinction",
                  "Operational Details",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    No records tracking database layers.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="border-b border-slate-200 px-4 py-3">
                      {s.photo ? (
                        <div className="relative inline-block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={s.photo}
                            alt=""
                            className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                          />
                          <button
                            type="button"
                            className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1 text-[8px] text-white"
                            onClick={() => removePhoto(s.id)}
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer rounded-lg border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                          Add Photo
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              onPhotoFile(s.id, e.target.files?.[0])
                            }
                          />
                        </label>
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                      {s.id}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      {s.name}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3">
                      <Badge
                        variant={
                          s.role === "faculty"
                            ? "faculty"
                            : s.role === "admin"
                              ? "admin"
                              : "default"
                        }
                      >
                        {(s.role || "student").toUpperCase()}
                      </Badge>
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3">
                      <Badge variant="role">{s.distinction || "—"}</Badge>
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-sm">
                      {memberDetails(s)}
                      {s.membership ? (
                        <span className="ml-2 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                          {s.membership}
                        </span>
                      ) : null}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3">
                      <Button
                        variant="danger"
                        className="px-2 py-1 text-[11px]"
                        onClick={() => removeMember(s.id)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </div>
      </Card>
        </>
      )}

      {adminTab === "ids" && (
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>ID Card Generator Gallery</SectionTitle>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-xs font-bold uppercase text-slate-500">
              Batch Filters:
            </span>
            <input
              className={`${inputClass} w-[180px] py-1.5 text-[13px]`}
              placeholder="Search name or ID..."
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
            />
            <select
              className="w-[140px] rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px]"
              value={filterDistinction}
              onChange={(e) => setFilterDistinction(e.target.value)}
            >
              <option value="all">All Distinctions</option>
              <option value="SHS">SHS Only</option>
              <option value="Tertiary">Tertiary Only</option>
              <option value="Faculty">Faculty Only</option>
              <option value="Admin">Admin Only</option>
            </select>
            <select
              className="w-[140px] rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px]"
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
            >
              <option value="all">All Grades</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              className="w-[140px] rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px]"
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
            >
              <option value="all">All Sections</option>
              {sections.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
            <Button onClick={() => printIDs(null)}>Print Batch</Button>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {galleryStudents.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-slate-500">
              No members match the current filters.
            </p>
          ) : (
          galleryStudents.map((s) => {
            const roleColor =
              s.role === "faculty"
                ? "text-[var(--sidebar)]"
                : s.role === "admin"
                  ? "text-red-600"
                  : "text-[var(--primary)]";
            const displayRole =
              s.role === "faculty"
                ? "FACULTY"
                : s.role === "admin"
                  ? "ADMINISTRATOR"
                  : s.distinction || "STUDENT";

            return (
              <div
                key={s.id}
                className="flex flex-col items-center rounded-[10px] border border-slate-200 bg-white p-4 text-center"
              >
                {s.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.photo}
                    alt=""
                    className="mb-2 h-[60px] w-[60px] rounded-full border-2 border-[var(--brand-green)] object-cover"
                  />
                ) : (
                  <div className="mb-2 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-slate-100 text-xl font-bold text-slate-500">
                    {s.name.charAt(0)}
                  </div>
                )}
                <div className="mb-1 text-sm font-bold">{s.name}</div>
                <div className="mb-1 text-[11px] text-slate-500">ID: {s.id}</div>
                <div className={`mb-3 text-[11px] font-bold ${roleColor}`}>
                  {displayRole}
                </div>
                <div className="mb-3 flex justify-center rounded-md border border-slate-100 p-1.5">
                  <QRCodeSVG
                    value={JSON.stringify({ studentId: s.id })}
                    size={120}
                    level="M"
                  />
                </div>
                <Button
                  variant="secondary"
                  className="w-full px-2 py-1.5 text-xs"
                  onClick={() => printIDs(s.id)}
                >
                  Print ID
                </Button>
              </div>
            );
          })
          )}
        </div>
      </Card>
      )}

      {printTargets &&
        typeof document !== "undefined" &&
        createPortal(
          <div id="printArea" className="print-only">
            <div className="print-grid">
              {printTargets.map((s) => (
                <div key={s.id} className="id-card">
                  <h3 className="mb-1.5 text-lg font-bold">{s.name}</h3>
                  <div className="mb-5 text-sm font-bold text-slate-600">
                    ID: {s.id}
                  </div>
                  <div className="inline-flex rounded-xl border-2 border-slate-200 bg-white p-2.5">
                    <QRCodeSVG
                      value={JSON.stringify({ studentId: s.id })}
                      size={120}
                      level="M"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}

      {importDialogOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/45 backdrop-blur-sm">
          <div className="w-[92%] max-w-[560px] rounded-2xl bg-white p-5 shadow-2xl shadow-slate-900/25">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="page-title text-lg font-bold text-slate-800">
                Import {importRole === "student" ? "Students" : "Faculty / Admin"}
              </h3>
              <button
                type="button"
                onClick={closeImportDialog}
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-[13px] text-slate-500">
              Upload CSV/XLSX file. Use the sample template to match required
              column names.
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setImportDragOver(true);
              }}
              onDragLeave={() => setImportDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setImportDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) setImportFile(f);
              }}
              className={`mb-4 rounded-xl border-2 border-dashed p-6 text-center transition ${
                importDragOver
                  ? "border-[var(--primary)] bg-emerald-50"
                  : "border-slate-300 bg-slate-50"
              }`}
            >
              <p className="text-sm font-semibold text-slate-700">
                Drag and drop CSV/XLSX file here
              </p>
              <p className="mt-1 text-xs text-slate-500">
                or click choose file below
              </p>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setImportFile(f);
                  e.target.value = "";
                }}
              />
              <Button
                variant="secondary"
                onClick={() => importInputRef.current?.click()}
              >
                Choose File
              </Button>
              <Button
                variant="teal"
                onClick={() => downloadTemplate(importRole)}
              >
                Download Sample Template
              </Button>
            </div>

            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {importFile ? `Selected: ${importFile.name}` : "No file selected"}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={closeImportDialog}>
                Cancel
              </Button>
              <Button onClick={confirmImportDialog}>Import File</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
