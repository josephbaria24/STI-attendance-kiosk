-- AttendX: display / export time format preference
-- Run in Supabase SQL Editor after schema.sql

do $$ begin
  create type public.time_format as enum ('12h', '24h');
exception when duplicate_object then null; end $$;

alter table public.settings
  add column if not exists time_format public.time_format not null default '12h';
