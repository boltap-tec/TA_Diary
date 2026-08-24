-- ============================================================
-- TA Diary — create Supabase Auth logins for every officer
-- Default password = PIN 1234
--   (the app maps PIN "1234" -> password "1234Aa#tadiary")
-- Run in Supabase → SQL Editor AFTER schema.sql and seed.sql.
-- Safe to re-run: it skips users / identities that already exist.
-- ============================================================

create extension if not exists pgcrypto;

-- 1) Create an auth user for each row in ta_profiles (default PIN 1234, email pre-confirmed).
--    Users are NOT forced to change the PIN; they can change it anytime in Profile if they wish.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated', 'authenticated',
  lower(p.email),
  crypt('1234Aa#tadiary', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"pin_set":false}'::jsonb,
  false,
  '', '', '', ''
from ta_profiles p
where not exists (select 1 from auth.users u where lower(u.email) = lower(p.email));

-- 2) Create the matching email identity for each new user (required for password login).
insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email', u.id::text,
  now(), now(), now()
from auth.users u
where not exists (
  select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
);

-- Check: list the created logins
select email, (raw_user_meta_data->>'pin_set') as pin_set, email_confirmed_at is not null as confirmed
from auth.users order by email;
