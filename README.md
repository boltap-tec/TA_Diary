# TA Diary

Offline web app for **Travelling Allowance (TA) bills** and **tour diaries** — an offline rebuild of an AppSheet TA/Tour-Diary app used by India Post field officers. Pure HTML/CSS/JS with `localStorage`, no build step, and easy to wrap into a WebView APK later.

## Features
- **Daily diary entries** — Office / Outside (tour) / Holiday / Leave, with the AppSheet trip logic (auto trip numbering, HQ-return completion, next-date +1).
- **Reports** matching the official formats:
  - **TA Bill** (GAR-14A tour bill) with journey table, mileage/DA/fare/hotel/advance summary, tour certificate and Annexure-B food certificate.
  - **Tour Diary** (fortnightly) with description table + journey details.
  - **Visit Report** (Dept. of Posts hardware/software status).
- **Govt DA-day rule** — >8 km from HQ and hours away: <6h→0.3, 6–12h→0.7, >12h→1.0.
- **Distance/Fare auto-fill** from history (incl. same-day return legs) and imported route table.
- **OCR** for diary text from a photo (Tesseract.js).
- **Month summary** with day-by-day view and quick add for missing days.
- **Multi-officer** with PIN login (default 1234, forced change on first login); admin can add Visit modules and block/remove users.
- **Word / PDF** export and adjustable report font.

## Run
```bash
python -m http.server 8891
```
Then open http://localhost:8891

## Deploy on Vercel (with Supabase env vars)
This is a static app, so Supabase keys are injected at **build time** into `config.js`.

1. Vercel → **Add New → Project** → import `boltap-tec/TA_Diary`.
2. **Framework Preset:** Other. (`vercel.json` already sets build command `node scripts/gen-config.js` and output `.`)
3. **Settings → Environment Variables** — add for Production **and** Preview:
   - `SUPABASE_URL` = `https://YOUR-PROJECT-REF.supabase.co`
   - `SUPABASE_ANON_KEY` = your project's **anon / public** key
   - ⚠ Do **not** add the `service_role` key — it must never reach the browser.
4. **Deploy.** Each build regenerates `config.js` from the env vars; the app reads `window.TA_CONFIG`.

Local dev: `cp config.example.js config.js` and fill in your values (git-ignored).

## Files
- `index.html` / `styles.css` / `app.js` — the app
- `seed.js` — sample data (generated from the AppSheet Excel export)
- `scripts/gen_seed.py` — regenerates `seed.js` from the Excel export
