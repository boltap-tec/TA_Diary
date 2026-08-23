// Creates Supabase Auth users for every officer in seed.js.
// Default password is derived from PIN 1234 (users set their own on first login).
//
// Run locally (Node 18+), never commit your service key:
//   SUPABASE_URL="https://YOUR-REF.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="your-service_role-key" \
//   node scripts/create_auth_users.mjs
//
// The service_role key is in Supabase → Project Settings → API (keep it SECRET).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SB_URL = process.env.SUPABASE_URL;
const SVC    = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SVC) {
  console.error('❌ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables first.');
  process.exit(1);
}

const dir  = path.dirname(fileURLToPath(import.meta.url));
const raw  = fs.readFileSync(path.join(dir, '..', 'seed.js'), 'utf8');
const seed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));

const password = '1234' + 'Aa#tadiary';   // MUST match pinToPass('1234') in app.js
const emails = [...new Set(seed.profiles.map(p => p.email).filter(Boolean))];

console.log(`Creating ${emails.length} auth users on ${SB_URL} ...`);
let ok = 0, exists = 0, fail = 0;
for (const email of emails) {
  const res = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { pin_set: false } }),
  });
  if (res.ok) { ok++; console.log('  ✓', email); }
  else {
    const t = await res.text();
    if (/already|registered|exists/i.test(t)) { exists++; console.log('  •', email, '(already exists)'); }
    else { fail++; console.log('  ✗', email, res.status, t.slice(0, 140)); }
  }
}
console.log(`\nDone. created=${ok} existing=${exists} failed=${fail}`);
console.log('Default PIN for everyone: 1234 — each user sets their own on first login.');
