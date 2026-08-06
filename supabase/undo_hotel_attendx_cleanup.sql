-- =============================================================================
-- UNDO: Remove AttendX objects accidentally applied to the HOTEL project
-- =============================================================================
-- Run this ONLY on the hotel / bookings Supabase project.
-- Do NOT run on the AttendX project.
--
-- Keeps hotel tables: bookings, income, expenses, rooms, site_rules, events
-- Removes AttendX: members, settings, attendance_*, library_attendance, enums
-- =============================================================================

-- Views (if created)
drop view if exists public.v_library_logs;
drop view if exists public.v_daily_roster;
drop view if exists public.v_class_logs;
drop view if exists public.v_event_logs;

-- Tables (CASCADE drops policies + FKs). IF EXISTS skips missing tables.
drop table if exists public.attendance_scans cascade;
drop table if exists public.attendance_days cascade;
drop table if exists public.class_attendance cascade;
drop table if exists public.library_attendance cascade;
drop table if exists public.event_attendance cascade;
drop table if exists public.classes cascade;
drop table if exists public.settings cascade;
drop table if exists public.members cascade;

-- AttendX enums (safe if unused after table drops)
drop type if exists public.scan_type cascade;
drop type if exists public.attendance_status cascade;
drop type if exists public.threshold_mode cascade;
drop type if exists public.member_role cascade;
drop type if exists public.event_category cascade;
drop type if exists public.time_format cascade;

-- Optional helper from AttendX schema
drop function if exists public.set_updated_at() cascade;

NOTIFY pgrst, 'reload schema';

-- After running: verify hotel tables still exist
--   select tablename from pg_tables where schemaname = 'public' order by 1;
-- Expect: bookings, expenses, income, rooms, site_rules, events
-- =============================================================================
