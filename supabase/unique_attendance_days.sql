-- Optional: ensure one attendance day row per member/date (needed for clean upserts)
create unique index if not exists attendance_days_date_member_uidx
  on public.attendance_days (log_date, member_id);
