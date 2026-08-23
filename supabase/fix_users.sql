-- ============================================================
-- Fix: "Database error querying schema" on login for SQL-created users.
-- Supabase Auth (GoTrue) cannot read NULL token columns — they must be
-- empty strings. This sets them to '' (no-op for already-correct users).
-- Run in Supabase → SQL Editor, then try logging in again.
-- If a line errors with "column ... does not exist", delete just that line
-- (older Supabase versions have fewer columns) and re-run.
-- ============================================================
update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '');
