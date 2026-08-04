-- AttendX: optional membership label per member
-- Run in Supabase SQL Editor after schema.sql

alter table public.members
  add column if not exists membership text not null default '';
