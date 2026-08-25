@echo off
REM Daily TA Diary backup — run by Windows Task Scheduler.
cd /d "%~dp0.."
if not exist "backups" mkdir "backups"
node scripts\backup.mjs >> "backups\backup.log" 2>&1
REM If Task Scheduler cannot find node, replace `node` above with the full path,
REM e.g. "C:\Program Files\nodejs\node.exe" scripts\backup.mjs
