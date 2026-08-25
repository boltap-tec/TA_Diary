/* ============================================================
   TA Diary — offline web app (localStorage, multi-officer)
   Mirrors the AppSheet "Main" table logic + govt TA/DA rules.
   ============================================================ */

/* ---------------- storage layer ---------------- */
const LS = {
  get(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch{ return d; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); },
};
const DB = {
  get profiles(){ return LS.get('ta_profiles', []); },
  set profiles(v){ LS.set('ta_profiles', v); },
  get active(){ return localStorage.getItem('ta_active') || (this.profiles[0]?.email || ''); },
  set active(v){ localStorage.setItem('ta_active', v); },
  get p(){ return this.profiles.find(x => x.email === this.active) || null; },
  saveProfile(p){
    const arr = this.profiles.filter(x => x.email !== p.email);
    arr.push(p); this.profiles = arr; this.active = p.email;
  },
  get allE(){ return LS.get('ta_entries', []); },
  set allE(v){ LS.set('ta_entries', v); },
  get e(){ return this.allE.filter(x => x.email === this.active); },
  get allV(){ return LS.get('ta_visits', []); },
  set allV(v){ LS.set('ta_visits', v); },
  get v(){ return this.allV.filter(x => x.email === this.active); },
};

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const ADMIN = 'arulece05@gmail.com';   // only admin may switch officers / manage users

/* =========================================================
   SUPABASE CLOUD LAYER (optional, gated by config.USE_AUTH)
   When enabled: login uses Supabase Auth, data syncs to the
   ta_* tables. When disabled/offline: app stays localStorage.
   ========================================================= */
let _sb=null;
function sbClient(){
  if(_sb) return _sb;
  const c=window.TA_CONFIG||{};
  if(window.supabase && c.SUPABASE_URL && c.SUPABASE_ANON_KEY && !/YOUR-/.test(c.SUPABASE_URL))
    _sb=window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, {auth:{persistSession:true, storageKey:'ta_sb_auth'}});
  return _sb;
}
const sbOn = () => !!(window.TA_CONFIG && window.TA_CONFIG.USE_AUTH) && !!sbClient();
const pinToPass = pin => pin + 'Aa#tadiary';   // internal password derived from the PIN (never shown)

/* row <-> app-object converters */
const rowToEntry = r => ({id:r.id,email:r.email,today:r.today||'',leaveType:r.leave_type||'',officeFrom:r.office_from||'',officeTo:r.office_to||'',
  fromDate:r.from_date||'',fromTime:r.from_time?String(r.from_time).slice(0,5):'',toDate:r.to_date||'',toTime:r.to_time?String(r.to_time).slice(0,5):'',
  mode:r.mode||'',distance:+r.distance||0,fare:+r.fare||0,days:+r.days||0,trip:+r.trip||0,completed:r.completed||'',
  diaryDetail:r.diary_detail||'',diaryShort:r.diary_short||'',taShort:r.ta_short||'',purpose:r.purpose||''});
const entryToRow = e => ({id:e.id,email:e.email,today:e.today||'',leave_type:e.leaveType||'',office_from:e.officeFrom||'',office_to:e.officeTo||'',
  from_date:e.fromDate||null,from_time:e.fromTime||null,to_date:e.toDate||null,to_time:e.toTime||null,mode:e.mode||'',
  distance:+e.distance||0,fare:+e.fare||0,days:+e.days||0,trip:parseInt(e.trip)||0,completed:e.completed||'',
  diary_detail:e.diaryDetail||'',diary_short:e.diaryShort||'',ta_short:e.taShort||'',purpose:e.purpose||''});
const rowToVisit = r => ({id:r.id,email:r.email,date:r.date||'',office:r.office||'',pincode:r.pincode||'',ref:r.ref||'',hw:r.hw||[],sw:r.sw||[],
  aptDtr:r.apt_dtr||'',boBal:r.bo_bal||'',disc:r.disc||'',purpose:r.purpose||'',result:r.result||''});
const visitToRow = v => ({id:v.id,email:v.email,date:v.date||null,office:v.office||'',pincode:v.pincode||'',ref:v.ref||'',hw:v.hw||[],sw:v.sw||[],
  apt_dtr:v.aptDtr||'',bo_bal:v.boBal||'',disc:v.disc||'',purpose:v.purpose||'',result:v.result||''});
const rowToProfile = r => ({email:r.email,name:r.name||'',desg:r.designation||'',basic:r.basic||'',parent:r.parent_office||'',pincode:r.pincode||'',
  daily:+r.daily_ta_fare||0,mileage:+r.mileage_fare||0,maxBike:+r.max_bike||0,submitTo:r.submit_to||'',every:r.submit_every||'Fortnight',
  pin:r.pin||'',is_admin:!!r.is_admin,is_blocked:!!r.is_blocked});
async function sbSetProfilePin(email,pin){ const c=sbClient(); if(!sbOn()) return; try{ await c.from('ta_profiles').update({pin}).eq('email',email); }catch(e){ console.warn('pin sync',e.message); } }
const profileToRow = p => ({email:p.email,name:p.name||'',designation:p.desg||'',basic:p.basic||'',parent_office:p.parent||'',pincode:p.pincode||'',
  daily_ta_fare:+p.daily||0,mileage_fare:+p.mileage||0,max_bike:+p.maxBike||0,submit_to:p.submitTo||'',submit_every:p.every||'Fortnight'});

/* Fetch every row of a table, paging past Supabase's 1000-row-per-request cap.
   Without this, tables larger than 1000 rows (entries, routes, …) load only
   partially, so recent entries silently go missing from the app. */
async function sbSelectAll(table, orderCol){
  const c=sbClient(); const size=1000; const out=[]; let from=0;
  for(;;){
    let q=c.from(table).select('*').range(from, from+size-1);
    if(orderCol) q=q.order(orderCol,{ascending:true});
    const { data, error } = await q;
    if(error) throw error;
    out.push(...(data||[]));
    if(!data || data.length<size) break;
    from += size;
  }
  return out;
}

/* pull this user's data (RLS returns own rows, or all for admin) + shared tables into the local cache */
async function sbPull(){
  const c=sbClient(); if(!c) return;
  try{
    const [offs, rts, profs, ents, vis] = await Promise.all([
      sbSelectAll('ta_offices','name'), sbSelectAll('ta_routes','office_from'),
      sbSelectAll('ta_profiles','email'), sbSelectAll('ta_entries','id'), sbSelectAll('ta_visits','id')
    ]);
    { const m={}; offs.forEach(o=>m[(o.name||'').toLowerCase()]=o.pincode); (window.TA_SEED=window.TA_SEED||{}).officePins=m; }
    { const m={}; rts.forEach(r=>m[(r.office_from||'').toLowerCase()+'||'+(r.office_to||'').toLowerCase()]={d:+r.distance||0,f:+r.fare||0}); (window.TA_SEED=window.TA_SEED||{}).routes=m; }
    if(profs.length) DB.profiles = profs.map(rowToProfile);
    DB.allE = ents.map(rowToEntry);
    DB.allV = vis.map(rowToVisit);
  }catch(e){ console.warn('sbPull failed (using cached data):', e.message); }
}
/* best-effort writes */
async function sbUpsertEntry(e){ const c=sbClient(); if(!sbOn()) return; try{ await c.from('ta_entries').upsert(entryToRow(e)); }catch(err){ console.warn('entry sync',err.message); } }
async function sbDeleteEntry(id){ const c=sbClient(); if(!sbOn()) return; try{ await c.from('ta_entries').delete().eq('id',id); }catch(err){} }
async function sbUpsertVisit(v){ const c=sbClient(); if(!sbOn()) return; try{ await c.from('ta_visits').upsert(visitToRow(v)); }catch(err){ console.warn('visit sync',err.message); } }
async function sbDeleteVisit(id){ const c=sbClient(); if(!sbOn()) return; try{ await c.from('ta_visits').delete().eq('id',id); }catch(err){} }
async function sbUpsertProfile(p){ const c=sbClient(); if(!sbOn()) return; try{ await c.from('ta_profiles').upsert(profileToRow(p)); }catch(err){ console.warn('profile sync',err.message); } }
async function sbSetBlocked(email,val){ const c=sbClient(); if(!sbOn()) return; try{ await c.from('ta_profiles').update({is_blocked:val}).eq('email',email); }catch(err){} }
async function sbDeleteProfile(email){ const c=sbClient(); if(!sbOn()) return; try{ await c.from('ta_profiles').delete().eq('email',email); }catch(err){} }

/* ---------------- PIN / login / access ---------------- */
const getPin = email => (LS.get('ta_pins', {})[email]) || '1234';
const setPin = (email, pin) => { const m = LS.get('ta_pins', {}); m[email] = pin; LS.set('ta_pins', m); };
const isBlocked = email => (LS.get('ta_blocked', [])||[]).includes(email);

function showLogin(){
  $('#emailList').innerHTML = '';   // don't reveal the full email list; suggest only after 4+ chars typed
  $('#loginMsg').classList.remove('err');
  $('#loginMsg').innerHTML='Default PIN is <b>1234</b>. You can change it anytime in Profile.';
  $('#loginView').classList.add('open');
}
// Suggest matching emails only after the officer types the first 4 characters.
$('#loginEmail').addEventListener('input', ()=>{
  const q=$('#loginEmail').value.trim().toLowerCase();
  if(q.length<4){ $('#emailList').innerHTML=''; return; }
  $('#emailList').innerHTML = DB.profiles
    .filter(p=>(p.email||'').toLowerCase().includes(q))
    .map(p=>`<option value="${esc(p.email)}">`).join('');
});
async function doLogin(){
  const email=$('#loginEmail').value.trim().toLowerCase();
  const pin=$('#loginPin').value.trim();
  if(!email||!pin){ loginErr('Enter your email and PIN.'); return; }

  /* ----- Cloud mode: Supabase Auth ----- */
  if(sbOn()){
    loginErr('Signing in…'); $('#loginMsg').classList.remove('err');
    try{
      const { data, error } = await sbClient().auth.signInWithPassword({ email, password: pinToPass(pin) });
      if(error){ loginErr('Incorrect email or PIN. (Default PIN is 1234)'); return; }
      DB.active=email; localStorage.setItem('ta_session',email);
      await sbPull();
      finishLoginUI();
    }catch(e){ loginErr('Network error — check your connection and try again.'); }
    return;
  }

  /* ----- Local mode (default): per-device PIN ----- */
  const prof=DB.profiles.find(p=>p.email.toLowerCase()===email);
  if(!prof){ loginErr('No profile found for that email.'); return; }
  if(isBlocked(prof.email)){ loginErr('This account has been blocked. Please contact the admin.'); return; }
  if(pin!==getPin(prof.email)){ loginErr('Incorrect PIN. (Default is 1234)'); return; }
  finishLogin(prof.email);
}
function finishLoginUI(){
  $('#loginView').classList.remove('open'); $('#loginPin').value='';
  renderHeader(); go('home'); toast('Welcome, '+(DB.p?.name||''));
  // Admin: nudge once at login if the weekly backup is overdue.
  if(DB.active===ADMIN && backupDue()) setTimeout(openBackupModal, 900);
}
function finishLogin(email){
  DB.active=email; localStorage.setItem('ta_session',email);
  finishLoginUI();
}
function loginErr(m){ const el=$('#loginMsg'); el.textContent=m; el.classList.add('err'); }
function logout(){
  localStorage.removeItem('ta_session');          // end session; data & PINs are kept
  if(sbOn()){ try{ sbClient().auth.signOut(); }catch(e){} }
  ['#menuModal','#settingsModal','#sheet','#userModal'].forEach(s=>$(s)&&$(s).classList.remove('open'));
  $('#loginEmail').value=''; $('#loginPin').value='';
  showLogin();
  const el=$('#loginMsg'); el.classList.remove('err'); el.innerHTML='Signed out. Enter your email and PIN to sign in.';
}

