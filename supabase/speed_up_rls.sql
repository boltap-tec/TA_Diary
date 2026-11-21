-- ============================================================
-- TA Diary — faster Row-Level Security (makes sign-in load faster).
--
-- The original policies call ta_is_admin() / ta_current_email() directly,
-- so Postgres runs them once for EVERY row it reads (thousands of profile
-- look-ups per sign-in). Wrapping each call in (select …) lets Postgres run
-- it once per query instead. The rules themselves are unchanged — exactly
-- the same people can see and change exactly the same rows.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- ============================================================

-- ta_profiles: a user sees/updates their own row; admin sees/manages all
drop policy if exists ta_profiles_select on ta_profiles;
create policy ta_profiles_select on ta_profiles for select
  using (email = (select ta_current_email()) or (select ta_is_admin()));
drop policy if exists ta_profiles_update on ta_profiles;
create policy ta_profiles_update on ta_profiles for update
  using (email = (select ta_current_email()) or (select ta_is_admin()))
  with check (email = (select ta_current_email()) or (select ta_is_admin()));
drop policy if exists ta_profiles_admin_all on ta_profiles;
create policy ta_profiles_admin_all on ta_profiles for all
  using ((select ta_is_admin())) with check ((select ta_is_admin()));

-- ta_entries / ta_visits: own rows only; admin all
drop policy if exists ta_entries_all on ta_entries;
create policy ta_entries_all on ta_entries for all
  using (email = (select ta_current_email()) or (select ta_is_admin()))
  with check (email = (select ta_current_email()) or (select ta_is_admin()));
drop policy if exists ta_visits_all on ta_visits;
create policy ta_visits_all on ta_visits for all
  using (email = (select ta_current_email()) or (select ta_is_admin()))
  with check (email = (select ta_current_email()) or (select ta_is_admin()));

-- ta_offices / ta_routes: any signed-in user reads; only admin writes
drop policy if exists ta_offices_read on ta_offices;
create policy ta_offices_read on ta_offices for select using ((select auth.role()) = 'authenticated');
drop policy if exists ta_offices_admin on ta_offices;
create policy ta_offices_admin on ta_offices for all using ((select ta_is_admin())) with check ((select ta_is_admin()));
drop policy if exists ta_routes_read on ta_routes;
create policy ta_routes_read on ta_routes for select using ((select auth.role()) = 'authenticated');
drop policy if exists ta_routes_admin on ta_routes;
create policy ta_routes_admin on ta_routes for all using ((select ta_is_admin())) with check ((select ta_is_admin()));
