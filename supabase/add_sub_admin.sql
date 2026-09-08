-- ============================================================
-- TA Diary — "sub-admin" (profile controller) role.
-- A sub-admin is a normal user who may ALSO create new officer
-- profiles + logins, but has no other admin power and cannot see
-- other users' PINs (RLS below only lets them read their own row).
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- Requires: Authentication → Email → "Confirm email" OFF, email
-- signups enabled (so the app's signUp can create the login).
-- ============================================================

alter table ta_profiles
  add column if not exists is_sub_admin boolean default false;

-- Who is the current user? (mirrors ta_is_admin)
create or replace function ta_is_sub_admin() returns boolean
  language sql stable security definer set search_path = public as
  $$ select coalesce((select is_sub_admin from ta_profiles where email = ta_current_email()), false) $$;

-- Sub-admins may INSERT new officer profiles (create), but only NORMAL officers —
-- they cannot mint admins or other sub-admins (that stays super-admin only).
drop policy if exists ta_profiles_subadmin_insert on ta_profiles;
create policy ta_profiles_subadmin_insert on ta_profiles for insert
  with check (
    ta_is_admin()
    or (email = ta_current_email())
    or (ta_is_sub_admin() and coalesce(is_admin,false) = false and coalesce(is_sub_admin,false) = false)
  );

-- Sub-admins may UPDATE officer profiles too (same guard against role escalation).
drop policy if exists ta_profiles_subadmin_update on ta_profiles;
create policy ta_profiles_subadmin_update on ta_profiles for update
  using (ta_is_admin() or email = ta_current_email() or ta_is_sub_admin())
  with check (
    ta_is_admin()
    or (email = ta_current_email())
    or (ta_is_sub_admin() and coalesce(is_admin,false) = false and coalesce(is_sub_admin,false) = false)
  );

-- NOTE: the existing ta_profiles_select policy is unchanged, so a sub-admin can
-- still only SELECT their OWN row — they never see other officers' PINs.

-- (Optional) check
-- select email, is_admin, is_sub_admin from ta_profiles order by email;