/* ---------------- date / time helpers ---------------- */
const todayISO = () => new Date().toLocaleDateString('en-CA');   // local YYYY-MM-DD (avoids UTC off-by-one before ~5:30am IST)
function fmtDate(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function weekday(iso){ if(!iso) return ''; return new Date(iso+'T00:00').toLocaleDateString('en-US',{weekday:'long'}); }
function addDays(iso,n){ const [y,m,d]=iso.split('-').map(Number); const dt=new Date(Date.UTC(y,m-1,d)); dt.setUTCDate(dt.getUTCDate()+n); return dt.toISOString().slice(0,10); }
function fmtTime(t){ if(!t) return ''; const [h,m]=t.split(':'); let hh=+h; const ap=hh>=12?'PM':'AM'; hh=hh%12||12; return `${hh}:${m} ${ap}`; }
function fmtTime24(t){ if(!t) return ''; const [h,m]=t.split(':'); return `${(''+h).padStart(2,'0')}:${(''+(m||'00')).padStart(2,'0')}`; }  // railway time
const MON=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const MONF=['January','February','March','April','May','June','July','August','September','October','November','December'];

/* APT office directory (name → pincode) from seed */
function officePin(name){
  if(!name) return '';
  const key=name.trim().toLowerCase();
  const dir=(window.TA_SEED&&window.TA_SEED.officePins)||{};
  if(dir[key]) return dir[key];
  const v=DB.allV.find(x=>(x.office||'').trim().toLowerCase()===key && x.pincode);
  return v?v.pincode:'';
}
/* route (from||to) → {d,f} from seed Office sheet + all entries */
function routeDF(from,to){
  const k=(from||'').trim().toLowerCase()+'||'+(to||'').trim().toLowerCase();
  const r=(window.TA_SEED&&window.TA_SEED.routes)||{};
  return r[k]||null;
}

const isLeave = t => (t||'').startsWith('Leave');
const isField = t => t==='Outside';
const isOffice= t => t==='Parent_Office';

/* Govt DA-day fraction from hours away: <6h→0.3, 6-12h→0.7, >12h→1.0 */
function daFraction(hours){
  if(hours<=0) return 0;
  if(hours<6) return 0.3;
  if(hours<=12) return 0.7;
  return 1.0;
}
function tripHours(fromDate,fromTime,toDate,toTime){
  if(!fromTime||!toTime) return 0;
  const a=new Date(`${fromDate}T${fromTime}`), b=new Date(`${toDate||fromDate}T${toTime}`);
  return (b-a)/36e5;
}

/* sort a list of entries chronologically */
function sortEntries(list){
  return list.slice().sort((a,b)=>{
    const ka=(a.fromDate||'')+(a.fromTime||'0')+a.id, kb=(b.fromDate||'')+(b.fromTime||'0')+b.id;
    return ka<kb?-1:ka>kb?1:0;
  });
}

/* =========================================================
   ENTRY LOGIC ENGINE (AppSheet Main formulas)
   ========================================================= */
function computeContext(){
  const p = DB.p || {};
  const parent = p.parent || 'Parent Office';

  // --- next date: MAX(To_Date) over ALL entries + 1, UNLESS an outside trip on that
  // last date is still open (return leg pending) — then stay on it to add the return.
  // (Basing this on the max date, not the last-sorted row, keeps it correct after a
  //  delete: removing any entry simply recomputes the max — no phantom extra day.)
  const allList = sortEntries(DB.e);
  const lastAll = allList[allList.length - 1];
  let fromDate = todayISO(), maxTo = '';
  if (lastAll){
    maxTo = allList.reduce((mx,e)=>{ const d=e.toDate||e.fromDate||''; return d>mx?d:mx; }, '');
    // The day stays open only if the LAST leg on maxTo is still on tour (return
    // pending). A completed multi-leg day also has an earlier onward leg with
    // completed='No', so checking *any* leg wrongly kept the next date stuck on
    // the same day — the next date must advance once the final leg returns to HQ.
    const legsOnMax = sortEntries(DB.e.filter(e => isField(e.today) && (e.toDate||e.fromDate)===maxTo));
    const lastLegOnMax = legsOnMax[legsOnMax.length-1];
    const openTripOnMax = !!(lastLegOnMax && lastLegOnMax.completed!=='Yes');
    fromDate = openTripOnMax ? maxTo : addDays(maxTo,1);
  }
  const lastAllCompleted = !lastAll || lastAll.completed === 'Yes';

  // --- trip context: based only on office/outside entries ---
  const list = sortEntries(DB.e.filter(e => isField(e.today) || isOffice(e.today)));
  const last = list[list.length - 1];
  const lastCompleted = !last || last.completed === 'Yes';
  const tripType = lastCompleted ? 'Start' : 'Return';
  const completedTrips = new Set(list.filter(e=>e.completed==='Yes').map(e=>e.trip)).size;
  const tripNumber = completedTrips + 1;
  const ongoing = !lastCompleted && last;
  const officeFrom = ongoing ? (last.officeTo || parent) : parent;

  let autoToday = '';
  if (ongoing && isField(last.today)) autoToday='Outside';
  else if (weekday(fromDate)==='Sunday') autoToday='Holiday';
  return { parent, last, lastAll, lastCompleted, lastAllCompleted, tripType, tripNumber, ongoing, officeFrom, fromDate, autoToday };
}

/* =========================================================
   NAVIGATION
   ========================================================= */
let editingId = null;
function go(view){
  if(view==='visit' && !visitOn(DB.active)) view='home';   // Visit is optional / off by default
  $$('.view').forEach(v=>v.classList.remove('active'));
  $('#view-'+view).classList.add('active');
  $$('.tab').forEach(t=>t.classList.toggle('active', t.dataset.view===view));
  window.scrollTo(0,0);
  if(view==='home') renderHome();
  if(view==='entry'){ if(!editingId) resetEntryForm(); }
  if(view==='reports') renderReportSummary();
  if(view==='visit') renderVisits();
  if(view==='profile') loadProfileForm();
  if(view==='month') renderMonth();
}
let forceDate=null;   // when adding an entry for a specific date (from Month view)
$$('.tab, .quick-btn').forEach(t=>t.addEventListener('click',()=>{
  const v=t.dataset.view; if(!v) return;
  if(v==='entry'){ editingId=null; go('entry'); } else go(v);
}));

/* =========================================================
   HEADER / USER SWITCH
   ========================================================= */
function initials(name){ return (name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?'; }

/* ----- Per-user settings (font, Visit toggle, entry auto-fill). Each officer
   keeps their own; stored on the device keyed by email. ----- */
const SETTINGS_DEFAULTS = { font:"'Times New Roman', serif", size:'12px',
  visit:false, autofillTime:false, autofillMode:false, stickyMode:false,
  showDiary:true, autofillTaShort:false };
function userSettings(email){
  const all = LS.get('ta_user_settings', {});
  let s = all[email];
  if(!s){ // one-time migration from the older per-device / per-user keys
    const oldFont = LS.get('ta_settings', null);
    const oldVisit = !!(LS.get('ta_visit_on', {})[email]);
    s = {}; if(oldFont){ s.font=oldFont.font; s.size=oldFont.size; } if(oldVisit) s.visit=true;
  }
  return { ...SETTINGS_DEFAULTS, ...s };
}
function setUserSetting(email, key, val){
  const all = LS.get('ta_user_settings', {});
  all[email] = { ...SETTINGS_DEFAULTS, ...userSettings(email), [key]:val };
  LS.set('ta_user_settings', all);
}
const visitOn = email => userSettings(email).visit;
function applyVisitVisibility(){
  const on = visitOn(DB.active);
  ['#tabVisit','#qVisit','[data-r="visit"]'].forEach(s=>{ const el=$(s); if(el) el.style.display = on?'':'none'; });
  const q=$('#homeQuick'); if(q) q.classList.toggle('quick4', on);   // 4 cols with Visit, 3 without
  if(!on && $('#view-visit').classList.contains('active')) go('home');
}

function renderHeader(){
  const p=DB.p;
  const admin = DB.active===ADMIN;
  $('#avatar').textContent = initials(p?.name);
  $('#userName').textContent = p?.name || 'TA Diary';
  $('#userDesg').textContent = p ? ((p.desg||'Officer') + (admin?' ▾':'')) : 'Not signed in';
  applyFont();               // per-user report font
  applyVisitVisibility();
  refreshBackupBell();       // weekly backup reminder (admin)
}
$('#btnUser').onclick=()=>{
  if(DB.active!==ADMIN){ toast('Only the admin can switch officers'); return; }
  const list=$('#userList');
  const ps=DB.profiles.slice().sort((a,b)=>a.name.localeCompare(b.name));
  list.innerHTML = ps.length ? ps.map(p=>`
    <button class="user-row ${p.email===DB.active?'active':''}" data-email="${esc(p.email)}">
      <span class="avatar">${esc(initials(p.name))}</span>
      <span><span class="ur-name">${esc(p.name)}</span><br><span class="ur-desg">${esc(p.desg||'')}</span></span>
    </button>`).join('') : '<div class="empty">No officers yet. Add one in Profile.</div>';
  $$('#userList .user-row').forEach(b=>b.onclick=()=>{
    DB.active=b.dataset.email; $('#userModal').classList.remove('open');
    renderHeader(); go('home'); toast('Switched to '+(DB.p?.name||''));
  });
  $('#userModal').classList.add('open');
};
$('#userClose').onclick=()=>$('#userModal').classList.remove('open');

/* =========================================================
   HOME
   ========================================================= */
let homeFilter='all';
function monthEntries(){ const ym=todayISO().slice(0,7); return DB.e.filter(e=>(e.fromDate||'').slice(0,7)===ym); }
function taOf(list, p){
  const es=list.filter(e=>isField(e.today));
  const bikeDist=es.filter(e=>e.mode==='Bike').reduce((s,e)=>s+(+e.distance||0),0);
  const fare=es.filter(e=>['Bus','Train'].includes(e.mode)).reduce((s,e)=>s+(+e.fare||0),0);
  const autoFare=es.filter(e=>e.mode==='Auto').reduce((s,e)=>s+(+e.fare||0),0);
  const days=es.reduce((s,e)=>s+(+e.days||0),0);
  const daily=days*(+p?.daily||0);
  const distRef=(p?.maxBike>0)?Math.min(bikeDist,p.maxBike):bikeDist;
  const mileage=distRef*(+p?.mileage||0);
  const amount=fare+autoFare+daily+mileage;
  return {es,bikeDist,fare,autoFare,days,daily,distRef,mileage,amount};
}
function renderNextCard(){
  const card=$('#nextEntry'); if(!card) return;
  if(!DB.p){ card.style.display='none'; return; }
  card.style.display='flex';
  const ctx=computeContext();
  const d=ctx.fromDate;                     // last entered date + 1 (per user)
  const [y,mo,da]=d.split('-');
  $('#ncMon').textContent=MON[+mo-1];
  $('#ncNum').textContent=+da;
  $('#ncDay').textContent=weekday(d);
  let note=fmtDate(d);
  if(ctx.ongoing) note+=` · Continue Trip ${ctx.tripNumber} (Return)`;
  else if(weekday(d)==='Sunday') note+=' · Sunday — Holiday';
  else note+=` · Start Trip ${ctx.tripNumber}`;
  $('#ncNote').textContent=note;
}
$('#nextEntry').onclick=()=>{ if(!DB.p) return; editingId=null; go('entry'); };

function renderHome(){
  renderHeader();
  renderNextCard();
  const p=DB.p;
  const ctx=computeContext();
  $('#balStatus').textContent = !p ? 'Setup' : ctx.ongoing ? ('On tour · Trip '+ctx.tripNumber) : 'At HQ';
  const t=taOf(monthEntries(), p);
  $('#balPeriod').textContent = new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'});
  animateAmount(t.amount);
  $('#balStats').innerHTML=`
    ${bstat(monthEntries().length,'Entries')}
    ${bstat(t.bikeDist.toFixed(0),'Bike km')}
    ${bstat(t.days.toFixed(1),'DA days')}
    ${bstat('₹'+t.fare.toFixed(0),'Fare')}`;

  let items=sortEntries(DB.e).reverse();
  if(homeFilter==='Leave') items=items.filter(e=>isLeave(e.today));
  else if(homeFilter!=='all') items=items.filter(e=>e.today===homeFilter);
  const box=$('#entryList');
  if(!DB.p){ box.innerHTML=`<div class="empty"><div class="big">👤</div>No officer selected.<br>Add your profile to begin.</div>`; return; }
  box.innerHTML = items.length ? items.slice(0,120).map(renderEntryCard).join('')
    : `<div class="empty"><div class="big">🗒️</div>No entries yet.<br>Tap ＋ to add your first diary entry.</div>`;
  bindCardActions(box);
}
const bstat=(n,l)=>`<div class="bstat"><div class="bstat-n">${n}</div><div class="bstat-l">${l}</div></div>`;
function animateAmount(target){
  const el=$('#balAmount'); const start=+el.dataset.v||0; const t0=performance.now(); const dur=550;
  el.dataset.v=target;
  function step(now){ const k=Math.min(1,(now-t0)/dur); const val=Math.round(start+(target-start)*(1-Math.pow(1-k,3)));
    el.textContent=val.toLocaleString('en-IN'); if(k<1) requestAnimationFrame(step); }
  requestAnimationFrame(step);
}
function catMeta(e){
  if(isLeave(e.today)) return {ic:'🏖️',cls:'ci-lev',label:e.leaveType || e.today.replace(/^Leave$/,'Leave (CL)')};
  if(e.today==='Holiday') return {ic:'🌿',cls:'ci-hol',label:'Holiday'};
  if(isOffice(e.today)) return {ic:'🏢',cls:'ci-off',label:e.officeFrom||DB.p?.parent||'Parent Office'};
  return {ic:'🛵',cls:'ci-out',label:`${e.officeFrom||'?'} → ${e.officeTo||'?'}`};
}
function renderEntryCard(e){
  const m=catMeta(e);
  const completed=e.completed==='Yes';
  const chip = isField(e.today) ? `<span class="chip ${completed?'ok':'no'}">${completed?'Trip done':'On tour'}</span>` : '';
  const tags=[];
  if(isField(e.today)){
    if(e.trip) tags.push(`<span class="tag">Trip ${e.trip}</span>`);
    if(e.mode) tags.push(`<span class="tag">${esc(e.mode)}</span>`);
    if(+e.distance) tags.push(`<span class="tag km">${e.distance} km</span>`);
    if(+e.fare) tags.push(`<span class="tag fare">₹${e.fare}</span>`);
    if(+e.days) tags.push(`<span class="tag day">${e.days} DA</span>`);
  }
  const time=(e.fromTime||e.toTime)?` · ${fmtTime(e.fromTime)}${e.toTime?(' → '+fmtTime(e.toTime)):''}`:'';
  return `<div class="card">
    <div class="card-top">
      <div class="card-head">
        <div class="card-icon ${m.cls}">${m.ic}</div>
        <div style="min-width:0">
          <div class="card-route">${esc(m.label)}</div>
          <div class="card-meta">${fmtDate(e.fromDate)} · ${weekday(e.fromDate)}${time}</div>
        </div>
      </div>${chip}
    </div>
    ${e.purpose?`<div class="card-purpose">${esc(e.purpose)}</div>`:''}
    ${tags.length?`<div class="card-tags">${tags.join('')}</div>`:''}
    <div class="card-actions">
      <button class="mini" data-edit="${e.id}">✏️ Edit</button>
      <button class="mini del" data-del="${e.id}">Delete</button>
    </div>
  </div>`;
}
function bindCardActions(box){
  $$('[data-edit]',box).forEach(b=>b.onclick=()=>{ editingId=b.dataset.edit; go('entry'); loadEntryForm(b.dataset.edit); });
  $$('[data-del]',box).forEach(b=>b.onclick=()=>{
    if(confirm('Delete this entry?')){ DB.allE=DB.allE.filter(e=>e.id!==b.dataset.del); sbDeleteEntry(b.dataset.del); toast('Entry deleted'); renderHome(); }
  });
}
$$('#homeFilter button').forEach(b=>b.onclick=()=>{
  $$('#homeFilter button').forEach(x=>x.classList.remove('active')); b.classList.add('active');
  homeFilter=b.dataset.f; renderHome();
});

/* =========================================================
   ENTRY FORM
   ========================================================= */
let curToday='Outside';
function resetEntryForm(){
  editingId=null;
  $('#entryFormTitle').textContent='New daily entry';
  $('#btnDeleteEntry').style.display='none';
  const ctx=computeContext();
  $('#fOfficeTo').value=''; $('#fFromTime').value=''; $('#fToTime').value='';
  $('#fDistance').value=''; $('#fFare').value='';
  $('#fDiaryDetail').value=''; $('#fDiaryShort').value=''; $('#fTaShort').value='';
  setModeValue(''); $('#fDays').value=''; $('#fLeaveType').value='Leave (CL)';
  ['#fDays','#fDistance','#fFare','#fFromTime','#fToTime','#fMode'].forEach(s=>delete $(s).dataset.touched);
  $('#fCompleted').value='No'; $('#dfHint').textContent='';
  curToday=ctx.autoToday||'Outside';
  setToday(curToday);
  buildOfficeDatalist();
}
function setToday(v){
  curToday=v;
  $$('#todayWork button').forEach(b=>b.classList.toggle('active', b.dataset.v===v));
  const leave=isLeave(v), holiday=v==='Holiday', office=isOffice(v), field=isField(v);
  $('#leaveTypeField').style.display = leave?'block':'none';
  $('#tripFields').style.display='block';
  $('#wrapOffices').style.display   = (holiday||leave)?'none':(office?'block':'grid');
  $('#wrapOfficeTo').style.display  = field?'block':'none';
  $('#wrapFromDate').style.display  = 'block';               // date shown for ALL categories
  $('#wrapToDate').style.display    = field?'block':'none';
  $('#wrapTimes').style.display     = field?'grid':'none';
  $('#wrapMode').style.display      = field?'grid':'none';
  $('#wrapCompleted').style.display = field?'block':'none';
  $('#completeHint').style.display  = field?'block':'none';
  $('#wrapDiaryShort').style.display= field?'block':'none';
  $('#wrapTaShort').style.display   = field?'block':'none';
  $('#wrapDiaryDetail').style.display = (holiday||leave)?'block':'block';
  $('#lblOfficeFrom').textContent   = office?'At Office':'From Office/Place';
  $('#lblFromDate').textContent     = field?'From date':'Date';
  $('#lblPurpose').textContent      = office?'Nature of work' : (holiday||leave)?'Note (optional)' : 'Diary detail text';
  updateDaysVisibility();
  updateModeFare();
  applyContextToForm();
  applyDiaryVisibility();
}
// Hide the Diary fields (short text, long/detail text, OCR) when the officer
// turns off "Diary needed" in Settings. TA short text is not affected.
function applyDiaryVisibility(){
  if(userSettings(DB.active).showDiary===false){
    $('#wrapDiaryShort').style.display='none';
    $('#wrapDiaryDetail').style.display='none';
  }
}
$$('#todayWork button').forEach(b=>b.onclick=()=>setToday(b.dataset.v));

function updateDaysVisibility(){
  const show = isField(curToday) && $('#fCompleted').value==='Yes';
  $('#wrapDays').style.display = show ? 'block' : 'none';
}
function getMode(){ const v=$('#fMode').value; return v==='__custom' ? $('#fModeCustom').value.trim() : v; }
function setModeValue(m){
  const sel=$('#fMode'), opts=[...sel.options].map(o=>o.value);
  if(m && opts.includes(m)){ sel.value=m; $('#fModeCustom').value=''; $('#fModeCustom').style.display='none'; }
  else if(m){ sel.value='__custom'; $('#fModeCustom').value=m; $('#fModeCustom').style.display='block'; }
  else { sel.value=''; $('#fModeCustom').value=''; $('#fModeCustom').style.display='none'; }
}
function updateModeFare(){
  const m=getMode().toLowerCase();
  $('#wrapFare').style.display = (m==='bike'||m==='walk') ? 'none' : 'block';   // bike/walk: mileage, no fare
}
$('#fMode').addEventListener('change',()=>{
  $('#fModeCustom').style.display = $('#fMode').value==='__custom' ? 'block' : 'none';
  updateModeFare();
});
$('#fModeCustom').addEventListener('input',updateModeFare);
$('#fCompleted').addEventListener('change',()=>{ updateDaysVisibility(); updateComplete(); });

function autofillDF(){
  if(editingId) return;
  const from=$('#fOfficeFrom').value.trim().toLowerCase();
  const to=$('#fOfficeTo').value.trim().toLowerCase();
  if(!from||!to){ $('#dfHint').textContent=''; return; }

  // 1) same-date return leg: if this date already has the reverse trip (to→from), reuse its dist/fare
  const date=$('#fFromDate').value;
  const rev=sortEntries(DB.e).reverse().find(e=>isField(e.today) && e.fromDate===date
    && (e.officeFrom||'').trim().toLowerCase()===to
    && (e.officeTo||'').trim().toLowerCase()===from);
  if(rev){
    if(!$('#fDistance').value && rev.distance) $('#fDistance').value=rev.distance;
    if(!$('#fFare').value && rev.fare) $('#fFare').value=rev.fare;
    $('#dfHint').textContent = `↺ same-day return: ${rev.distance||0}km${rev.fare?(' ₹'+rev.fare):''}`;
    // Times/mode for the return leg come from the latest PREVIOUS trip in this same
    // direction (a past return), NOT from today's onward leg (whose times differ).
    const hist=sortEntries(DB.allE).reverse().find(e=>isField(e.today) && e.id!==rev.id
      && (e.officeFrom||'').trim().toLowerCase()===from
      && (e.officeTo||'').trim().toLowerCase()===to);
    applyTripAutofill(hist);
    return;
  }

  const matches=sortEntries(DB.allE).reverse().filter(e=>isField(e.today)  // any user's data
    && (e.officeFrom||'').trim().toLowerCase()===from
    && (e.officeTo||'').trim().toLowerCase()===to);
  if(!matches.length){
    const rt=routeDF(from,to);   // fall back to the imported Office route table
    if(rt){ if(!$('#fDistance').value&&rt.d)$('#fDistance').value=rt.d; if(!$('#fFare').value&&rt.f)$('#fFare').value=rt.f;
      $('#dfHint').textContent=`↺ ${rt.d||0}km${rt.f?(' ₹'+rt.f):''}`; }
    else { $('#dfHint').textContent=''; $('#distList').innerHTML=''; $('#fareList').innerHTML=''; }
    return;
  }
  const dset=[...new Set(matches.map(e=>+e.distance||0).filter(Boolean))];
  const fset=[...new Set(matches.map(e=>+e.fare||0).filter(Boolean))];
  $('#distList').innerHTML=dset.map(d=>`<option value="${d}">`).join('');
  $('#fareList').innerHTML=fset.map(f=>`<option value="${f}">`).join('');
  const r=matches[0];
  if(!$('#fDistance').value && r.distance) $('#fDistance').value=r.distance;
  if(!$('#fFare').value && r.fare) $('#fFare').value=r.fare;
  $('#dfHint').textContent = `↺ ${r.distance||0}km${r.fare?(' ₹'+r.fare):''}`;
  applyTripAutofill(r);   // optional: copy time / mode from the latest similar trip
}
/* Copy From/To time and Mode from a matching earlier trip, if the officer enabled it. */
function applyTripAutofill(r){
  if(editingId || !r) return;
  const st=userSettings(DB.active);
  if(st.autofillTime){
    if(!$('#fFromTime').value && r.fromTime) $('#fFromTime').value=r.fromTime;
    if(!$('#fToTime').value   && r.toTime)   $('#fToTime').value  =r.toTime;
  }
  if(st.autofillMode && !getMode() && r.mode){ setModeValue(r.mode); updateModeFare(); }
}
['#fOfficeFrom','#fOfficeTo'].forEach(s=>$(s).addEventListener('input',()=>{
  suggestInput($(s), $('#officeList'), allOffices);
  updateComplete(); autofillDF();
}));
// When the From/To office is CHANGED (picked or edited), refresh the initialised
// data (distance, fare, and — if their auto-fill is on — times/mode) so stale
// values from the previous office don't stick. Fields the user typed are kept.
function officeChanged(){
  if(editingId) return;
  const st=userSettings(DB.active);
  if(!$('#fDistance').dataset.touched) $('#fDistance').value='';
  if(!$('#fFare').dataset.touched)     $('#fFare').value='';
  if(st.autofillTime){
    if(!$('#fFromTime').dataset.touched) $('#fFromTime').value='';
    if(!$('#fToTime').dataset.touched)   $('#fToTime').value='';
  }
  if(st.autofillMode && !$('#fMode').dataset.touched){ setModeValue(''); updateModeFare(); }
  $('#dfHint').textContent='';
  autofillDF();
  updateComplete();
}
['#fOfficeFrom','#fOfficeTo'].forEach(s=>$(s).addEventListener('change', officeChanged));
$('#fDiaryShort').addEventListener('input',()=>suggestInput($('#fDiaryShort'), $('#shortList'),   shortPoolFn));
$('#fTaShort').addEventListener('input',   ()=>suggestInput($('#fTaShort'),    $('#taShortList'), taPoolFn));

function applyContextToForm(){
  if(editingId) return;
  const ctx=computeContext(); const box=$('#entryContext');
  const nd = forceDate || ctx.fromDate; forceDate=null;
  $('#fFromDate').value=nd; $('#fToDate').value=nd;   // default next date (or the date picked in Month view)
  if(isLeave(curToday)||curToday==='Holiday'){ box.classList.remove('show'); showFromDay(); return; }
  if(isOffice(curToday)){ $('#fOfficeFrom').value=ctx.parent; box.classList.remove('show'); showFromDay(); return; }
  $('#fOfficeFrom').value=ctx.officeFrom;
  box.classList.add('show');
  box.innerHTML = ctx.ongoing
    ? `🛵 <b>Continuing Trip ${ctx.tripNumber}</b> (Return leg). From <b>${esc(ctx.officeFrom)}</b>. Set "To" = <b>${esc(ctx.parent)}</b> to close the trip.`
    : `🚦 <b>Starting Trip ${ctx.tripNumber}</b> from <b>${esc(ctx.parent)}</b>.`;
  // "Repeat the same date's mode": default to the mode already used on this date (any mode).
  if(userSettings(DB.active).stickyMode && !getMode()){
    const sameDay = sortEntries(DB.e).reverse().find(e=>isField(e.today) && e.fromDate===nd && (e.mode||'').trim());
    if(sameDay){ setModeValue(sameDay.mode); updateModeFare(); }
  }
  // Auto-fetch TA short text from the officer's most recent previous entry that has one.
  if(userSettings(DB.active).autofillTaShort && !$('#fTaShort').value){
    const prev = sortEntries(DB.e).reverse().find(e=>isField(e.today) && (e.taShort||'').trim());
    if(prev) $('#fTaShort').value = prev.taShort;
  }
  showFromDay(); updateComplete();
}
function showFromDay(){
  $('#fromDay').textContent = $('#fFromDate').value ? '· '+weekday($('#fFromDate').value) : '';
  $('#toDay').textContent   = $('#fToDate').value ? '· '+weekday($('#fToDate').value) : '';
}
// DA days per govt rule: eligible only if a leg is >8km from HQ; hours = first departure of the
// date to this leg's To-time. <6h→0.3, 6–12h→0.7, >12h→1.0
function computeDAauto(){
  const date=$('#fFromDate').value;
  const curTo=$('#fToTime').value, curFrom=$('#fFromTime').value;
  const dayEntries=DB.e.filter(e=>isField(e.today)&&e.fromDate===date);
  const times=dayEntries.map(e=>e.fromTime).filter(Boolean);
  if(curFrom) times.push(curFrom);
  times.sort();
  const start=times[0], end=curTo;
  const dists=dayEntries.map(e=>+e.distance||0); dists.push(+$('#fDistance').value||0);
  const maxDist=Math.max(0,...dists);
  if(!start||!end) return {days:0,hrs:0,maxDist};
  const hrs=(new Date(`${date}T${end}`)-new Date(`${date}T${start}`))/36e5;
  const days = maxDist>8 ? daFraction(hrs) : 0;
  return {days,hrs,maxDist};
}
function updateComplete(){
  showFromDay();
  const to=$('#fOfficeTo').value.trim().toLowerCase();
  const parent=(DB.p?.parent||'').trim().toLowerCase();
  const backToHQ = to&&parent&&to===parent;
  if(backToHQ) $('#fCompleted').value='Yes';
  updateDaysVisibility();
  // On a return-to-HQ leg the journey carries no purpose — hide the text boxes
  if(isField(curToday)){
    const showText = !backToHQ;
    $('#wrapDiaryDetail').style.display = showText?'block':'none';
    $('#wrapDiaryShort').style.display  = showText?'block':'none';
    $('#wrapTaShort').style.display     = showText?'block':'none';
    applyDiaryVisibility();
  }
  const {days,hrs,maxDist}=computeDAauto();
  if($('#fCompleted').value==='Yes' && !editingId && !$('#fDays').dataset.touched){ $('#fDays').value=days||''; }
  $('#daHint').textContent = hrs>0 ? `(${hrs.toFixed(1)}h, max ${maxDist}km ⇒ ${days})` : '';
  $('#completeHint').textContent = ($('#fCompleted').value==='Yes')
    ? '✅ Trip completed — DA auto-calculated (>8km & hours away). Editable.'
    : 'Mark "Yes" only on the leg where you return to HQ.';
}
// Remember which fields the officer typed by hand, so auto-fill / auto-refresh
// never overwrites a manual value.
['#fDays','#fDistance','#fFare','#fFromTime','#fToTime'].forEach(s=>
  $(s).addEventListener('input',()=>{ $(s).dataset.touched='1'; }));
$('#fMode').addEventListener('change',()=>{ $('#fMode').dataset.touched='1'; });
$('#fModeCustom').addEventListener('input',()=>{ $('#fMode').dataset.touched='1'; });
// Distance now also re-triggers the DA-day calc (previously only time/date did),
// so days are computed even when distance is filled after marking the trip done.
['#fFromTime','#fToTime','#fFromDate','#fToDate','#fDistance'].forEach(s=>$(s).addEventListener('input',updateComplete));

function loadEntryForm(id){
  const e=DB.allE.find(x=>x.id===id); if(!e) return;
  $('#entryFormTitle').textContent='Edit entry';
  $('#btnDeleteEntry').style.display='block';
  let base=e.today; if(isLeave(base)) base='Leave';
  setToday(base);
  if(isLeave(e.today)) $('#fLeaveType').value=e.leaveType||e.today;
  $('#fOfficeFrom').value=e.officeFrom||''; $('#fOfficeTo').value=e.officeTo||'';
  $('#fFromDate').value=e.fromDate||''; $('#fFromTime').value=e.fromTime||'';
  $('#fToDate').value=e.toDate||''; $('#fToTime').value=e.toTime||'';
  setModeValue(e.mode||''); $('#fDistance').value=e.distance||'';
  $('#fFare').value=e.fare||'';
  $('#fDiaryDetail').value=e.diaryDetail||e.purpose||'';
  $('#fDiaryShort').value=e.diaryShort||'';
  $('#fTaShort').value=e.taShort||'';
  $('#fCompleted').value=e.completed==='Yes'?'Yes':'No';
  $('#fDays').value=e.days||'';
  updateDaysVisibility(); updateModeFare(); buildOfficeDatalist();
  $('#entryContext').classList.remove('show'); showFromDay();
}
$('#btnDeleteEntry').onclick=()=>{
  if(editingId && confirm('Delete this entry?')){ DB.allE=DB.allE.filter(e=>e.id!==editingId); sbDeleteEntry(editingId); editingId=null; toast('Entry deleted'); go('home'); }
};

$('#btnSaveEntry').onclick=()=>{
  if(!DB.p){ toast('Set up a Profile first'); go('profile'); return; }
  const ctx=computeContext();
  const leave=isLeave(curToday), holiday=curToday==='Holiday', office=isOffice(curToday);
  const leaveTypeVal = $('#fLeaveType').value.trim() || 'Leave';
  const today = leave ? 'Leave' : curToday;   // canonical category; custom label kept in leaveType
  const mode = office ? '' : getMode();
  const isBike = mode.toLowerCase()==='bike' || mode.toLowerCase()==='walk';
  const completedVal = office ? 'Yes' : $('#fCompleted').value;
  const diaryDetail = $('#fDiaryDetail').value.trim();
  const diaryShort  = $('#fDiaryShort').value.trim();
  const taShort     = $('#fTaShort').value.trim();
  const e={
    id: editingId || uid(), email: DB.active, today,
    leaveType: leave ? leaveTypeVal : '',
    officeFrom: (holiday||leave)?(DB.p.parent||''):($('#fOfficeFrom').value.trim()||ctx.officeFrom),
    officeTo: office?(DB.p.parent||''):(holiday||leave)?'':$('#fOfficeTo').value.trim(),
    fromDate: $('#fFromDate').value||todayISO(),
    fromTime: (office||holiday||leave)?'':$('#fFromTime').value,
    toDate: $('#fToDate').value||$('#fFromDate').value||todayISO(),
    toTime: (office||holiday||leave)?'':$('#fToTime').value,
    mode,
    distance: office?0:(+$('#fDistance').value||0),
    fare: (office||isBike)?0:(+$('#fFare').value||0),
    diaryDetail, diaryShort, taShort,
    purpose: diaryDetail || (leave?leaveTypeVal:holiday?'Holiday':''),
    // DA days: when editing, keep the shown value. For a NEW completed trip, use the
    // typed value if the officer set one, else compute it fresh at save time so it's
    // never left at 0 just because the live calc didn't re-run.
    days: (holiday||leave||office)?0:(completedVal==='Yes'
      ?(editingId
        ?(+$('#fDays').value||0)
        :($('#fDays').dataset.touched?(+$('#fDays').value||0):(computeDAauto().days||+$('#fDays').value||0)))
      :0),
  };
  if(editingId){ const old=DB.allE.find(x=>x.id===editingId); e.trip=old?.trip||ctx.tripNumber; e.tripType=old?.tripType||ctx.tripType; }
  else { e.trip=(holiday||leave)?0:ctx.tripNumber; e.tripType=ctx.tripType; }
  if(holiday||leave){ e.completed='Yes'; e.trip=0; }
  else if(office){ e.completed='Yes'; }
  else{
    const toHQ=e.officeTo&&DB.p.parent&&e.officeTo.trim().toLowerCase()===DB.p.parent.trim().toLowerCase();
    e.completed = toHQ ? 'Yes' : $('#fCompleted').value;
  }
  const arr=DB.allE.filter(x=>x.id!==e.id); arr.push(e); DB.allE=arr;
  sbUpsertEntry(e);
  // If this is a NEW field entry whose day is not yet complete (not back to HQ),
  // keep the same date's next leg open automatically. Only a completed day sends
  // you home, so the next date is started by tapping ＋.
  const continueDay = !editingId && isField(today) && e.completed!=='Yes';
  toast(editingId?'Entry updated ✓':(continueDay?'Leg saved — continue this date ✓':'Entry saved ✓'));
  editingId=null;
  if(continueDay){ go('entry'); }   // context keeps the same trip/date on the next leg
  else go('home');
};
$('#btnCancelEntry').onclick=()=>{ editingId=null; go('home'); };

/* Suggestion pools (built fresh each call so they include the latest entries). */
const _uniq = arr => [...new Set(arr.filter(Boolean).map(x=>x.toString().trim()).filter(Boolean))];
function allOffices(){
  const arr=[].concat(DB.e.map(e=>e.officeTo), DB.e.map(e=>e.officeFrom), DB.v.map(v=>v.office));
  if(DB.p?.parent) arr.push(DB.p.parent);
  return _uniq(arr);
}
const shortPoolFn = () => _uniq(DB.e.map(e=>e.diaryShort));
const taPoolFn    = () => _uniq(DB.e.map(e=>e.taShort));
/* Fill a <datalist> with pool matches ONLY after 4+ characters are typed.
   Keeps the whole list from dumping on tap and covering the phone screen. */
function suggestInput(inputEl, datalistEl, poolFn, minLen=4){
  const q=(inputEl.value||'').trim().toLowerCase();
  if(q.length<minLen){ datalistEl.innerHTML=''; return; }
  const opts=(poolFn()||[]).filter(x=>x.toLowerCase().includes(q)).slice(0,8);
  datalistEl.innerHTML=opts.map(o=>`<option value="${esc(o)}">`).join('');
}
function buildOfficeDatalist(){
  const recent = sortEntries(DB.e).reverse();               // newest first
  const uniq = _uniq;
  // Datalists start EMPTY — options are added only after 4+ letters are typed
  // (see suggestInput), so nothing dumps on tap and the phone screen stays clear.
  $('#officeList').innerHTML=''; $('#shortList').innerHTML=''; $('#taShortList').innerHTML='';

  // The "Insert a saved note" picker stays a full dropdown (the user opens it on purpose).
  const ds=$('#diaryDetailSug');
  if(ds){
    const notes=uniq(recent.map(e=>e.diaryDetail)).slice(0,40);
    ds.innerHTML = '<option value="">💡 Insert a saved note…</option>'
      + notes.map(t=>`<option value="${esc(t)}">${esc(t.length>70?t.slice(0,70)+'…':t)}</option>`).join('');
  }
}
// insert a saved note into the (textarea) diary-detail field
$('#diaryDetailSug').addEventListener('change',function(){
  if(!this.value) return;
  const box=$('#fDiaryDetail');
  box.value = box.value.trim() ? box.value.trim()+'\n'+this.value : this.value;
  this.value='';
});

/* =========================================================
   PROFILE
   ========================================================= */
function loadProfileForm(){
  const p=DB.p||{};
  $('#pName').value=p.name||''; $('#pDesg').value=p.desg||''; $('#pBasic').value=p.basic||'';
  $('#pEmail').value=p.email||''; $('#pParent').value=p.parent||''; $('#pPincode').value=p.pincode||'';
  $('#pDaily').value=p.daily||''; $('#pMileage').value=p.mileage||''; $('#pMaxBike').value=p.maxBike||'';
  $('#pSubmitTo').value=p.submitTo||''; $('#pEvery').value=p.every||'Fortnight';
}
$('#btnNewProfile').onclick=()=>{
  ['#pName','#pDesg','#pBasic','#pEmail','#pParent','#pPincode','#pDaily','#pMileage','#pMaxBike','#pSubmitTo'].forEach(s=>$(s).value='');
  $('#pName').focus(); toast('Enter details for the new officer');
};
$('#btnSaveProfile').onclick=()=>{
  const p={
    name:$('#pName').value.trim(), desg:$('#pDesg').value.trim(), basic:$('#pBasic').value.trim(),
    email:$('#pEmail').value.trim()||('user_'+uid()+'@local'),
    parent:$('#pParent').value.trim(), pincode:$('#pPincode').value.trim(),
    daily:+$('#pDaily').value||0, mileage:+$('#pMileage').value||0, maxBike:+$('#pMaxBike').value||0,
    submitTo:$('#pSubmitTo').value.trim(), every:$('#pEvery').value,
  };
  if(!p.name){ toast('Please enter a name'); return; }
  DB.saveProfile(p); sbUpsertProfile(p); renderHeader(); toast('Profile saved ✓'); go('home');
};

/* =========================================================
   REPORTS
   ========================================================= */
// Advance / Hotel are now entered inside the TA Bill (below the journey table), not on the Reports screen.
let taAdvance=0, taHotel=0, taBaseAmount=0;
function getRange(){ return { from:$('#rpFrom').value, to:$('#rpTo').value }; }
function entriesInRange(){
  const {from,to}=getRange();
  return sortEntries(DB.e).filter(e=>{
    const d=e.fromDate||''; if(from&&d<from)return false; if(to&&d>to)return false; return true;
  });
}
$$('#rpQuick button').forEach(b=>b.onclick=()=>{
  $$('#rpQuick button').forEach(x=>x.classList.remove('active')); b.classList.add('active');
  const now=new Date(),y=now.getFullYear(),m=now.getMonth();
  if(b.dataset.q==='thisMonth'){ $('#rpFrom').value=iso(y,m,1); $('#rpTo').value=iso(y,m+1,0); }
  else if(b.dataset.q==='thisFN'){ if(now.getDate()<=15){$('#rpFrom').value=iso(y,m,1);$('#rpTo').value=iso(y,m,15);}else{$('#rpFrom').value=iso(y,m,16);$('#rpTo').value=iso(y,m+1,0);} }
  else{ $('#rpFrom').value=''; $('#rpTo').value=''; }
  renderReportSummary();
});
function iso(y,m,d){ return new Date(y,m,d).toLocaleDateString('en-CA'); }
['#rpFrom','#rpTo'].forEach(s=>$(s).addEventListener('input',renderReportSummary));

function renderReportSummary(){
  const box=$('#reportSummary'); if(!box) return;   // summary card removed from Reports screen
  const {from,to}=getRange(); const t=taOf(entriesInRange(), DB.p);
  const advance=taAdvance, hotel=taHotel;
  const gross=t.amount+hotel, net=gross-advance;
  const label=(from||to)?`${fmtDate(from)||'…'} – ${fmtDate(to)||'…'}`:'All dates';
  box.innerHTML=`
    <div style="font-weight:800;margin-bottom:10px;font-size:14px">Period: ${label}</div>
    <div class="row"><span>Journeys (outside)</span><span>${t.es.length}</span></div>
    <div class="row"><span>Bus / train fare</span><span>₹${t.fare.toFixed(2)}</span></div>
    <div class="row"><span>Daily allowance (${t.days.toFixed(2)} days)</span><span>₹${t.daily.toFixed(2)}</span></div>
    <div class="row"><span>Mileage (${t.distRef.toFixed(0)}×₹${+DB.p?.mileage||0})</span><span>₹${t.mileage.toFixed(2)}</span></div>
    <div class="row"><span>Hotel rent / staying</span><span>₹${hotel.toFixed(2)}</span></div>
    <div class="row"><span>Gross total</span><span>₹${gross.toFixed(2)}</span></div>
    <div class="row"><span>Less: advance</span><span>₹${advance.toFixed(2)}</span></div>
    <div class="row"><span>Net payable</span><span>₹${net.toFixed(2)}</span></div>`;
}
$$('.report-card').forEach(c=>c.onclick=()=>{
  if(!DB.p){ toast('Select an officer first'); return; }
  const r=c.dataset.r;
  if(r==='ta'){ openSheet('TA Bill (Tour)', docTA()); wireTADoc(); }
  if(r==='diary') openSheet('Tour Diary', docDiary());
  if(r==='visit') go('visit');
});

// Live Hotel / Advance inputs inside the TA Bill recompute the Gross, Net, words
// and advance-drawn line without regenerating the sheet (keeps typing focus).
function recomputeTA(){
  const hInp=$('#taHotelInp'), aInp=$('#taAdvInp');
  const hotel=+(hInp?.value)||0;
  const advance=+(aInp?.value)||0;
  taHotel=hotel; taAdvance=advance;                 // persist for print / re-open
  // reflect typed values into the value attribute so Word export (innerHTML) keeps them
  if(hInp) hInp.setAttribute('value', hInp.value);
  if(aInp) aInp.setAttribute('value', aInp.value);
  const gross=taBaseAmount+hotel, net=gross-advance;
  const set=(id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  set('#taGross', gross.toFixed(2));
  set('#taNet',  net.toFixed(2));
  set('#taNet2', net.toFixed(2));
  set('#taWords', numWords(Math.round(net)));
  set('#taAdvDrawn', advance>0?advance.toFixed(2):'Nil');
}
function wireTADoc(){
  const h=$('#taHotelInp'), a=$('#taAdvInp');
  if(h) h.addEventListener('input', recomputeTA);
  if(a) a.addEventListener('input', recomputeTA);
}

/* =========================================================
   MONTH SUMMARY
   ========================================================= */
let monthCursor = todayISO().slice(0,7);
function shiftMonth(ym,delta){ let [y,m]=ym.split('-').map(Number); m+=delta; if(m<1){m=12;y--;} if(m>12){m=1;y++;} return `${y}-${String(m).padStart(2,'0')}`; }
const msStat=(n,l)=>`<div class="ms-stat"><div class="ms-n">${n}</div><div class="ms-l">${l}</div></div>`;
function renderMonth(){
  const [y,m]=monthCursor.split('-').map(Number);
  $('#monthTitle').textContent=MONF[m-1]+' '+y;
  const es=sortEntries(DB.e).filter(e=>(e.fromDate||'').slice(0,7)===monthCursor);
  const t=taOf(es, DB.p);
  const byDate={}; es.forEach(e=>{ (byDate[e.fromDate]=byDate[e.fromDate]||[]).push(e); });
  const days=new Date(y,m,0).getDate(); const today=todayISO();
  let missing=0;
  for(let d=1;d<=days;d++){ const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if(iso<=today && !byDate[iso] && weekday(iso)!=='Sunday') missing++; }
  $('#monthSummary').innerHTML=`<div class="ms-grid">
      ${msStat('₹'+Math.round(t.amount).toLocaleString('en-IN'),'TA claim')}
      ${msStat(t.bikeDist.toFixed(0),'Bike km')}
      ${msStat(t.days.toFixed(1),'DA days')}
      ${msStat('₹'+t.fare.toFixed(0),'Fare')}
      ${msStat(es.length,'Entries')}
      ${msStat(missing,'Missing days')}
    </div>`;
  let html='';
  for(let d=1;d<=days;d++){
    const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const wd=weekday(iso), list=byDate[iso]||[], future=iso>today;
    if(list.length){
      const e=list[0], meta=catMeta(e), extra=list.length>1?` +${list.length-1} more`:'';
      html+=`<div class="mday has" data-edit="${e.id}">
        <div class="md-num">${d}<span>${wd.slice(0,3)}</span></div>
        <div class="md-body"><b>${esc(meta.label)}</b>${extra}<div class="md-sub">${esc(e.diaryDetail||e.purpose||'')}</div></div>
        <div class="md-ic">${meta.ic}</div></div>`;
    } else {
      const isSun=wd==='Sunday';
      html+=`<div class="mday ${future?'future':(isSun?'sun':'miss')}" ${future?'':`data-add="${iso}"`}>
        <div class="md-num">${d}<span>${wd.slice(0,3)}</span></div>
        <div class="md-body">${future?'<span class="md-sub">—</span>':`<span class="md-add">＋ ${isSun?'Add (Holiday?)':'Add entry'}</span>`}</div>
        <div class="md-ic">${future?'·':'◻'}</div></div>`;
    }
  }
  $('#monthGrid').innerHTML=html;
  $$('#monthGrid [data-edit]').forEach(b=>b.onclick=()=>{ editingId=b.dataset.edit; go('entry'); loadEntryForm(b.dataset.edit); });
  $$('#monthGrid [data-add]').forEach(b=>b.onclick=()=>{ forceDate=b.dataset.add; editingId=null; go('entry'); });
}
$('#monthPrev').onclick=()=>{ monthCursor=shiftMonth(monthCursor,-1); renderMonth(); };
$('#monthNext').onclick=()=>{ monthCursor=shiftMonth(monthCursor,1); renderMonth(); };

/* =========================================================
   TA BILL  (matches GAR-14A PDF, incl. Annexure-B)
   ========================================================= */
function periodLabel(){
  const {from,to}=getRange(); if(!from&&!to) return 'All dates';
  return `${fmtDate(from)} to ${fmtDate(to)}`;
}
function docTA(){
  const p=DB.p||{}; const t=taOf(entriesInRange(),p); const es=entriesInRange().filter(e=>isField(e.today));
  const advance=taAdvance;
  const hotel=taHotel;
  taBaseAmount=t.amount;                 // TA+DA+auto+mileage; gross = base + hotel
  const gross=t.amount+hotel;
  const net=gross-advance;
  const rows=es.map(e=>`<tr>
    <td class="dtcell">${fmtDate(e.fromDate)}<br>${fmtTime24(e.fromTime)}</td>
    <td>${esc(e.officeFrom)}</td>
    <td class="dtcell">${fmtDate(e.toDate)}<br>${fmtTime24(e.toTime)}</td>
    <td>${esc(e.officeTo)}</td>
    <td class="center">${esc(e.mode)}</td>
    <td class="num">${(+e.distance||0)?(+e.distance).toFixed(2):''}</td>
    <td class="num">${(+e.fare||0)?(+e.fare).toFixed(2):''}</td>
    <td class="center">${(+e.days||0)?(+e.days).toFixed(2):''}</td>
    <td>${esc(e.taShort||e.diaryShort||e.purpose)}</td></tr>`).join('') || `<tr><td colspan="9" class="center muted">No journeys in this period</td></tr>`;
  const words=numWords(Math.round(net));
  const dailyWords=numWords(Math.round(t.daily));

  const page1=`<div class="doc">
    <table class="nb"><tr>
      <td style="width:33%">G.A.R 14-A</td><td class="center">CENTRAL &nbsp; Sub-bill (Tour)</td>
      <td class="right">Sub-Bill No ……… <br>T.R.25</td></tr></table>
    <h1>TRAVELLING ALLOWANCE BILL FOR TOUR</h1>
    <div class="center small">(This bill should be prepared in duplicate — one for payment and other as office copy)</div>
    <div class="center" style="font-weight:700;margin:8px 0">PART-A (To be filled in by the Government servant)</div>
    <div class="kv">1. Name &nbsp;: <b>${esc(p.name)}</b></div>
    <div class="kv">2. Designation &nbsp;: <b>${esc(p.desg)}</b></div>
    <div class="kv">3. Pay Rs &nbsp;: <b>${esc(p.basic)}</b> (basic)</div>
    <div class="kv">4. Headquarters &nbsp;: <b>${esc(p.parent)} - ${esc(p.pincode)}</b></div>
    <div class="kv">5. Details and purposes of Journey(s) performed &nbsp; <b>${periodLabel()}</b></div>
    <table>
      <colgroup><col style="width:10%"><col style="width:15%"><col style="width:10%"><col style="width:15%"><col style="width:7%">
        <col style="width:7%"><col style="width:7%"><col style="width:6%"><col style="width:23%"></colgroup>
      <thead>
        <tr><th>-1</th><th>-2</th><th>-3</th><th>-4</th><th>-5</th><th>-6</th><th>-7</th><th>-8</th><th>-9</th></tr>
        <tr><th>Date &amp; Time From</th><th>From Office/Place</th><th>Date &amp; Time To</th><th>To Office/Place</th>
            <th>Mode</th><th>Dist (Km)</th><th>Fare (Rs)</th><th>Days</th><th>Purpose of Journey</th></tr>
      </thead>
      <tbody>${rows}
        <tr class="tot"><td class="right" colspan="5">Total ${t.bikeDist.toFixed(0)} Kms by Bike</td>
          <td class="num">${t.bikeDist.toFixed(0)}</td><td class="num">${t.fare.toFixed(2)}</td>
          <td class="center">${t.days.toFixed(2)}</td><td></td></tr>
      </tbody>
    </table>
    <table style="margin-top:10px;width:65%">
      <thead><tr><th>Particulars</th><th style="width:130px">Amount (Rs.)</th></tr></thead>
      <tbody>
      <tr><td>Travelling Allowance (bus fare, train)</td><td class="num">${t.fare.toFixed(2)}</td></tr>
      <tr><td>Daily Allowance (${t.days.toFixed(2)} × ${(+p.daily||0).toFixed(2)})</td><td class="num">${t.daily.toFixed(2)}</td></tr>
      <tr><td>Auto fare</td><td class="num">${t.autoFare.toFixed(2)}</td></tr>
      <tr><td>Mileage ${t.distRef.toFixed(2)} (${t.distRef.toFixed(0)}×${+p.mileage||0})</td><td class="num">${t.mileage.toFixed(2)}</td></tr>
      <tr><td>Hotel Rent / Staying Charges</td><td class="num"><input id="taHotelInp" class="docinp num" type="number" step="1" min="0" value="${hotel||''}" placeholder="0.00"></td></tr>
      <tr class="tot"><td>Gross Total</td><td class="num" id="taGross">${gross.toFixed(2)}</td></tr>
      <tr><td>Less: Advance Received</td><td class="num"><input id="taAdvInp" class="docinp num" type="number" step="1" min="0" value="${advance||''}" placeholder="0.00"></td></tr>
      <tr class="tot"><td><b>Net Payable</b></td><td class="num"><b id="taNet">${net.toFixed(2)}</b></td></tr>
      </tbody>
    </table>
    <div class="kv" style="margin-top:6px"><b>RS. <span id="taNet2">${net.toFixed(2)}</span> /-</b> ( <span id="taWords">${esc(words)}</span> Only )</div>
    <div class="kv small">Amount of Advance of Travelling Allowances, if any, Drawn — Rs. <span id="taAdvDrawn">${advance>0?advance.toFixed(2):'Nil'}</span>/-</div>
    <hr>
    <div style="font-weight:700">TOUR CERTIFICATE</div>
    <ol class="small">
      <li>I actually traveled by bus/vehicle as claimed in the T.A. bill.</li>
      <li>I was actually and not merely constructively in camp on days and other holidays during the period for which DA has been charged in this bill.</li>
      <li>I was not on casual leave on any day for which DA has been charged in this bill.</li>
      <li>Journeys were performed in the interest of service and no Govt. transport was utilized for the journey for which road mileage has been claimed.</li>
      <li>I was not treated as state guest during my halt and was not provided with boarding/lodging at state expenses. I was not provided with free railway card pass for journey for which railway fares have been claimed.</li>
    </ol>
    <div class="sign"><span>Place : ${esc((p.parent||'').replace(/\s*\d{6}\s*$/,'').split(/\s/)[0]||'')}<br>Date :</span>
      <span class="right"><b>${esc(p.name)}</b><br>${esc(p.desg)}<br>(Signature of the Govt. Servant)</span></div>
  </div>`;

  const page2=`<div class="doc partb">
    <div class="partb-title">PART-B (To be filled in the Bill Section)</div>
    <p>The net entitlement on account of travelling allowance works out to Rs. ____________________ as detailed below :-</p>
    <div class="kv">(a) Railways / air / bus / steamer fare : Rs. ______________________</div>
    <div class="kv">(b) Road mileage for ______________ Kms. @ Rs. ____________ per km.</div>
    <div class="kv">(c) Daily allowance</div>
    <div class="kv" style="padding-left:24px">(i) ____________ day @ Rs. ____________ per day.</div>
    <div class="kv" style="padding-left:24px">(ii) ____________ day @ Rs. ____________ per day.</div>
    <div class="kv">(d) Actual expenses &nbsp; Rs. ____________________</div>
    <div class="kv right">Gross Amount &nbsp; Rs. ____________________</div>
    <div class="kv">(e) Less amount of T.A. advance, if any, drawn vide voucher No.______ date ______ Rs. ______</div>
    <div class="kv right">Net amount &nbsp; Rs. ____________________</div>
    <p>The expenditure is debitable to ____________________</p>
    <div class="partb-signs">
      <div class="sign"><span>Initials of Bill Clerk</span><span>Signature of D.D.O.</span></div>
      <div class="sign"><span>Counter signed</span><span>Signature of Controlling Officer</span></div>
    </div>
  </div>`;

  // Use the selected filter range (From/To dates) for the tour period; fall back to
  // the actual entry span only when "All" is selected (no range set).
  const {from:rngFrom,to:rngTo}=getRange();
  const foodFrom = rngFrom? fmtDate(rngFrom) : (es.length? fmtDate(es[0].fromDate):periodLabel());
  const foodTo   = rngTo?   fmtDate(rngTo)   : (es.length? fmtDate(es[es.length-1].toDate||es[es.length-1].fromDate):'');
  const page3=`<div class="doc">
    <h2>ANNEXURE — 'B'</h2>
    <div class="center" style="font-weight:700;margin-bottom:10px">Expenditure incurred on account of Food bills during tour.</div>
    <p>This is to certify that I was on official tour from <b>${foodFrom} — ${foodTo}</b> and incurred expenditure
    on account of my food bills amounting to <b>Rs. ${t.daily.toFixed(2)}/-</b> (${esc(dailyWords)} Only)
    @ Rs. ${(+p.daily||0).toFixed(2)}/- per day.</p>
    <p>It is also certified that I have not been issued with any receipt on account of payments made towards my food
    bills as the Hotel / Restaurant / Stall where I had taken breakfast/lunch/dinner/snacks/beverage had no receipt
    book with them.</p>
    <div class="sign" style="margin-top:40px">
      <span>PLACE : ${esc((p.parent||'').replace(/\s*\d{6}\s*$/,'').split(/\s/)[0]||'')}<br>DATE :</span>
      <span class="right"><b>${esc(p.name)}</b><br>${esc(p.desg)}</span></div>
  </div>`;

  return page1+page2+page3;
}

/* =========================================================
   TOUR DIARY  (matches Diary PDF)
   ========================================================= */
function diaryTitle(){
  const {from,to}=getRange();
  if(from&&to){
    const df=new Date(from+'T00:00'), dt=new Date(to+'T00:00');
    if(df.getMonth()===dt.getMonth()&&df.getFullYear()===dt.getFullYear()){
      const mon=MON[df.getMonth()], yr=df.getFullYear();
      if(df.getDate()===1 && dt.getDate()<=15) return `FIRST FORTNIGHT - ${mon} ${yr}`;
      if(df.getDate()>=16) return `SECOND FORTNIGHT - ${mon} ${yr}`;
      if(df.getDate()===1) return `${mon} ${yr}`;
    }
    return `${fmtDate(from)} to ${fmtDate(to)}`;
  }
  return 'ALL DATES';
}
function docDiary(){
  const p=DB.p||{}; const es=entriesInRange();
  // DESCRIPTION: one line per entry that carries narrative (skip blank return legs)
  const descEntries=es.filter(e=>!isField(e.today) || (e.purpose && e.purpose.trim()));
  const descRows=descEntries.map(e=>{
    let place;
    if(isField(e.today)) place=e.officeTo||e.officeFrom||'';
    else if(isOffice(e.today)) place=e.officeFrom||p.parent||'';
    else place = isLeave(e.today) ? (e.leaveType||e.today) : 'Holiday';
    const details = e.diaryDetail || e.purpose || '';
    return `<tr>
      <td class="dd-date">${fmtDate(e.fromDate)}</td>
      <td class="dd-day">${weekday(e.fromDate)}</td>
      <td class="dd-place">${esc(place)}</td>
      <td>${esc(details)}</td></tr>`;
  }).join('') || `<tr><td colspan="4" class="center muted">No entries in this period</td></tr>`;

  const journeys=es.filter(e=>isField(e.today));
  const rows=journeys.map(e=>`<tr>
    <td class="dtcell">${fmtDate(e.fromDate)}<br>${fmtTime24(e.fromTime)}</td>
    <td>${esc(e.officeFrom)}</td>
    <td class="dtcell">${fmtDate(e.toDate)}<br>${fmtTime24(e.toTime)}</td>
    <td>${esc(e.officeTo)}</td>
    <td class="center">${esc(e.mode)}</td>
    <td class="num">${(+e.distance||0)?(+e.distance).toFixed(2):''}</td>
    <td class="num">${(+e.fare||0)?(+e.fare).toFixed(2):''}</td>
    <td class="center">${(+e.days||0)?(+e.days).toFixed(2):''}</td>
    <td>${esc(e.diaryShort||e.purpose)}</td></tr>`).join('') || `<tr><td colspan="9" class="center muted">No journeys</td></tr>`;

  return `<div class="doc">
    <h2>DIARY FOR THE ${esc(diaryTitle())}</h2>
    <div class="kv">1. Name &nbsp;: <b>${esc(p.name)}</b></div>
    <div class="kv">2. Designation &nbsp;: <b>${esc(p.desg)}</b></div>
    <div class="kv">3. Headquarters &nbsp;: <b>${esc(p.parent)} - ${esc(p.pincode)}</b></div>
    <div style="font-weight:700;margin:12px 0 6px">DESCRIPTION :</div>
    <table class="desct">
      <thead><tr><th>Date</th><th>Day</th><th>Place</th><th>Details of work / journey</th></tr></thead>
      <tbody>${descRows}</tbody>
    </table>
    <div style="font-weight:700;margin:16px 0 4px">Journey Details</div>
    <table>
      <colgroup><col style="width:10%"><col style="width:15%"><col style="width:10%"><col style="width:15%">
        <col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:6%"><col style="width:23%"></colgroup>
      <thead>
        <tr><th>-1</th><th>-2</th><th>-3</th><th>-4</th><th>-5</th><th>-6</th><th>-7</th><th>-8</th><th>-9</th></tr>
        <tr><th>Date &amp; Time From</th><th>From Office/Place</th><th>Date &amp; Time To</th><th>To Office/Place</th><th>Mode</th><th>Dist Km</th><th>Fare</th><th>Days</th><th>Purpose of visit</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="kv" style="margin-top:14px">Submitted to : <b>${esc(p.submitTo||'—')}</b></div>
    <div class="right" style="margin-top:26px"><b>${esc(p.name)}</b><br>${esc(p.desg)}<br>${esc(p.parent)} - ${esc(p.pincode)}</div>
  </div>`;
}

/* =========================================================
   VISIT REPORT
   ========================================================= */
const HW=['Genset','UPS','System','Router, Switch','Laser Printer','Dot Matrix Printer',
  'Whether the passbook printer is working or not and the same is utilized optimally','Inkjet Adhar Printer'];
const SW=['APT module','Finacle','Adhar','NSP1','NSP2','Adhar Software','EKYC Kit'];
const STATUS=['Working','Not Working','N/A','Under Repair','Not Available'];
// admin-added custom modules
const getHW=()=>HW.concat(LS.get('ta_hw_extra',[]));
const getSW=()=>SW.concat(LS.get('ta_sw_extra',[]));

function buildVisitControls(){
  const row=(name,pfx,i)=>`<div class="vrow"><span>${i+1}. ${name}</span>
    <select data-vf="${pfx}${i}">${STATUS.map(s=>`<option>${s}</option>`).join('')}</select></div>`;
  $('#vHardware').innerHTML=getHW().map((n,i)=>row(n,'hw',i)).join('');
  $('#vSoftware').innerHTML=getSW().map((n,i)=>row(n,'sw',i)).join('');
}
// auto-fetch pincode from APT office directory when office chosen
$('#vOffice').addEventListener('input',()=>{ suggestInput($('#vOffice'), $('#officeList'), allOffices); const pin=officePin($('#vOffice').value); if(pin) $('#vPincode').value=pin; });
function renderVisits(){
  buildVisitControls();
  if(!$('#vDate').value) $('#vDate').value=todayISO();
  const list=DB.v.slice().reverse();
  const box=$('#visitList');
  box.innerHTML=list.length?list.map(v=>`<div class="card">
    <div class="card-top"><div class="card-head">
      <div class="card-icon ci-off">🖥️</div>
      <div style="min-width:0"><div class="card-route">${esc(v.office||'—')}</div>
      <div class="card-meta">${fmtDate(v.date)} · Pin ${esc(v.pincode||'—')}</div></div>
    </div></div>
    ${v.purpose?`<div class="card-purpose">${esc(v.purpose)}</div>`:''}
    <div class="card-actions">
      <button class="mini" data-vprint="${v.id}">🖨 Preview</button>
      <button class="mini del" data-vdel="${v.id}">Delete</button></div></div>`).join('')
    : `<div class="empty"><div class="big">🖥️</div>No visit reports yet.</div>`;
  $$('#visitList [data-vprint]').forEach(b=>b.onclick=()=>{ const v=DB.allV.find(x=>x.id===b.dataset.vprint); openSheet('Visit Report', docVisit(v)); });
  $$('#visitList [data-vdel]').forEach(b=>b.onclick=()=>{ if(confirm('Delete this visit report?')){ DB.allV=DB.allV.filter(x=>x.id!==b.dataset.vdel); sbDeleteVisit(b.dataset.vdel); renderVisits(); toast('Deleted'); } });
}
$('#btnSaveVisit').onclick=()=>{
  if(!DB.p){ toast('Select an officer first'); return; }
  const v={ id:uid(), email:DB.active, date:$('#vDate').value||todayISO(),
    office:$('#vOffice').value.trim(), pincode:$('#vPincode').value.trim(), ref:$('#vRef').value.trim(),
    aptDtr:$('#vAptDtr').value.trim(), boBal:$('#vBoBal').value.trim(), disc:$('#vDisc').value.trim(),
    purpose:$('#vPurpose').value.trim(), result:$('#vResult').value.trim(),
    hw:getHW().map((_,i)=>$(`[data-vf="hw${i}"]`)?.value||''), sw:getSW().map((_,i)=>$(`[data-vf="sw${i}"]`)?.value||'') };
  if(!v.office){ toast('Enter office name'); return; }
  const arr=DB.allV; arr.push(v); DB.allV=arr; sbUpsertVisit(v);
  $('#vOffice').value=''; $('#vPincode').value=''; $('#vPurpose').value=''; $('#vResult').value=''; $('#vRef').value='';
  toast('Visit report saved ✓'); renderVisits(); openSheet('Visit Report', docVisit(v));
};
$('#btnCancelVisit').onclick=()=>go('home');

function docVisit(v){
  const p=DB.p||{};
  const hw=getHW(), sw=getSW();
  const hwRows=hw.map((n,i)=>`<tr><td class="center">${i+1}</td><td>${esc(n)}</td><td class="center">${esc(v.hw?.[i]||'')}</td></tr>`).join('')
    + `<tr><td class="center">${hw.length+1}</td><td>Others, if any</td><td></td></tr>`;
  // software: base 1-5, then Balance/BO/Discrepancy, then Adhar Software + EKYC, then custom extras, then Others
  const swList=[];
  for(let i=0;i<5;i++) swList.push([sw[i], v.sw?.[i]]);
  swList.push(['Balance in APT and DTR', v.aptDtr]);
  swList.push(['BO Balance in DTR with Manual Daily Account', v.boBal]);
  swList.push(['Any Other Discrepancies', v.disc]);
  swList.push([sw[5], v.sw?.[5]]);   // Adhar Software
  swList.push([sw[6], v.sw?.[6]]);   // EKYC Kit
  sw.slice(7).forEach((n,k)=>swList.push([n, v.sw?.[7+k]]));   // admin custom SW
  swList.push(['Others, if any','']);
  const swRows=swList.map((r,i)=>`<tr><td class="center">${i+1}</td><td>${esc(r[0])}</td><td class="center">${esc(r[1]||'')}</td></tr>`).join('');
  const hqShort=(p.parent||'').replace(/\s*\d{6}\s*$/,'');
  return `<div class="doc">
    <h1>DEPARTMENT OF POSTS, INDIA</h1>
    <h2>Visit Report</h2>
    <div class="kv">Name : <b>${esc(p.name)}</b></div>
    <div class="kv">Visited On : <b>${fmtDate(v.date)}</b></div>
    <div class="kv">Reference If any : ${esc(v.ref)||'DO Orders'}</div>
    <div class="kv">Office Name : <b>${esc(v.office)} – ${esc(v.pincode)}</b></div>
    <table>
      <thead><tr><th style="width:34px">Sl.No.</th><th>Hardware</th><th style="width:120px">Working status</th></tr></thead>
      <tbody>${hwRows}</tbody>
    </table>
    <table>
      <thead><tr><th style="width:34px">Sl.No.</th><th>Software</th><th style="width:120px">Working status</th></tr></thead>
      <tbody>${swRows}</tbody>
    </table>
    <div class="kv"><b>Purpose of visit :</b> ${esc(v.purpose)}</div>
    <div class="kv"><b>Result :</b> ${esc(v.result)}</div>
    <div class="sign">
      <span>Postmaster / Sub Postmaster,<br>${esc(v.office)} – ${esc(v.pincode)}</span>
      <span class="right">${esc(p.name)}<br>${esc(p.desg)}<br>${esc(hqShort)} – ${esc(p.pincode)}</span>
    </div>
  </div>`;
}

/* =========================================================
   SHEET / MENU / BACKUP
   ========================================================= */
function openSheet(title,html){ $('#sheetTitle').textContent=title; $('#sheetBody').innerHTML=html; $('#sheet').classList.add('open'); }
$('#sheetClose').onclick=()=>$('#sheet').classList.remove('open');

/* =========================================================
   Report export / share — works in the browser AND in the
   Android APK (Capacitor). In a native WebView an <a download>
   is ignored, so files are saved/shared through the native
   Filesystem + Share plugins instead.
   ========================================================= */
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const capPlugin = name => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;
function reportFilename(){ return ($('#sheetTitle').textContent||'report').replace(/[^\w]+/g,'_'); }
function blobToBase64(blob){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(',')[1]||''); r.onerror=rej; r.readAsDataURL(blob); });
}

/* ---- Word (.doc) ---- */
function reportWordBlob(){
  const html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">'
    +'<head><meta charset="utf-8"><style>'
    +'body{font-family:'+getComputedStyle(document.documentElement).getPropertyValue('--doc-font')+';}'
    +'table{border-collapse:collapse;width:100%}td,th{border:1px solid #000;padding:4px 6px;font-size:11px;vertical-align:top}'
    +'h1{font-size:15px;text-align:center}h2{font-size:13px;text-align:center}.right{text-align:right}.center{text-align:center}.num{text-align:right}'
    +'.doc{page-break-after:always}.sign{display:flex;justify-content:space-between;margin-top:30px}</style></head><body>'
    + $('#sheetBody').innerHTML + '</body></html>';
  return new Blob(['﻿'+html],{type:'application/msword'});
}

/* ---- PDF (real file, one report-page per PDF page) ---- */
function reportPdfBlob(){
  if(!window.html2pdf) return Promise.reject(new Error('PDF engine not loaded'));
  const opt={
    margin:[8,8,8,8],
    image:{type:'jpeg',quality:0.98},
    html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff'},
    jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
    pagebreak:{mode:['css','legacy'],before:'.doc',avoid:['tr','.sign']}
  };
  return window.html2pdf().set(opt).from($('#sheetBody')).outputPdf('blob');
}

/* ---- Deliver a blob: share via the OS, or save/download ---- */
async function deliverFile(blob, filename, share){
  if(isNative()){
    const Filesystem=capPlugin('Filesystem'), Share=capPlugin('Share');
    const data=await blobToBase64(blob);
    if(share && Share){
      await Filesystem.writeFile({path:filename,data,directory:'CACHE',recursive:true});
      const {uri}=await Filesystem.getUri({path:filename,directory:'CACHE'});
      await Share.share({title:filename,url:uri});
      return;
    }
    // save/download: try public Documents, fall back to cache + share sheet
    try{
      await Filesystem.writeFile({path:filename,data,directory:'DOCUMENTS',recursive:true});
      toast('Saved to Documents › '+filename);
    }catch(e){
      await Filesystem.writeFile({path:filename,data,directory:'CACHE',recursive:true});
      const {uri}=await Filesystem.getUri({path:filename,directory:'CACHE'});
      if(Share){ await Share.share({title:filename,url:uri}); } else { toast('Saved: '+filename); }
    }
    return;
  }
  // Browser: native share if asked & available, else download
  if(share && navigator.canShare){
    const file=new File([blob],filename,{type:blob.type});
    if(navigator.canShare({files:[file]})){ try{ await navigator.share({files:[file],title:filename}); return; }catch(e){ if(e&&e.name==='AbortError') return; } }
  }
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  if(share) toast('Sharing not available here — file downloaded instead');
}

async function doReport(kind /* 'share-pdf' | 'save-pdf' | 'save-word' */){
  try{
    if(kind==='save-word'){ await deliverFile(reportWordBlob(), reportFilename()+'.doc', false); if(!isNative()) toast('Word file saved'); return; }
    toast('Preparing PDF…');
    const blob=await reportPdfBlob();
    await deliverFile(blob, reportFilename()+'.pdf', kind==='share-pdf');
  }catch(e){
    // PDF engine unavailable → fall back to the Word document
    await deliverFile(reportWordBlob(), reportFilename()+'.doc', kind==='share-pdf');
    toast('PDF unavailable — used Word instead');
  }
}
$('#sheetShare').onclick=()=>doReport('share-pdf');
$('#sheetPrint').onclick=()=>doReport('save-pdf');
$('#sheetWord').onclick =()=>doReport('save-word');

$('#btnMenu').onclick=()=>$('#menuModal').classList.add('open');
$('#miClose').onclick=()=>$('#menuModal').classList.remove('open');

/* ---- Settings (per-user: font + Visit + auto-fill; plus PIN + admin) ---- */
function applyFont(){
  const s=userSettings(DB.active);
  document.documentElement.style.setProperty('--doc-font',s.font);
  document.documentElement.style.setProperty('--doc-size',s.size);
  return s;
}
function openSettings(){
  const s=applyFont();
  $('#setFont').value=s.font; $('#setFontSize').value=s.size; $('#setNewPin').value='';
  $('#setVisit').checked      = s.visit;
  $('#setAfTime').checked     = s.autofillTime;
  $('#setAfMode').checked     = s.autofillMode;
  $('#setStickyMode').checked = s.stickyMode;
  $('#setAfTa').checked       = s.autofillTaShort;
  $('#setDiary').checked      = s.showDiary;
  $('#setWhose').textContent  = 'These settings apply to ' + (DB.p?.name || DB.active || 'this officer') + ' only.';
  const admin=DB.active===ADMIN;
  $('#adminSettings').style.display = admin?'block':'none';
  if(admin){
    renderAdminSettings();
    // refresh profiles (and their current PINs) from Supabase for an up-to-date list
    if(sbOn()){ sbClient().from('ta_profiles').select('*').then(({data})=>{ if(data){ DB.profiles=data.map(rowToProfile); renderAdminSettings(); } }); }
  }
  $('#menuModal').classList.remove('open'); $('#settingsModal').classList.add('open');
}
$('#miSettings').onclick=openSettings;
$('#settingsClose').onclick=()=>$('#settingsModal').classList.remove('open');
function saveFont(){
  setUserSetting(DB.active,'font',$('#setFont').value);
  setUserSetting(DB.active,'size',$('#setFontSize').value);
  applyFont(); toast('Font updated');
}
$('#setVisit').onchange=()=>{
  setUserSetting(DB.active,'visit',$('#setVisit').checked);
  applyVisitVisibility();
  toast($('#setVisit').checked ? 'Office Visit Report enabled' : 'Office Visit Report hidden');
};
$('#setAfTime').onchange     =()=>{ setUserSetting(DB.active,'autofillTime',$('#setAfTime').checked);   toast('Saved'); };
$('#setAfMode').onchange     =()=>{ setUserSetting(DB.active,'autofillMode',$('#setAfMode').checked);   toast('Saved'); };
$('#setStickyMode').onchange =()=>{ setUserSetting(DB.active,'stickyMode',$('#setStickyMode').checked); toast('Saved'); };
$('#setAfTa').onchange        =()=>{ setUserSetting(DB.active,'autofillTaShort',$('#setAfTa').checked); toast('Saved'); };
$('#setDiary').onchange       =()=>{ setUserSetting(DB.active,'showDiary',$('#setDiary').checked);
  if($('#view-entry').classList.contains('active')) setToday(curToday);   // re-apply field visibility now
  toast($('#setDiary').checked ? 'Diary fields shown' : 'Diary fields hidden'); };
$('#setFont').onchange=saveFont;
$('#setFontSize').onchange=saveFont;
// Unified PIN change — works in both cloud (Supabase password) and local (device PIN) modes.
async function changePin(newPin){
  if(!/^\d{4,8}$/.test(newPin)) return {ok:false, msg:'PIN must be 4–8 digits.'};
  if(sbOn()){
    try{
      // A PIN change updates the signed-in account's password. If the admin is
      // only *viewing* another officer (switched view), refuse — otherwise the
      // admin's own password would be overwritten and only that person could log in.
      const { data } = await sbClient().auth.getSession();
      const authEmail = data && data.session && data.session.user && data.session.user.email;
      if(authEmail && DB.active && authEmail.toLowerCase()!==DB.active.toLowerCase())
        return {ok:false, msg:'You can only change the PIN for the officer who is signed in. Ask them to sign in and change it themselves.'};
      const {error}=await sbClient().auth.updateUser({ password:pinToPass(newPin) });
      if(error) return {ok:false, msg:'Could not update PIN: '+error.message};
      await sbSetProfilePin(DB.active, newPin);   // keep the visible PIN column in sync
    }catch(e){ return {ok:false, msg:'Network error. Please try again.'}; }
  } else {
    if(!DB.active) return {ok:false, msg:'Sign in first.'};
    setPin(DB.active,newPin);
  }
  // update local cache so the admin list shows the new PIN immediately
  DB.profiles = DB.profiles.map(x => x.email===DB.active ? {...x, pin:newPin} : x);
  return {ok:true, msg:'PIN updated ✓'};
}
$('#setSavePin').onclick=async ()=>{
  const r=await changePin($('#setNewPin').value.trim());
  toast(r.msg); if(r.ok) $('#setNewPin').value='';
};
$('#btnChangePin').onclick=async ()=>{
  const a=$('#pNewPin').value.trim(), b=$('#pNewPin2').value.trim();
  const msg=$('#changePinMsg');
  if(a!==b){ msg.textContent='The two PINs do not match.'; msg.style.color='#b91c1c'; return; }
  const r=await changePin(a);
  msg.textContent=r.msg; msg.style.color=r.ok?'var(--ok)':'#b91c1c';
  if(r.ok){ $('#pNewPin').value=''; $('#pNewPin2').value=''; toast(r.msg); }
};

/* ---- Admin controls ---- */
function renderAdminSettings(){
  const hwx=LS.get('ta_hw_extra',[]), swx=LS.get('ta_sw_extra',[]);
  $('#customModules').innerHTML =
    hwx.map((m,i)=>`<span class="cmod">HW: <b>${esc(m)}</b> <button data-rmhw="${i}">×</button></span>`).join('')
    + swx.map((m,i)=>`<span class="cmod">SW: <b>${esc(m)}</b> <button data-rmsw="${i}">×</button></span>`).join('')
    || '<span class="hint">No custom modules added.</span>';
  $$('#customModules [data-rmhw]').forEach(b=>b.onclick=()=>{ const a=LS.get('ta_hw_extra',[]); a.splice(+b.dataset.rmhw,1); LS.set('ta_hw_extra',a); renderAdminSettings(); buildVisitControls(); });
  $$('#customModules [data-rmsw]').forEach(b=>b.onclick=()=>{ const a=LS.get('ta_sw_extra',[]); a.splice(+b.dataset.rmsw,1); LS.set('ta_sw_extra',a); renderAdminSettings(); buildVisitControls(); });

  const ps=DB.profiles.slice().sort((a,b)=>a.name.localeCompare(b.name));
  const blocked=LS.get('ta_blocked',[]);
  $('#setResetUser').innerHTML=ps.map(p=>`<option value="${esc(p.email)}">${esc(p.name)} — ${esc(p.email)}${blocked.includes(p.email)?' (BLOCKED)':''}</option>`).join('');
  $('#adminUsers').innerHTML=ps.filter(p=>p.email!==ADMIN).map(p=>`
    <div class="admin-user">
      <span><b>${esc(p.name)}</b><br><span class="ur-desg">${esc(p.email)}${blocked.includes(p.email)?' · BLOCKED':''}</span>
        <br><span class="ur-pin">🔑 PIN: <b>${esc(p.pin||getPin(p.email))}</b></span></span>
      <span class="au-actions">
        <button class="mini" data-block="${esc(p.email)}">${blocked.includes(p.email)?'Unblock':'Block'}</button>
        <button class="mini del" data-remove="${esc(p.email)}">Remove</button>
      </span></div>`).join('') || '<span class="hint">No other users.</span>';
  $$('#adminUsers [data-block]').forEach(b=>b.onclick=()=>toggleBlock(b.dataset.block));
  $$('#adminUsers [data-remove]').forEach(b=>b.onclick=()=>removeUser(b.dataset.remove));
}
$('#setAddHw').onclick=()=>{ const v=$('#setNewHw').value.trim(); if(!v)return; const a=LS.get('ta_hw_extra',[]); a.push(v); LS.set('ta_hw_extra',a); $('#setNewHw').value=''; renderAdminSettings(); buildVisitControls(); toast('Hardware module added'); };
$('#setAddSw').onclick=()=>{ const v=$('#setNewSw').value.trim(); if(!v)return; const a=LS.get('ta_sw_extra',[]); a.push(v); LS.set('ta_sw_extra',a); $('#setNewSw').value=''; renderAdminSettings(); buildVisitControls(); toast('Software module added'); };
$('#setResetPin').onclick=()=>{ const em=$('#setResetUser').value; if(!em)return; setPin(em,'1234'); toast('PIN reset to 1234'); };
function toggleBlock(email){ const a=LS.get('ta_blocked',[]); const i=a.indexOf(email); if(i>=0)a.splice(i,1); else a.push(email); LS.set('ta_blocked',a); sbSetBlocked(email,i<0); renderAdminSettings(); toast('User '+(i>=0?'unblocked':'blocked')); }
function removeUser(email){
  const prof=DB.profiles.find(p=>p.email===email);
  if(!confirm(`Remove ${prof?.name||email} and ALL their entries & visit reports? This cannot be undone.`)) return;
  DB.profiles=DB.profiles.filter(p=>p.email!==email);
  DB.allE=DB.allE.filter(e=>e.email!==email);
  DB.allV=DB.allV.filter(v=>v.email!==email);
  LS.set('ta_blocked',LS.get('ta_blocked',[]).filter(x=>x!==email));
  const pm=LS.get('ta_pins',{}); delete pm[email]; LS.set('ta_pins',pm);
  sbDeleteProfile(email);
  renderAdminSettings(); toast('User removed');
}

/* ---- OCR (Diary detail text) ---- */
function ensureTesseract(){ return new Promise((res,rej)=>{ if(window.Tesseract) return res();
  const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
// Pre-process a photo for OCR: normalise resolution (upscale small shots, cap
// huge ones), convert to grayscale, then stretch contrast so text edges are
// crisp. This lifts Tesseract accuracy a lot on clear printed pages — the main
// gains available on-device without a cloud OCR service.
function preprocessImage(file){
  return new Promise(resolve=>{
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{
      const longest=Math.max(img.width,img.height)||1;
      const target=Math.min(2200, Math.max(1600, longest));   // aim for 1600–2200px on the long side
      const scale=target/longest;
      const w=Math.max(1,Math.round(img.width*scale)), h=Math.max(1,Math.round(img.height*scale));
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      const cx=c.getContext('2d'); cx.drawImage(img,0,0,w,h);
      URL.revokeObjectURL(url);
      try{
        const im=cx.getImageData(0,0,w,h), d=im.data;
        let mn=255,mx=0;
        for(let i=0;i<d.length;i+=4){                        // grayscale + find min/max
          const g=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)|0;
          d[i]=d[i+1]=d[i+2]=g; if(g<mn)mn=g; if(g>mx)mx=g;
        }
        const range=Math.max(1,mx-mn);
        for(let i=0;i<d.length;i+=4){                        // contrast stretch to full 0–255
          let v=((d[i]-mn)*255/range)|0; v=v<0?0:v>255?255:v;
          d[i]=d[i+1]=d[i+2]=v;
        }
        cx.putImageData(im,0,0);
      }catch(e){/* tainted/large canvas — fall back to the plain resized image */}
      c.toBlob(b=>resolve(b||file),'image/png');            // PNG keeps text edges sharp
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); resolve(file); };
    img.src=url;
  });
}
let _ocrWorker=null;
async function ocrWorker(st){
  await ensureTesseract();
  if(_ocrWorker) return _ocrWorker;                 // reuse across scans (much faster after the first)
  st.textContent='Loading OCR engine (one-time)…';
  _ocrWorker=await Tesseract.createWorker('eng',1,{logger:m=>{
    if(m.status==='recognizing text') st.textContent='Scanning… '+Math.round(m.progress*100)+'%';
  }});
  try{ await _ocrWorker.setParameters({
    tessedit_pageseg_mode: '6',        // treat the photo as a single uniform block of text
    preserve_interword_spaces: '1',    // keep spacing between words
  }); }catch(e){/* older tesseract build — ignore */}
  return _ocrWorker;
}
$('#ocrBtn').onclick=()=>$('#ocrFile').click();
$('#ocrFile').onchange=async(ev)=>{
  const f=ev.target.files[0]; if(!f) return; const st=$('#ocrStatus'); const btn=$('#ocrBtn');
  btn.disabled=true; st.textContent='Preparing image…';
  try{
    const img=await preprocessImage(f);
    const w=await ocrWorker(st);
    st.textContent='Scanning…';
    const {data}=await w.recognize(img);
    const txt=(data.text||'').replace(/[ \t]+\n/g,'\n').replace(/\n{2,}/g,'\n').trim();
    if(!txt){ st.textContent='No readable text found — try a clearer, well-lit, straight photo.'; }
    else{ const box=$('#fDiaryDetail'); box.value=(box.value?box.value.trim()+'\n':'')+txt; st.textContent='✓ Added '+txt.length+' characters.'; }
  }catch(e){ st.textContent='⚠ OCR failed — it needs internet the first time. Please retry online.'; }
  btn.disabled=false; ev.target.value='';
};

/* ---- Login ---- */
$('#loginBtn').onclick=doLogin;
$('#loginPin').addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });
$('#miExport').onclick=async ()=>{
  const data={profiles:DB.profiles,active:DB.active,entries:DB.allE,visits:DB.allV,exported:new Date().toISOString()};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  await deliverFile(blob, `ta-diary-backup-${todayISO()}.json`, false);   // saves on APK too
  markBackupDone(); if(!isNative()) toast('Backup saved');
  $('#menuModal').classList.remove('open');
};

