-- ============================================================
-- TA Diary — drop unwanted/unused columns from ta_entries
-- The app only reads/writes the 20 columns below (+ updated_at).
-- Anything else on the live table (e.g. leftover AppSheet-export
-- columns like parent_office, ocr, day, fromto, purpose_visit1)
-- is unused and can be removed.
--
-- Run STEP 1 first to SEE what would be dropped. If you're happy,
-- run STEP 2 to actually drop them. STEP 2 is destructive for those
-- columns' data, but safe to run repeatedly (no-op once clean).
-- ============================================================

-- ---------- STEP 1: preview the columns that would be dropped ----------
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'ta_entries'
  and column_name not in (
    'id','email','today','leave_type','office_from','office_to',
    'from_date','from_time','to_date','to_time','mode','distance',
    'fare','days','trip','completed','diary_detail','diary_short',
    'ta_short','purpose','updated_at'
  )
order by column_name;

-- ---------- STEP 2: drop every column not used by the app ----------
do $$
declare col text;
begin
  for col in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'ta_entries'
      and column_name not in (
        'id','email','today','leave_type','office_from','office_to',
        'from_date','from_time','to_date','to_time','mode','distance',
        'fare','days','trip','completed','diary_detail','diary_short',
        'ta_short','purpose','updated_at'
      )
  loop
    execute format('alter table public.ta_entries drop column if exists %I', col);
    raise notice 'dropped column: %', col;
  end loop;
end $$;
