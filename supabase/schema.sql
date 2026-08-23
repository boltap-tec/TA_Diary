-- ============================================================
-- TA Diary — Supabase schema (tables + Row-Level Security)
-- Run this ONCE in Supabase → SQL Editor, THEN run seed.sql.
-- ============================================================

-- ---------- Tables ----------
create table if not exists profiles (
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
  is_admin       boolean default false,
  is_blocked     boolean default false,
  created_at     timestamptz default now()
);

create table if not exists entries (
  id           text primary key,
  email        text references profiles(email) on delete cascade,
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
create index if not exists entries_email_idx on entries(email);
create index if not exists entries_date_idx  on entries(from_date);

create table if not exists visits (
  id       text primary key,
  email    text references profiles(email) on delete cascade,
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
create index if not exists visits_email_idx on visits(email);

create table if not exists offices (
  name    text primary key,
  pincode text
);

create table if not exists routes (
  office_from text,
  office_to   text,
  distance    numeric,
  fare        numeric,
  primary key (office_from, office_to)
);

-- ---------- Helpers: current user email + admin check ----------
-- SECURITY DEFINER lets is_admin() read profiles without tripping RLS (avoids recursion).
create or replace function current_email() returns text
  language sql stable as $$ select nullif(auth.jwt() ->> 'email','') $$;

create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public as
  $$ select coalesce((select is_admin from profiles where email = current_email()), false) $$;

-- ---------- Row-Level Security ----------
alter table profiles enable row level security;
alter table entries  enable row level security;
alter table visits   enable row level security;
alter table offices  enable row level security;
alter table routes   enable row level security;

-- profiles: a user sees/updates their own row; admin sees/manages all
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (email = current_email() or is_admin());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update
  using (email = current_email() or is_admin())
  with check (email = current_email() or is_admin());
drop policy if exists profiles_admin_all on profiles;
create policy profiles_admin_all on profiles for all
  using (is_admin()) with check (is_admin());

-- entries / visits: own rows only; admin all
drop policy if exists entries_all on entries;
create policy entries_all on entries for all
  using (email = current_email() or is_admin())
  with check (email = current_email() or is_admin());
drop policy if exists visits_all on visits;
create policy visits_all on visits for all
  using (email = current_email() or is_admin())
  with check (email = current_email() or is_admin());

-- offices / routes: any signed-in user reads; only admin writes
drop policy if exists offices_read on offices;
create policy offices_read on offices for select using (auth.role() = 'authenticated');
drop policy if exists offices_admin on offices;
create policy offices_admin on offices for all using (is_admin()) with check (is_admin());
drop policy if exists routes_read on routes;
create policy routes_read on routes for select using (auth.role() = 'authenticated');
drop policy if exists routes_admin on routes;
create policy routes_admin on routes for all using (is_admin()) with check (is_admin());