/* ---- Export ALL data to a real Excel workbook (Entries / Visits / Profiles) ---- */
async function exportExcel(){
  if(!window.XLSX){ toast('Excel engine not loaded'); return; }
  $('#menuModal').classList.remove('open'); toast('Preparing Excel…');
  const nameOf={}; DB.profiles.forEach(p=>nameOf[p.email]=p.name||'');
  const wb=XLSX.utils.book_new();
  const entries=sortEntries(DB.allE).map(e=>({
    Name:nameOf[e.email]||'', Email:e.email, Date:e.fromDate, Weekday:weekday(e.fromDate), Category:e.today,
    'From Office':e.officeFrom, 'To Office':e.officeTo, 'From Time':e.fromTime, 'To Date':e.toDate, 'To Time':e.toTime,
    Mode:e.mode, Distance:+e.distance||0, Fare:+e.fare||0, Days:+e.days||0, Trip:e.trip, Completed:e.completed,
    'Diary Detail':e.diaryDetail, 'Diary Short':e.diaryShort, 'TA Short':e.taShort, Purpose:e.purpose }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entries.length?entries:[{Note:'No entries'}]), 'Entries');
  const visits=DB.allV.map(v=>({ Name:nameOf[v.email]||'', Email:v.email, Date:v.date, Office:v.office, Pincode:v.pincode,
    Hardware:(v.hw||[]).filter(Boolean).join(', '), Software:(v.sw||[]).filter(Boolean).join(', '),
    'APT/DTR':v.aptDtr, 'BO Balance':v.boBal, Discrepancies:v.disc, Purpose:v.purpose, Result:v.result }));
  if(visits.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visits), 'Visits');
  const profs=DB.profiles.map(p=>({ Name:p.name, Email:p.email, Designation:p.desg, Basic:p.basic,
    'Parent Office':p.parent, Pincode:p.pincode, 'Daily DA':p.daily, Mileage:p.mileage, 'Max Bike':p.maxBike,
    'Submit To':p.submitTo, Every:p.every }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(profs), 'Profiles');
  const arr=XLSX.write(wb,{type:'array',bookType:'xlsx'});
  const blob=new Blob([arr],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  await deliverFile(blob, `ta-diary-${todayISO()}.xlsx`, false);
  markBackupDone(); if(!isNative()) toast('Excel exported ✓');
}
$('#miExcel').onclick=exportExcel;

/* ---- Weekly backup reminder (admin) ---- */
function markBackupDone(){ LS.set('ta_last_backup', todayISO()); refreshBackupBell(); }
function daysSinceBackup(){ const d=LS.get('ta_last_backup',null); return d? Math.floor((new Date(todayISO())-new Date(d))/864e5) : Infinity; }
function backupDue(){ return daysSinceBackup()>=7; }
function refreshBackupBell(){
  const admin=DB.active===ADMIN, bell=$('#btnBell'); if(!bell) return;
  bell.style.display = admin ? '' : 'none';
  const dot=$('#bellDot'); if(dot) dot.style.display = (admin && backupDue()) ? '' : 'none';
}
function openBackupModal(){
  const n=daysSinceBackup(), last=LS.get('ta_last_backup',null);
  $('#backupMsg').innerHTML = last
    ? `Last backup: <b>${fmtDate(last)}</b> (${n===0?'today':n+' day'+(n>1?'s':'')+' ago'}).<br>`+(backupDue()?'⚠️ It\'s time for your weekly backup.':'You\'re up to date — you can back up again anytime.')
    : `No backup has been taken on this device yet.<br>Please export a backup to keep the data safe.`;
  $('#menuModal').classList.remove('open'); $('#backupModal').classList.add('open');
}
$('#btnBell').onclick=openBackupModal;
$('#bkClose').onclick=()=>$('#backupModal').classList.remove('open');
$('#bkJson').onclick=()=>{ $('#backupModal').classList.remove('open'); $('#miExport').click(); };
$('#bkExcel').onclick=()=>{ $('#backupModal').classList.remove('open'); exportExcel(); };
$('#miImport').onclick=()=>$('#importFile').click();
$('#importFile').onchange=(ev)=>{
  const f=ev.target.files[0]; if(!f) return; const r=new FileReader();
  r.onload=()=>{ try{ const d=JSON.parse(r.result);
    if(Array.isArray(d.profiles)) DB.profiles=d.profiles; else if(d.profile) DB.profiles=[d.profile];
    if(d.active) DB.active=d.active;
    if(Array.isArray(d.entries)) DB.allE=d.entries;
    if(Array.isArray(d.visits)) DB.allV=d.visits;
    toast('Backup imported ✓'); $('#menuModal').classList.remove('open'); renderHeader(); go('home');
  }catch{ toast('Invalid backup file'); } };
  r.readAsText(f);
};
$('#miReseed').onclick=()=>{ if(confirm('Reload the sample data from the Excel export? This replaces current data.')){ loadSeed(true); $('#menuModal').classList.remove('open'); renderHeader(); go('home'); toast('Sample data reloaded'); } };
$('#miLogout').onclick=logout;
$('#setLogout').onclick=logout;
$('#miClear').onclick=()=>{ if(confirm('Delete ALL data for ALL officers? Cannot be undone.')){ ['ta_profiles','ta_entries','ta_visits','ta_active'].forEach(k=>localStorage.removeItem(k)); $('#menuModal').classList.remove('open'); renderHeader(); toast('All data cleared'); go('home'); } };

/* =========================================================
   HELPERS
   ========================================================= */
function esc(s){ return (s??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),2200); }
function numWords(n){
  n=Math.round(n); if(n===0) return 'Rupees Zero';
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two=x=>x<20?a[x]:b[Math.floor(x/10)]+(x%10?' '+a[x%10]:'');
  const three=x=>x>=100?a[Math.floor(x/100)]+' Hundred'+(x%100?' '+two(x%100):''):two(x);
  let out='',cr=Math.floor(n/1e7);n%=1e7;let l=Math.floor(n/1e5);n%=1e5;let th=Math.floor(n/1e3);n%=1e3;
  if(cr)out+=three(cr)+' Crore ';if(l)out+=three(l)+' Lakh ';if(th)out+=three(th)+' Thousand ';if(n)out+=three(n);
  return 'Rupees '+out.trim();
}

/* =========================================================
   SEED / INIT
   ========================================================= */
function loadSeed(force){
  if(!window.TA_SEED) return;
  if(!force && DB.profiles.length) return;
  DB.profiles=window.TA_SEED.profiles||[];
  DB.allE=window.TA_SEED.entries||[];
  DB.allV=window.TA_SEED.visits||[];
  DB.active=window.TA_SEED.active||(DB.profiles[0]?.email||'');
}
(function init(){
  loadSeed(false);
  applyFont();
  const now=new Date(),y=now.getFullYear(),m=now.getMonth();
  if(now.getDate()<=15){ $('#rpFrom').value=iso(y,m,1); $('#rpTo').value=iso(y,m,15); }
  else{ $('#rpFrom').value=iso(y,m,16); $('#rpTo').value=iso(y,m+1,0); }
  $('#rpQuick button[data-q="thisFN"]').classList.add('active');
  buildVisitControls();
  renderHeader(); renderHome();

  // ----- Always require a fresh login. No device stays bound to a person; -----
  // ----- anyone can open the app and sign in with their email + PIN.      -----
  localStorage.removeItem('ta_session');
  if(sbOn()){ try{ sbClient().auth.signOut(); }catch(e){} }
  showLogin();
})();
