-- AttendX events / venues extension
-- Run in Supabase SQL Editor after schema.sql

do $$ begin
  create type public.event_category as enum (
    'event', 'library', 'lab', 'office', 'clinic', 'other'
  );
exception when duplicate_object then null; end $$;

-- Admin-created events (Library, Orientation, etc.)
create table if not exists public.events (
  id            text primary key,
  name          text not null,
  category      public.event_category not null default 'event',
  location      text not null default '',
  description   text not null default '',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists events_active_idx on public.events (active);
create index if not exists events_category_idx on public.events (category);

-- Optional: remember last kiosk event on settings
alter table public.settings
  add column if not exists current_event_id text references public.events (id) on delete set null;

-- Event / venue check-ins (same idea as class_attendance)
create table if not exists public.event_attendance (
  id            uuid primary key default gen_random_uuid(),
  log_date      date not null,
  event_id      text not null references public.events (id) on delete cascade,
  member_id     text not null references public.members (id) on delete cascade,
  scanned_at    time not null,
  created_at    timestamptz not null default now()
);

create index if not exists event_attendance_date_idx on public.event_attendance (log_date);
create index if not exists event_attendance_event_idx on public.event_attendance (event_id);
create index if not exists event_attendance_member_idx on public.event_attendance (member_id, log_date);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.event_attendance enable row level security;

drop policy if exists "events_anon_all" on public.events;
create policy "events_anon_all" on public.events
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "event_attendance_anon_all" on public.event_attendance;
create policy "event_attendance_anon_all" on public.event_attendance
  for all to anon, authenticated using (true) with check (true);

create or replace view public.v_event_logs as
select
  ea.log_date,
  ea.event_id,
  e.name as event_name,
  e.category,
  e.location,
  ea.member_id,
  m.name as member_name,
  m.distinction,
  m.grade,
  m.section,
  ea.scanned_at
from public.event_attendance ea
join public.events e on e.id = ea.event_id
join public.members m on m.id = ea.member_id;
