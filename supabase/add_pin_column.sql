-- ============================================================
-- Add a visible PIN column to ta_profiles (admin can see it).
-- NOTE: this stores the PIN in plaintext for admin support.
-- Run once in Supabase → SQL Editor.
-- ============================================================
alter table ta_profiles add column if not exists pin text default '1234';
update ta_profiles set pin = '1234' where pin is null;

-- View all PINs (admin):
select email, name, pin from ta_profiles order by name;
