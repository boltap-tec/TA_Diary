/* ============================================================
   TA Diary — configuration template
   ------------------------------------------------------------
   1. Copy this file to  config.js
   2. Fill in your Supabase project values (Project Settings → API)
   3. config.js is git-ignored so your values are NOT committed.

   NOTE on keys:
   - SUPABASE_ANON_KEY is the "anon / public" key. It is SAFE to ship
     in the browser — Row-Level Security (RLS) is what protects data.
   - NEVER put the "service_role" (secret) key here or in any client
     file. It bypasses RLS. Use it only in local admin/seed scripts.
   ============================================================ */
window.TA_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-PUBLIC-KEY",
  // Turn ON cloud login only AFTER you have: run schema.sql + seed.sql,
  // and created the Auth users (scripts/create_auth_users.mjs).
  // Until then leave false — the app uses the local per-device PIN login.
  USE_AUTH: false
};
