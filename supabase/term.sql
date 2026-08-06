-- AttendX: academic term settings (library hours requirement window)
-- Run in Supabase SQL Editor after schema.sql

alter table public.settings
  add column if not exists term_name text not null default '';

alter table public.settings
  add column if not exists term_start_date date;

alter table public.settings
  add column if not exists term_months integer not null default 4
    check (term_months > 0 and term_months <= 24);
