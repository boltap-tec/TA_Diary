/************************************************************
 * TA Diary — daily backup via Google Apps Script.
 * Runs in Google's cloud (no PC needed), saves a dated JSON
 * to Google Drive in the app's Export format so it can be
 * restored via the app's Menu -> Import backup (JSON).
 *
 * This version uses the Supabase SERVICE-ROLE (secret) key, which reads all
 * data with no login/PIN — so nothing needs updating when the admin PIN changes.
 * The service key bypasses ALL security: keep it ONLY in this private script.
 *
 * SETUP
 * 1. https://script.google.com -> New project -> paste this file.
 * 2. Supabase -> Project Settings -> API keys -> copy the service_role
 *    (secret) key.
 * 3. Apps Script -> Project Settings -> Script Properties, add:
 *      SERVICE_ROLE_KEY = <paste the service_role key>
 *    (or paste it into SERVICE_KEY_INLINE below — never commit it to git).
 * 4. Run checkConfig to confirm the key is loaded, then backupTADiary and
 *    authorize Drive access.
 * 5. Run setupDailyTrigger once to schedule it every day.
 ************************************************************/

var SUPABASE_URL    = 'https://qgcftcobtmvefcxptmfj.supabase.co';
var ADMIN_EMAIL     = 'arulece05@gmail.com';   // only used as the "active" field in the backup
var DRIVE_FOLDER_ID = '1GBVEZlwkrCQXC3cbgWRovZK2rP-ZB6W4';  // the shared backup folder (from its URL)
var DRIVE_FOLDER    = 'TA Diary Backups';                   // fallback (used only if the ID is blank)
var KEEP_DAYS       = 60;          // delete backups older than this (0 = keep all)

// Optional: paste the service_role key here instead of using Script Properties.
// NEVER commit this file with a real key in it.
var SERVICE_KEY_INLINE = '';

function serviceKey_() {
  var p = PropertiesService.getScriptProperties().getProperty('SERVICE_ROLE_KEY');
  return (p || SERVICE_KEY_INLINE || '').toString().trim();
}

// Run this to confirm the key is loaded WITHOUT revealing it. See the Execution log.
function checkConfig() {
  var k = serviceKey_();
  Logger.log('SERVICE_ROLE_KEY loaded = %s (length %s)', k ? 'yes' : 'NO', k.length);
}

function fetchAll_(table, orderCol) {
  var key = serviceKey_();
  if (!key) throw new Error('SERVICE_ROLE_KEY is empty. Add it in Project Settings -> Script Properties, or set SERVICE_KEY_INLINE.');
  var auth = { apikey: key, Authorization: 'Bearer ' + key };
  var size = 1000, from = 0, out = [];
  while (true) {
    var url = SUPABASE_URL + '/rest/v1/' + table + '?select=*'
      + (orderCol ? '&order=' + orderCol + '.asc' : '') + '&limit=' + size + '&offset=' + from;
    var rows = null;
    for (var attempt = 0; attempt < 5; attempt++) {
      var r = UrlFetchApp.fetch(url, { headers: auth, muteHttpExceptions: true });
      var code = r.getResponseCode(), txt = r.getContentText();
      if (code === 200) { rows = JSON.parse(txt); break; }
      if (code === 401 && txt.indexOf('PGRST303') >= 0) { Utilities.sleep(1500); continue; } // clock skew
      throw new Error(table + ' fetch failed: ' + code + ' ' + txt.slice(0, 140));
    }
    if (rows === null) throw new Error(table + ' fetch failed after retries');
    out = out.concat(rows);
    if (rows.length < size) break;
    from += size;
  }
  return out;
}

// ---- row -> app object (mirrors the app's rowTo* so Import works) ----
function t5_(v) { return v ? String(v).slice(0, 5) : ''; }
function mapProfile_(r) { return { email: r.email, name: r.name || '', desg: r.designation || '', basic: r.basic || '',
  parent: r.parent_office || '', pincode: r.pincode || '', daily: +r.daily_ta_fare || 0, mileage: +r.mileage_fare || 0,
  maxBike: +r.max_bike || 0, submitTo: r.submit_to || '', every: r.submit_every || 'Fortnight',
  pin: r.pin || '', is_admin: !!r.is_admin, is_blocked: !!r.is_blocked }; }
function mapEntry_(r) { return { id: r.id, email: r.email, today: r.today || '', leaveType: r.leave_type || '',
  officeFrom: r.office_from || '', officeTo: r.office_to || '', fromDate: r.from_date || '', fromTime: t5_(r.from_time),
  toDate: r.to_date || '', toTime: t5_(r.to_time), mode: r.mode || '', distance: +r.distance || 0, fare: +r.fare || 0,
  days: +r.days || 0, trip: +r.trip || 0, completed: r.completed || '', diaryDetail: r.diary_detail || '',
  diaryShort: r.diary_short || '', taShort: r.ta_short || '', purpose: r.purpose || '' }; }
function mapVisit_(r) { return { id: r.id, email: r.email, date: r.date || '', office: r.office || '', pincode: r.pincode || '',
  ref: r.ref || '', hw: r.hw || [], sw: r.sw || [], aptDtr: r.apt_dtr || '', boBal: r.bo_bal || '', disc: r.disc || '',
  purpose: r.purpose || '', result: r.result || '' }; }

function getFolder_() {
  if (DRIVE_FOLDER_ID) return DriveApp.getFolderById(DRIVE_FOLDER_ID);   // exact folder from its URL
  var it = DriveApp.getFoldersByName(DRIVE_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(DRIVE_FOLDER);
}

function backupTADiary() {
  var data = {
    profiles: fetchAll_('ta_profiles', 'email').map(mapProfile_),
    active: ADMIN_EMAIL,
    entries: fetchAll_('ta_entries', 'id').map(mapEntry_),
    visits: fetchAll_('ta_visits', 'id').map(mapVisit_),
    exported: new Date().toISOString()
  };
  var date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var name = 'ta-diary-backup-' + date + '.json';
  var folder = getFolder_();
  // overwrite same-day file
  var ex = folder.getFilesByName(name);
  while (ex.hasNext()) ex.next().setTrashed(true);
  folder.createFile(name, JSON.stringify(data, null, 2), 'application/json');
  Logger.log('Wrote %s (profiles=%s entries=%s visits=%s)', name, data.profiles.length, data.entries.length, data.visits.length);
  pruneOld_(folder);
}

function pruneOld_(folder) {
  if (!KEEP_DAYS) return;
  var cutoff = Date.now() - KEEP_DAYS * 864e5;
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next(), m = f.getName().match(/^ta-diary-backup-(\d{4}-\d{2}-\d{2})\.json$/);
    if (m && new Date(m[1]).getTime() < cutoff) f.setTrashed(true);
  }
}

// Run this ONCE to schedule a daily backup (~9 PM).
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupTADiary') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupTADiary').timeBased().everyDays(1).atHour(21).create();
}
