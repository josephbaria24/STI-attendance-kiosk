-- AttendX: dedicated School Library attendance (not tied to events)
-- Run in Supabase SQL Editor after schema.sql

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
