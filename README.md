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

## Files
- `index.html` / `styles.css` / `app.js` — the app
- `seed.js` — sample data (generated from the AppSheet Excel export)
- `scripts/gen_seed.py` — regenerates `seed.js` from the Excel export
