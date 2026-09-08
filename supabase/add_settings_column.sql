-- ============================================================
-- TA Diary — per-user settings that follow the officer across
-- browsers/devices. Adds a jsonb `settings` column to ta_profiles.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- ============================================================

alter table ta_profiles
  add column if not exists settings jsonb default '{}'::jsonb;

-- (Optional) confirm
-- select email, settings from ta_profiles order by email;
