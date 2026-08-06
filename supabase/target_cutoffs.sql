-- AttendX: per-target late / early-out cutoffs (gate / class / event)
-- Run in Supabase SQL Editor after schema.sql
-- Library scanning does not use these cutoffs.

alter table public.settings
  add column if not exists class_late_time time not null default '08:00';

alter table public.settings
  add column if not exists class_timeout_time time not null default '16:00';

alter table public.settings
  add column if not exists event_late_time time not null default '08:00';

alter table public.settings
  add column if not exists event_timeout_time time not null default '16:00';
