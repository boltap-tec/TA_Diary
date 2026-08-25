-- ============================================================
-- TA Diary — data diagnostic. Run in Supabase → SQL Editor.
-- The SQL Editor bypasses Row-Level Security, so these show the
-- TRUE state of the tables. Copy the results back.
-- ============================================================

-- 1) How much data actually exists?
select 'entries'  as table, count(*) as rows from ta_entries
union all
select 'profiles', count(*) from ta_profiles
union all
select 'auth users', count(*) from auth.users;

-- 2) Entries per officer (did the import land?)
select email, count(*) as entries, min(from_date) as first, max(from_date) as last
from ta_entries group by email order by entries desc;

-- 3) Entry emails that have NO profile row
--    (each of these makes that import part fail with a foreign-key error)
select distinct e.email as entry_email_missing_profile
from ta_entries e
left join ta_profiles p on p.email = e.email
where p.email is null;

-- 4) Profiles: who is admin, and who has a login (auth user)?
select p.email, p.is_admin, p.is_blocked, (u.id is not null) as has_login
from ta_profiles p
left join auth.users u on lower(u.email) = lower(p.email)
order by p.is_admin desc, p.email;
