-- AttendX — store assigned passwords on reset history (small-org, no email)
-- Run in Supabase SQL Editor after accounts.sql

alter table public.app_profiles
  add column if not exists last_assigned_password text,
  add column if not exists prior_assigned_password text;

alter table public.password_reset_requests
  add column if not exists assigned_password text,
  add column if not exists previous_password text;

comment on column public.password_reset_requests.assigned_password is
  'Password assigned when this request was resolved (plain text for in-app admin recall)';
comment on column public.password_reset_requests.previous_password is
  'Previous known assigned password before this reset, if any';
comment on column public.app_profiles.last_assigned_password is
  'Most recently admin-assigned password (for history / recall)';
comment on column public.app_profiles.prior_assigned_password is
  'One previous admin-assigned password before last_assigned_password';
