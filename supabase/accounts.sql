-- AttendX account management
-- Run in Supabase SQL Editor AFTER creating your first Super Admin in Auth
-- (or run this first, then use link_superadmin() after Auth user exists).
--
-- SETUP STEPS
-- 1) Authentication → Providers → Email: enable Email, disable "Confirm email"
--    (small org / kiosk — no email verification needed)
-- 2) Run this entire script
-- 3) Authentication → Users → Add user
--      Email: any email you will use to sign in OR username@attendx.local
--      Password: your choice
--      Auto Confirm User: ON
-- 4) Run bootstrap (replace values):
--      select public.link_superadmin('YOUR_AUTH_EMAIL', 'superadmin');
-- 5) In Vercel / .env.local add:
--      SUPABASE_SERVICE_ROLE_KEY=...   (Project Settings → API → service_role)
--      NEXT_PUBLIC_SUPABASE_URL=...
--      NEXT_PUBLIC_SUPABASE_ANON_KEY=...
-- 6) Sign in with username from step 4 (superadmin) and the password from Auth

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.app_profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  username        text not null,
  display_name    text not null default '',
  is_superadmin   boolean not null default false,
  is_active       boolean not null default true,
  permissions     jsonb not null default '{}'::jsonb,
  last_assigned_password text,
  prior_assigned_password text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  constraint app_profiles_username_format check (
    username ~ '^[a-z0-9][a-z0-9._-]{1,31}$'
  )
);

create unique index if not exists app_profiles_username_lower_idx
  on public.app_profiles (lower(username));

create index if not exists app_profiles_active_idx
  on public.app_profiles (is_active);

-- ---------------------------------------------------------------------------
-- Password reset requests (no email — admin assigns a new password in-app)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.reset_request_status as enum ('pending', 'resolved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.password_reset_requests (
  id              uuid primary key default gen_random_uuid(),
  username        text not null,
  note            text not null default '',
  status          public.reset_request_status not null default 'pending',
  requested_at    timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references auth.users (id) on delete set null,
  admin_note      text not null default '',
  target_user_id  uuid references auth.users (id) on delete set null,
  assigned_password text,
  previous_password text
);

create index if not exists password_reset_requests_status_idx
  on public.password_reset_requests (status, requested_at desc);

create index if not exists password_reset_requests_username_idx
  on public.password_reset_requests (lower(username));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_app_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_profiles_updated_at on public.app_profiles;
create trigger trg_app_profiles_updated_at
  before update on public.app_profiles
  for each row execute function public.touch_app_profiles_updated_at();

-- Resolve username → auth email used by the app (username@attendx.local)
-- Also supports linking a real Auth email via link_superadmin.
create or replace function public.auth_email_for_username(p_username text)
returns text
language sql
immutable
as $$
  select lower(trim(p_username)) || '@attendx.local';
$$;

create or replace function public.is_user_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.is_superadmin
          or coalesce((p.permissions #>> '{admin,users}')::boolean, false)
      from public.app_profiles p
      where p.id = auth.uid()
        and p.is_active = true
    ),
    false
  );
$$;

create or replace function public.current_app_profile()
returns public.app_profiles
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.app_profiles p
  where p.id = auth.uid()
  limit 1;
$$;

-- Look up login email for a username (used by client before signIn).
-- Returns null if missing / inactive.
create or replace function public.resolve_login_email(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
begin
  select p.id into v_id
  from public.app_profiles p
  where lower(p.username) = lower(trim(p_username))
    and p.is_active = true
  limit 1;

  if v_id is null then
    return null;
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = v_id;

  return v_email;
end;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;
grant execute on function public.auth_email_for_username(text) to anon, authenticated;
grant execute on function public.is_user_manager() to authenticated;
grant execute on function public.current_app_profile() to authenticated;

-- Link an existing Auth user as Super Admin (run once after creating the user)
create or replace function public.link_superadmin(
  p_auth_email text,
  p_username text default 'superadmin'
)
returns public.app_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row public.app_profiles;
  v_username text := lower(trim(p_username));
begin
  if v_username !~ '^[a-z0-9][a-z0-9._-]{1,31}$' then
    raise exception 'Invalid username. Use 2–32 chars: a-z, 0-9, . _ -';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(p_auth_email))
  limit 1;

  if v_user_id is null then
    raise exception 'No auth.users row for email % — create the user in Authentication first', p_auth_email;
  end if;

  insert into public.app_profiles (
    id, username, display_name, is_superadmin, is_active, permissions
  ) values (
    v_user_id,
    v_username,
    'Super Admin',
    true,
    true,
    '{
      "views":{"scanner":true,"summary":true,"analytics":true,"admin":true},
      "scanner":{"gate":true,"class":true,"event":true,"library":true},
      "summary":{"general":true,"class":true,"event":true,"library":true,"export":true,"statusOverride":true},
      "analytics":{"gate":true,"class":true,"event":true,"library":true,"export":true},
      "admin":{"settings":true,"events":true,"classes":true,"roster":true,"ids":true,"users":true,"factoryReset":true,"rosterImport":true,"rosterRegister":true,"rosterDemo":true,"rosterPhotos":true}
    }'::jsonb
  )
  on conflict (id) do update set
    username = excluded.username,
    display_name = excluded.display_name,
    is_superadmin = true,
    is_active = true,
    permissions = excluded.permissions,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- Optional: submit reset request from SQL / used by app insert
-- (app inserts directly into password_reset_requests)

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.app_profiles enable row level security;
alter table public.password_reset_requests enable row level security;

drop policy if exists app_profiles_select on public.app_profiles;
create policy app_profiles_select on public.app_profiles
  for select to authenticated
  using (id = auth.uid() or public.is_user_manager());

drop policy if exists app_profiles_update_self on public.app_profiles;
create policy app_profiles_update_self on public.app_profiles
  for update to authenticated
  using (id = auth.uid() or public.is_user_manager())
  with check (id = auth.uid() or public.is_user_manager());

-- Inserts/deletes for profiles go through service role (API), not anon policies.
-- Service role bypasses RLS.

drop policy if exists reset_requests_insert_anon on public.password_reset_requests;
create policy reset_requests_insert_anon on public.password_reset_requests
  for insert to anon, authenticated
  with check (status = 'pending');

drop policy if exists reset_requests_select_managers on public.password_reset_requests;
create policy reset_requests_select_managers on public.password_reset_requests
  for select to authenticated
  using (public.is_user_manager());

drop policy if exists reset_requests_update_managers on public.password_reset_requests;
create policy reset_requests_update_managers on public.password_reset_requests
  for update to authenticated
  using (public.is_user_manager())
  with check (public.is_user_manager());

-- Optional realtime for reset badge (ignore error if already added)
do $$ begin
  alter publication supabase_realtime add table public.password_reset_requests;
exception when others then null;
end $$;

comment on table public.app_profiles is 'AttendX app accounts linked to auth.users';
comment on table public.password_reset_requests is 'In-app forgotten-password queue (no email)';
comment on function public.link_superadmin(text, text) is
  'After creating a user in Auth, call: select link_superadmin(''email@…'', ''superadmin'');';
