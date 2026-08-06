-- AttendX / Attendance Pro — Supabase schema
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Mirrors the IndexedDB model in src/lib/types.ts

create extension if not exists "pgcrypto";

-- Enums (match app types)
do $$ begin
  create type public.member_role as enum ('student', 'faculty', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_status as enum ('Present', 'Late', 'Excused', 'Absent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.threshold_mode as enum ('strict', 'open');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.scan_type as enum ('in', 'out');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 1) members  (was: db.students[])
-- ---------------------------------------------------------------------------
create table if not exists public.members (
  id            text primary key,                    -- QR / roster ID (e.g. 2026-001)
  name          text not null,
  role          public.member_role not null default 'student',
  distinction   text not null default '',            -- SHS | Tertiary | Faculty | Admin
  grade         text not null default '—',
  section       text not null default '—',
  dept          text not null default '—',
  designation   text not null default '—',
  photo_url     text not null default '',            -- prefer Storage URL over base64
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists members_name_idx on public.members (name);
create index if not exists members_role_idx on public.members (role);
create index if not exists members_distinction_idx on public.members (distinction);
create index if not exists members_grade_section_idx on public.members (grade, section);

-- ---------------------------------------------------------------------------
-- 2) settings  (was: db.settings — singleton row)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id              smallint primary key default 1 check (id = 1),
  late_time       time not null default '08:00',
  timeout_time    time not null default '16:00',
  class_late_time time not null default '08:00',
  class_timeout_time time not null default '16:00',
  event_late_time time not null default '08:00',
  event_timeout_time time not null default '16:00',
  threshold_mode  public.threshold_mode not null default 'strict',
  term_name       text not null default '',
  term_start_date date,
  term_months     integer not null default 4 check (term_months > 0 and term_months <= 24),
  updated_at      timestamptz not null default now()
);

insert into public.settings (id) values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3) attendance_days  (was: db.logs[date][memberId] summary)
-- ---------------------------------------------------------------------------
create table if not exists public.attendance_days (
  id            uuid primary key default gen_random_uuid(),
  log_date      date not null,
  member_id     text not null references public.members (id) on delete cascade,
  time_in       time,
  time_out      time,
  status        public.attendance_status not null default 'Absent',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (log_date, member_id)
);

create index if not exists attendance_days_date_idx on public.attendance_days (log_date);
create index if not exists attendance_days_status_idx on public.attendance_days (status);
create index if not exists attendance_days_member_idx on public.attendance_days (member_id);

-- ---------------------------------------------------------------------------
-- 4) attendance_scans  (was: DayRecord.scans[])
-- ---------------------------------------------------------------------------
create table if not exists public.attendance_scans (
  id                   uuid primary key default gen_random_uuid(),
  attendance_day_id    uuid not null references public.attendance_days (id) on delete cascade,
  member_id            text not null references public.members (id) on delete cascade,
  log_date             date not null,
  scan_type            public.scan_type not null,
  scanned_at           time not null,
  created_at           timestamptz not null default now()
);

create index if not exists attendance_scans_day_idx on public.attendance_scans (attendance_day_id);
create index if not exists attendance_scans_member_date_idx on public.attendance_scans (member_id, log_date);

-- ---------------------------------------------------------------------------
-- 5) class_attendance  (was: DayRecord.classes[subject][])
-- ---------------------------------------------------------------------------
create table if not exists public.class_attendance (
  id            uuid primary key default gen_random_uuid(),
  log_date      date not null,
  member_id     text not null references public.members (id) on delete cascade,
  subject       text not null,
  scanned_at    time not null,
  created_at    timestamptz not null default now()
);

create index if not exists class_attendance_date_idx on public.class_attendance (log_date);
create index if not exists class_attendance_subject_idx on public.class_attendance (subject);
create index if not exists class_attendance_member_idx on public.class_attendance (member_id, log_date);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists members_set_updated_at on public.members;
create trigger members_set_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

drop trigger if exists attendance_days_set_updated_at on public.attendance_days;
create trigger attendance_days_set_updated_at
  before update on public.attendance_days
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (dev-friendly anon access — tighten for production)
-- ---------------------------------------------------------------------------
alter table public.members enable row level security;
alter table public.settings enable row level security;
alter table public.attendance_days enable row level security;
alter table public.attendance_scans enable row level security;
alter table public.class_attendance enable row level security;

drop policy if exists "members_anon_all" on public.members;
create policy "members_anon_all" on public.members
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "settings_anon_all" on public.settings;
create policy "settings_anon_all" on public.settings
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "attendance_days_anon_all" on public.attendance_days;
create policy "attendance_days_anon_all" on public.attendance_days
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "attendance_scans_anon_all" on public.attendance_scans;
create policy "attendance_scans_anon_all" on public.attendance_scans
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "class_attendance_anon_all" on public.class_attendance;
create policy "class_attendance_anon_all" on public.class_attendance
  for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
create or replace view public.v_daily_gate_roster as
select
  d.log_date,
  m.id as member_id,
  m.name,
  m.role,
  m.distinction,
  m.grade,
  m.section,
  m.dept,
  d.time_in,
  d.time_out,
  d.status
from public.attendance_days d
join public.members m on m.id = d.member_id;

create or replace view public.v_class_logs as
select
  c.log_date,
  c.member_id,
  m.name,
  m.distinction,
  m.grade,
  m.section,
  c.subject,
  c.scanned_at
from public.class_attendance c
join public.members m on m.id = c.member_id;

-- ---------------------------------------------------------------------------
-- 8) library_attendance  (School Library In/Out — not tied to events)
-- ---------------------------------------------------------------------------
create table if not exists public.library_attendance (
  id            uuid primary key default gen_random_uuid(),
  log_date      date not null,
  member_id     text not null references public.members (id) on delete cascade,
  scan_type     text not null default 'in' check (scan_type in ('in', 'out')),
  scanned_at    time not null,
  created_at    timestamptz not null default now()
);

create index if not exists library_attendance_date_idx
  on public.library_attendance (log_date);
create index if not exists library_attendance_member_idx
  on public.library_attendance (member_id, log_date);

alter table public.library_attendance enable row level security;

drop policy if exists "library_attendance_anon_all" on public.library_attendance;
create policy "library_attendance_anon_all" on public.library_attendance
  for all to anon, authenticated using (true) with check (true);

create or replace view public.v_library_logs as
select
  la.log_date,
  la.member_id,
  m.name as member_name,
  m.distinction,
  m.grade,
  m.section,
  la.scan_type,
  la.scanned_at
from public.library_attendance la
join public.members m on m.id = la.member_id;
