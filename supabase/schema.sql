-- ============================================================
-- TA Diary — Supabase schema (tables + Row-Level Security)
-- All objects are prefixed ta_ so they never collide with other
-- projects (e.g. mlarfinance) in the same Supabase database.
-- Run this ONCE in Supabase → SQL Editor, THEN run seed.sql.
-- ============================================================

-- ---------- Tables ----------
create table if not exists ta_profiles (
  email          text primary key,
  name           text,
  designation    text,
  basic          text,
  parent_office  text,
  pincode        text,
  daily_ta_fare  numeric default 0,
  mileage_fare   numeric default 0,
  max_bike       numeric default 0,
  submit_to      text,
  submit_every   text,
  pin            text default '1234',   -- visible PIN (plaintext) for admin support
  is_admin       boolean default false,
  is_blocked     boolean default false,
  created_at     timestamptz default now()
);

create table if not exists ta_entries (
  id           text primary key,
  email        text references ta_profiles(email) on delete cascade,
  today        text,
  leave_type   text,
  office_from  text,
  office_to    text,
  from_date    date,
  from_time    time,
  to_date      date,
  to_time      time,
  mode         text,
  distance     numeric default 0,
  fare         numeric default 0,
  days         numeric default 0,
  trip         int     default 0,
  completed    text,
  diary_detail text,
  diary_short  text,
  ta_short     text,
  purpose      text,
  updated_at   timestamptz default now()
);
create index if not exists ta_entries_email_idx on ta_entries(email);
create index if not exists ta_entries_date_idx  on ta_entries(from_date);

create table if not exists ta_visits (
  id       text primary key,
  email    text references ta_profiles(email) on delete cascade,
  date     date,
  office   text,
  pincode  text,
  ref      text,
  hw       jsonb,
  sw       jsonb,
  apt_dtr  text,
  bo_bal   text,
  disc     text,
  purpose  text,
  result   text,
  updated_at timestamptz default now()
);
create index if not exists ta_visits_email_idx on ta_visits(email);

create table if not exists ta_offices (
  name    text primary key,
  pincode text
);

create table if not exists ta_routes (
  office_from text,
  office_to   text,
  distance    numeric,
  fare        numeric,
  primary key (office_from, office_to)
);

-- ---------- Helpers: current user email + admin check ----------
-- SECURITY DEFINER lets ta_is_admin() read ta_profiles without tripping RLS (avoids recursion).
create or replace function ta_current_email() returns text
  language sql stable as $$ select nullif(auth.jwt() ->> 'email','') $$;

create or replace function ta_is_admin() returns boolean
  language sql stable security definer set search_path = public as
  $$ select coalesce((select is_admin from ta_profiles where email = ta_current_email()), false) $$;

-- ---------- Row-Level Security ----------
alter table ta_profiles enable row level security;
alter table ta_entries  enable row level security;
alter table ta_visits   enable row level security;
alter table ta_offices  enable row level security;
alter table ta_routes   enable row level security;

-- ta_profiles: a user sees/updates their own row; admin sees/manages all
drop policy if exists ta_profiles_select on ta_profiles;
create policy ta_profiles_select on ta_profiles for select
  using (email = ta_current_email() or ta_is_admin());
drop policy if exists ta_profiles_update on ta_profiles;
create policy ta_profiles_update on ta_profiles for update
  using (email = ta_current_email() or ta_is_admin())
  with check (email = ta_current_email() or ta_is_admin());
drop policy if exists ta_profiles_admin_all on ta_profiles;
create policy ta_profiles_admin_all on ta_profiles for all
  using (ta_is_admin()) with check (ta_is_admin());

-- ta_entries / ta_visits: own rows only; admin all
drop policy if exists ta_entries_all on ta_entries;
create policy ta_entries_all on ta_entries for all
  using (email = ta_current_email() or ta_is_admin())
  with check (email = ta_current_email() or ta_is_admin());
drop policy if exists ta_visits_all on ta_visits;
create policy ta_visits_all on ta_visits for all
  using (email = ta_current_email() or ta_is_admin())
  with check (email = ta_current_email() or ta_is_admin());

-- ta_offices / ta_routes: any signed-in user reads; only admin writes
drop policy if exists ta_offices_read on ta_offices;
create policy ta_offices_read on ta_offices for select using (auth.role() = 'authenticated');
drop policy if exists ta_offices_admin on ta_offices;
create policy ta_offices_admin on ta_offices for all using (ta_is_admin()) with check (ta_is_admin());
drop policy if exists ta_routes_read on ta_routes;
create policy ta_routes_read on ta_routes for select using (auth.role() = 'authenticated');
drop policy if exists ta_routes_admin on ta_routes;
create policy ta_routes_admin on ta_routes for all using (ta_is_admin()) with check (ta_is_admin());
