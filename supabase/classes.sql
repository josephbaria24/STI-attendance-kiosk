-- AttendX classes / subjects catalog
-- Run in Supabase SQL Editor after schema.sql (and ideally events.sql)

-- Admin-managed subject + classroom/section rows for kiosk Class Session
create table if not exists public.classes (
  id            text primary key,
  name          text not null,
  section       text not null default '',
  description   text not null default '',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists classes_active_idx on public.classes (active);
create index if not exists classes_section_idx on public.classes (section);
create index if not exists classes_name_idx on public.classes (name);

-- Optional FK + scan direction on class check-ins (Time In / Time Out per class)
alter table public.class_attendance
  add column if not exists class_id text references public.classes (id) on delete set null;

alter table public.class_attendance
  add column if not exists scan_type text not null default 'in'
    check (scan_type in ('in', 'out'));

-- Same for events: Time In / Time Out per event
alter table public.event_attendance
  add column if not exists scan_type text not null default 'in'
    check (scan_type in ('in', 'out'));

create index if not exists class_attendance_class_idx
  on public.class_attendance (class_id);

drop trigger if exists classes_set_updated_at on public.classes;
create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function public.set_updated_at();

alter table public.classes enable row level security;

drop policy if exists "classes_anon_all" on public.classes;
create policy "classes_anon_all" on public.classes
  for all to anon, authenticated using (true) with check (true);

-- Must drop first: CREATE OR REPLACE cannot rename/reorder view columns
drop view if exists public.v_class_logs;

create view public.v_class_logs as
select
  c.log_date,
  c.member_id,
  m.name as member_name,
  m.distinction,
  m.grade,
  m.section,
  coalesce(cl.name, c.subject) as subject,
  c.class_id,
  cl.name as subject_name,
  cl.section as class_section,
  c.scan_type,
  c.scanned_at
from public.class_attendance c
left join public.classes cl on cl.id = c.class_id
join public.members m on m.id = c.member_id;
