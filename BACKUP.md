# TA Diary — automatic daily backup to Google Drive

A headless script pulls all data from Supabase and writes a **dated JSON file**
in the same shape as the app's *Menu → Export backup*, so any file can be
restored via *Menu → Import backup (JSON)*.

## 1. One-time setup

```bash
copy backup.config.example.json backup.config.json
```

Edit `backup.config.json` (it is git-ignored — never committed):

| field | meaning |
|---|---|
| `url` | your Supabase project URL |
| `anonKey` | the publishable/anon key (same as in `config.js`) |
| `adminEmail` | the admin login (sees every officer's data) |
| `adminPin` | the admin's PIN (e.g. `2020`) |
| `outDir` | folder to write backups into — **point this at a Google Drive folder** |
| `keepDays` | delete backups in `outDir` older than this many days (0 = keep all) |
| `rcloneRemote` | optional; only if using rclone instead of Drive-for-Desktop |

### Getting the file into Google Drive — pick ONE:

**A. Google Drive for Desktop (simplest).** Install it, then set `outDir` to a
synced Drive folder, e.g.:
`"outDir": "C:/Users/ARUL/My Drive/TA Diary Backups"`
Each daily file lands in Drive automatically. `keepDays` also trims old copies there.

**B. rclone (no Drive desktop app).** Install rclone, run `rclone config` once to
add a Google Drive remote (say `gdrive`), then set:
`"rcloneRemote": "gdrive:TA Diary Backups"` (keep `outDir` local, e.g. `./backups`).
The script uploads each file after writing it.

## 2. Test it

```bash
node scripts/backup.mjs
```

It should print `Wrote …ta-diary-backup-YYYY-MM-DD.json (profiles=… entries=… visits=…)`.

## 3. Schedule it daily (Windows Task Scheduler)

Run once in an **Admin** terminal (adjust the time; here 9:00 PM):

```bat
schtasks /Create /SC DAILY /TN "TA Diary Backup" /TR "\"F:\TA_DIARY\scripts\backup.bat\"" /ST 21:00
```

- Check it: `schtasks /Query /TN "TA Diary Backup"`
- Run it now to test: `schtasks /Run /TN "TA Diary Backup"`
- Remove it: `schtasks /Delete /TN "TA Diary Backup" /F`

Logs go to `backups\backup.log`. Files are named by date, so one backup per day
(re-running the same day overwrites that day's file).

## Restore

In the app: **Menu → Import backup (JSON)** → choose a `ta-diary-backup-*.json`.
This replaces the current profiles/entries/visits with the file's contents.

> Note: the backup reads through the admin account, so it captures **all**
> officers' data. It does not include per-device settings (font, toggles) or PINs
> beyond what's stored in `ta_profiles`.
