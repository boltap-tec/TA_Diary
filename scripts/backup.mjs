/* ============================================================
   TA Diary — headless daily backup.
   Fetches all data from Supabase and writes a dated JSON file
   in the SAME shape as the app's Menu → Export backup, so it can
   be restored via Menu → Import backup (JSON).

   Config: copy backup.config.example.json to backup.config.json
   and fill it in (backup.config.json is git-ignored).

   Run:  node scripts/backup.mjs
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const cfgPath = path.join(process.cwd(), 'backup.config.json');
if (!existsSync(cfgPath)) { console.error('Missing backup.config.json (copy backup.config.example.json and fill it in).'); process.exit(1); }
const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
const URL = cfg.url.replace(/\/+$/, '');
const KEY = cfg.anonKey;
const PASS = cfg.adminPin + 'Aa#tadiary';   // same transform the app uses
const OUT_DIR = cfg.outDir || './backups';
const KEEP_DAYS = Number(cfg.keepDays || 0);

const H = { apikey: KEY, 'Content-Type': 'application/json' };

async function login() {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ email: cfg.adminEmail, password: PASS })
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('Login failed: ' + (j.error_description || j.msg || r.status));
  return j.access_token;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchAll(table, token, order) {
  const auth = { apikey: KEY, Authorization: 'Bearer ' + token };
  const size = 1000; let from = 0; const out = [];
  for (;;) {
    const url = `${URL}/rest/v1/${table}?select=*` + (order ? `&order=${order}.asc` : '')
      + `&limit=${size}&offset=${from}`;
    let r, body;
    for (let attempt = 0; attempt < 5; attempt++) {
      r = await fetch(url, { headers: auth });
      if (r.ok) break;
      body = await r.text();
      // PGRST303 "JWT issued at future" = ~1s clock skew; wait and retry
      if (r.status === 401 && body.includes('PGRST303')) { await sleep(1500); continue; }
      throw new Error(`${table} fetch failed: ${r.status} ${body.slice(0, 140)}`);
    }
    if (!r.ok) throw new Error(`${table} fetch failed after retries: ${r.status} ${(body || '').slice(0, 140)}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < size) break;
    from += size;
  }
  return out;
}

// ---- row -> app object (mirrors rowTo* in app.js so Import works) ----
const t5 = v => v ? String(v).slice(0, 5) : '';
const profile = r => ({ email: r.email, name: r.name || '', desg: r.designation || '', basic: r.basic || '',
  parent: r.parent_office || '', pincode: r.pincode || '', daily: +r.daily_ta_fare || 0, mileage: +r.mileage_fare || 0,
  maxBike: +r.max_bike || 0, submitTo: r.submit_to || '', every: r.submit_every || 'Fortnight',
  pin: r.pin || '', is_admin: !!r.is_admin, is_blocked: !!r.is_blocked });
const entry = r => ({ id: r.id, email: r.email, today: r.today || '', leaveType: r.leave_type || '',
  officeFrom: r.office_from || '', officeTo: r.office_to || '', fromDate: r.from_date || '', fromTime: t5(r.from_time),
  toDate: r.to_date || '', toTime: t5(r.to_time), mode: r.mode || '', distance: +r.distance || 0, fare: +r.fare || 0,
  days: +r.days || 0, trip: +r.trip || 0, completed: r.completed || '', diaryDetail: r.diary_detail || '',
  diaryShort: r.diary_short || '', taShort: r.ta_short || '', purpose: r.purpose || '' });
const visit = r => ({ id: r.id, email: r.email, date: r.date || '', office: r.office || '', pincode: r.pincode || '',
  ref: r.ref || '', hw: r.hw || [], sw: r.sw || [], aptDtr: r.apt_dtr || '', boBal: r.bo_bal || '', disc: r.disc || '',
  purpose: r.purpose || '', result: r.result || '' });

function pruneOld(dir) {
  if (!KEEP_DAYS) return;
  const cutoff = Date.now() - KEEP_DAYS * 864e5;
  for (const f of readdirSync(dir)) {
    const m = f.match(/^ta-diary-backup-(\d{4}-\d{2}-\d{2})\.json$/);
    if (m && new Date(m[1]).getTime() < cutoff) { unlinkSync(path.join(dir, f)); console.log('pruned old', f); }
  }
}

(async () => {
  const token = await login();
  await sleep(2000);   // let the token's issued-at time settle past any small clock skew
  const [profs, ents, vis] = await Promise.all([
    fetchAll('ta_profiles', token, 'email'),
    fetchAll('ta_entries', token, 'id'),
    fetchAll('ta_visits', token, 'id'),
  ]);
  const data = {
    profiles: profs.map(profile),
    active: cfg.adminEmail,
    entries: ents.map(entry),
    visits: vis.map(visit),
    exported: new Date().toISOString(),
  };
  mkdirSync(OUT_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(OUT_DIR, `ta-diary-backup-${date}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Wrote ${file}  (profiles=${data.profiles.length} entries=${data.entries.length} visits=${data.visits.length})`);

  if (cfg.rcloneRemote) {   // optional: upload straight to Drive via rclone
    execFileSync('rclone', ['copyto', file, `${cfg.rcloneRemote}/ta-diary-backup-${date}.json`], { stdio: 'inherit' });
    console.log('Uploaded to', cfg.rcloneRemote);
  }
  pruneOld(OUT_DIR);
})().catch(e => { console.error('Backup FAILED:', e.message); process.exit(1); });
