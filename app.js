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

/* ---------------- PIN / login / access ---------------- */
const getPin = email => (LS.get('ta_pins', {})[email]) || '1234';
const setPin = (email, pin) => { const m = LS.get('ta_pins', {}); m[email] = pin; LS.set('ta_pins', m); };
const pinIsSet = email => !!LS.get('ta_pinset', {})[email];
const markPinSet = email => { const m=LS.get('ta_pinset',{}); m[email]=true; LS.set('ta_pinset',m); };
const clearPinSet = email => { const m=LS.get('ta_pinset',{}); delete m[email]; LS.set('ta_pinset',m); };
const isBlocked = email => (LS.get('ta_blocked', [])||[]).includes(email);

function showLogin(){
  $('#emailList').innerHTML = DB.profiles.map(p=>`<option value="${esc(p.email)}">`).join('');
  $('#loginMsg').classList.remove('err');
  $('#loginMsg').innerHTML='First time? Your default PIN is <b>1234</b> — you will be asked to set your own.';
  $('#loginView').classList.add('open');
}
let pendingLoginEmail=null;
function doLogin(){
  const email=$('#loginEmail').value.trim().toLowerCase();
  const pin=$('#loginPin').value.trim();
  const prof=DB.profiles.find(p=>p.email.toLowerCase()===email);
  if(!prof){ loginErr('No profile found for that email.'); return; }
  if(isBlocked(prof.email)){ loginErr('This account has been blocked. Please contact the admin.'); return; }
  if(pin!==getPin(prof.email)){ loginErr('Incorrect PIN. (Default is 1234)'); return; }
  if(!pinIsSet(prof.email)){ pendingLoginEmail=prof.email; showPinModal(); return; }  // first-time: force new PIN
  finishLogin(prof.email);
}
function finishLogin(email){
  DB.active=email; localStorage.setItem('ta_session',email);
  $('#loginView').classList.remove('open'); $('#loginPin').value='';
  renderHeader(); go('home'); toast('Welcome, '+(DB.p?.name||''));
}
function loginErr(m){ const el=$('#loginMsg'); el.textContent=m; el.classList.add('err'); }
function showPinModal(){ $('#pinNew1').value=''; $('#pinNew2').value=''; $('#pinMsg').textContent=''; $('#pinModal').classList.add('open'); }

/* ---------------- date / time helpers ---------------- */
const todayISO = () => new Date().toISOString().slice(0, 10);
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

  // --- next date: MAX(To_Date) over ALL entries (any category) + 1 if last row completed ---
  const allList = sortEntries(DB.e);
  const lastAll = allList[allList.length - 1];
  const lastAllCompleted = !lastAll || lastAll.completed === 'Yes';
  let fromDate = todayISO();
  if (lastAll){
    const maxTo = allList.reduce((mx,e)=>{ const d=e.toDate||e.fromDate||''; return d>mx?d:mx; }, '');
    fromDate = lastAllCompleted ? addDays(maxTo,1) : maxTo;
  }

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
function renderHeader(){
  const p=DB.p;
  const admin = DB.active===ADMIN;
  $('#avatar').textContent = initials(p?.name);
  $('#userName').textContent = p?.name || 'TA Diary';
  $('#userDesg').textContent = p ? ((p.desg||'Officer') + (admin?' ▾':'')) : 'Not signed in';
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
    if(confirm('Delete this entry?')){ DB.allE=DB.allE.filter(e=>e.id!==b.dataset.del); toast('Entry deleted'); renderHome(); }
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
  $('#fMode').value=''; $('#fDays').value=''; delete $('#fDays').dataset.touched; $('#fLeaveType').value='Leave (CL)';
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
}
$$('#todayWork button').forEach(b=>b.onclick=()=>setToday(b.dataset.v));

function updateDaysVisibility(){
  const show = isField(curToday) && $('#fCompleted').value==='Yes';
  $('#wrapDays').style.display = show ? 'block' : 'none';
}
function updateModeFare(){
  const m=$('#fMode').value.trim().toLowerCase();
  $('#wrapFare').style.display = (m==='bike'||m==='walk') ? 'none' : 'block';   // bike uses mileage, no fare
}
$('#fMode').addEventListener('input',()=>{ updateModeFare(); autofillDF(); });
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
    if(!$('#fMode').value && rev.mode){ $('#fMode').value=rev.mode; updateModeFare(); }
    $('#dfHint').textContent = `↺ same-day return: ${rev.distance||0}km${rev.fare?(' ₹'+rev.fare):''}`;
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
  if(!$('#fMode').value && r.mode){ $('#fMode').value=r.mode; updateModeFare(); }
  $('#dfHint').textContent = `↺ ${r.distance||0}km${r.fare?(' ₹'+r.fare):''}`;
}
['#fOfficeFrom','#fOfficeTo'].forEach(s=>$(s).addEventListener('input',()=>{ updateComplete(); autofillDF(); }));

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
  }
  const {days,hrs,maxDist}=computeDAauto();
  if($('#fCompleted').value==='Yes' && !editingId && !$('#fDays').dataset.touched){ $('#fDays').value=days||''; }
  $('#daHint').textContent = hrs>0 ? `(${hrs.toFixed(1)}h, max ${maxDist}km ⇒ ${days})` : '';
  $('#completeHint').textContent = ($('#fCompleted').value==='Yes')
    ? '✅ Trip completed — DA auto-calculated (>8km & hours away). Editable.'
    : 'Mark "Yes" only on the leg where you return to HQ.';
}
$('#fDays').addEventListener('input',()=>{ $('#fDays').dataset.touched='1'; });
['#fFromTime','#fToTime','#fFromDate','#fToDate'].forEach(s=>$(s).addEventListener('input',updateComplete));

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
  $('#fMode').value=e.mode||''; $('#fDistance').value=e.distance||'';
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
  if(editingId && confirm('Delete this entry?')){ DB.allE=DB.allE.filter(e=>e.id!==editingId); editingId=null; toast('Entry deleted'); go('home'); }
};

$('#btnSaveEntry').onclick=()=>{
  if(!DB.p){ toast('Set up a Profile first'); go('profile'); return; }
  const ctx=computeContext();
  const leave=isLeave(curToday), holiday=curToday==='Holiday', office=isOffice(curToday);
  const leaveTypeVal = $('#fLeaveType').value.trim() || 'Leave';
  const today = leave ? 'Leave' : curToday;   // canonical category; custom label kept in leaveType
  const mode = office ? '' : $('#fMode').value.trim();
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
    days: (holiday||leave||office)?0:(completedVal==='Yes'?(+$('#fDays').value||0):0),
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
  toast(editingId?'Entry updated ✓':'Entry saved ✓'); editingId=null; go('home');
};
$('#btnCancelEntry').onclick=()=>{ editingId=null; go('home'); };

function buildOfficeDatalist(){
  const recent = sortEntries(DB.e).reverse();               // newest first
  const uniq = arr => [...new Set(arr.filter(Boolean).map(x=>x.toString().trim()).filter(Boolean))];
  const offices = uniq([].concat(...recent.map(e=>[e.officeTo, e.officeFrom])));
  if(DB.p?.parent && !offices.includes(DB.p.parent)) offices.push(DB.p.parent);
  $('#officeList').innerHTML = offices.map(o=>`<option value="${esc(o)}">`).join('');

  const std=['Bike','Bus','Train','Auto','Jeep','Car','Walk','Other'];
  const usedModes = uniq(recent.map(e=>e.mode));
  const modes = usedModes.concat(std.filter(m=>!usedModes.some(u=>u.toLowerCase()===m.toLowerCase())));
  $('#modeList').innerHTML = modes.map(m=>`<option value="${esc(m)}">`).join('');

  // suggestions from THIS user's previously saved entries (recent first)
  const dl=$('#shortList'), tl=$('#taShortList'), ds=$('#diaryDetailSug');
  if(dl) dl.innerHTML = uniq(recent.map(e=>e.diaryShort)).slice(0,50).map(s=>`<option value="${esc(s)}">`).join('');
  if(tl) tl.innerHTML = uniq(recent.map(e=>e.taShort)).slice(0,50).map(s=>`<option value="${esc(s)}">`).join('');
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
  DB.saveProfile(p); renderHeader(); toast('Profile saved ✓'); go('home');
};

/* =========================================================
   REPORTS
   ========================================================= */
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
['#rpAdvance','#rpHotel','#rpFrom','#rpTo'].forEach(s=>$(s).addEventListener('input',renderReportSummary));

function renderReportSummary(){
  const {from,to}=getRange(); const t=taOf(entriesInRange(), DB.p);
  const advance=+$('#rpAdvance').value||0, hotel=+$('#rpHotel').value||0;
  const gross=t.amount+hotel, net=gross-advance;
  const label=(from||to)?`${fmtDate(from)||'…'} – ${fmtDate(to)||'…'}`:'All dates';
  $('#reportSummary').innerHTML=`
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
  if(r==='ta') openSheet('TA Bill (Tour)', docTA());
  if(r==='diary') openSheet('Tour Diary', docDiary());
  if(r==='visit') go('visit');
});

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
  const advance=+$('#rpAdvance').value||0;
  const hotel=+$('#rpHotel').value||0;
  const gross=t.amount+hotel;
  const net=gross-advance;
  const rows=es.map(e=>`<tr>
    <td class="dtcell">${fmtDate(e.fromDate)}<br>${fmtTime24(e.fromTime)}–${fmtTime24(e.toTime)}</td>
    <td>${esc(e.officeFrom)}</td>
    <td>${esc(e.officeTo)}</td>
    <td class="center">${esc(e.mode)}</td>
    <td class="num">${(+e.distance||0)?(+e.distance).toFixed(2):''}</td>
    <td class="num">${(+e.fare||0)?(+e.fare).toFixed(2):''}</td>
    <td class="center">${(+e.days||0)?(+e.days).toFixed(2):''}</td>
    <td>${esc(e.taShort||e.diaryShort||e.purpose)}</td></tr>`).join('') || `<tr><td colspan="8" class="center muted">No journeys in this period</td></tr>`;
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
      <colgroup><col style="width:14%"><col style="width:17%"><col style="width:17%"><col style="width:8%">
        <col style="width:8%"><col style="width:8%"><col style="width:6%"><col style="width:22%"></colgroup>
      <thead>
        <tr><th>-1</th><th>-2</th><th>-3</th><th>-4</th><th>-5</th><th>-6</th><th>-7</th><th>-8</th></tr>
        <tr><th>Date &amp; Time</th><th>From Office/Place</th><th>To Office/Place</th>
            <th>Mode</th><th>Dist (Km)</th><th>Fare (Rs)</th><th>Days</th><th>Purpose of Journey</th></tr>
      </thead>
      <tbody>${rows}
        <tr class="tot"><td class="right" colspan="4">Total ${t.bikeDist.toFixed(0)} Kms by Bike</td>
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
      <tr><td>Hotel Rent / Staying Charges</td><td class="num">${hotel.toFixed(2)}</td></tr>
      <tr class="tot"><td>Gross Total</td><td class="num">${gross.toFixed(2)}</td></tr>
      <tr><td>Less: Advance Received</td><td class="num">${advance.toFixed(2)}</td></tr>
      <tr class="tot"><td><b>Net Payable</b></td><td class="num"><b>${net.toFixed(2)}</b></td></tr>
      </tbody>
    </table>
    <div class="kv" style="margin-top:6px"><b>RS. ${net.toFixed(2)} /-</b> ( ${esc(words)} Only )</div>
    <div class="kv small">Amount of Advance of Travelling Allowances, if any, Drawn — Rs. ${advance>0?advance.toFixed(2):'Nil'}/-</div>
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

  const page2=`<div class="doc">
    <div style="font-weight:700">PART-B (To be filled in the Bill Section)</div>
    <p class="small">The net entitlement on account of travelling allowance works out to Rs. ____________________ as detailed below :-</p>
    <div class="kv small">(a) Railways / air / bus / steamer fare : Rs. ______________________</div>
    <div class="kv small">(b) Road mileage for ______________ Kms. @ Rs. ____________ per km.</div>
    <div class="kv small">(c) Daily allowance</div>
    <div class="kv small" style="padding-left:20px">(i) ____________ day @ Rs. ____________ per day.</div>
    <div class="kv small" style="padding-left:20px">(ii) ____________ day @ Rs. ____________ per day.</div>
    <div class="kv small">(d) Actual expenses &nbsp; Rs. ____________________</div>
    <div class="kv small right">Gross Amount &nbsp; Rs. ____________________</div>
    <div class="kv small">(e) Less amount of T.A. advance, if any, drawn vide voucher No.______ date ______ Rs. ______</div>
    <div class="kv small right">Net amount &nbsp; Rs. ____________________</div>
    <p class="small">The expenditure is debitable to ____________________</p>
    <div class="sign"><span>Initials of Bill Clerk</span><span>Signature of D.D.O.</span></div>
    <div class="sign"><span>Counter signed</span><span>Signature of Controlling Officer</span></div>
  </div>`;

  const foodFrom = es.length? fmtDate(es[0].fromDate):periodLabel();
  const foodTo   = es.length? fmtDate(es[es.length-1].toDate||es[es.length-1].fromDate):'';
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
    <div style="margin-top:26px"><b>${esc(p.name)}</b><br>${esc(p.desg)}</div>
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
$('#vOffice').addEventListener('input',()=>{ const pin=officePin($('#vOffice').value); if(pin) $('#vPincode').value=pin; });
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
  $$('#visitList [data-vdel]').forEach(b=>b.onclick=()=>{ if(confirm('Delete this visit report?')){ DB.allV=DB.allV.filter(x=>x.id!==b.dataset.vdel); renderVisits(); toast('Deleted'); } });
}
$('#btnSaveVisit').onclick=()=>{
  if(!DB.p){ toast('Select an officer first'); return; }
  const v={ id:uid(), email:DB.active, date:$('#vDate').value||todayISO(),
    office:$('#vOffice').value.trim(), pincode:$('#vPincode').value.trim(), ref:$('#vRef').value.trim(),
    aptDtr:$('#vAptDtr').value.trim(), boBal:$('#vBoBal').value.trim(), disc:$('#vDisc').value.trim(),
    purpose:$('#vPurpose').value.trim(), result:$('#vResult').value.trim(),
    hw:getHW().map((_,i)=>$(`[data-vf="hw${i}"]`)?.value||''), sw:getSW().map((_,i)=>$(`[data-vf="sw${i}"]`)?.value||'') };
  if(!v.office){ toast('Enter office name'); return; }
  const arr=DB.allV; arr.push(v); DB.allV=arr;
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
$('#sheetPrint').onclick=()=>window.print();

$('#btnMenu').onclick=()=>$('#menuModal').classList.add('open');
$('#miClose').onclick=()=>$('#menuModal').classList.remove('open');

/* ---- Settings (font + PIN + admin) ---- */
function applyFont(){
  const s=LS.get('ta_settings',{font:"'Times New Roman', serif",size:'12px'});
  document.documentElement.style.setProperty('--doc-font',s.font);
  document.documentElement.style.setProperty('--doc-size',s.size);
  return s;
}
function openSettings(){
  const s=applyFont();
  $('#setFont').value=s.font; $('#setFontSize').value=s.size; $('#setNewPin').value='';
  const admin=DB.active===ADMIN;
  $('#adminSettings').style.display = admin?'block':'none';
  if(admin) renderAdminSettings();
  $('#menuModal').classList.remove('open'); $('#settingsModal').classList.add('open');
}
$('#miSettings').onclick=openSettings;
$('#settingsClose').onclick=()=>$('#settingsModal').classList.remove('open');
function saveFont(){
  const s={font:$('#setFont').value,size:$('#setFontSize').value};
  LS.set('ta_settings',s); applyFont(); toast('Font updated');
}
$('#setFont').onchange=saveFont;
$('#setFontSize').onchange=saveFont;
$('#setSavePin').onclick=()=>{
  const pin=$('#setNewPin').value.trim();
  if(!/^\d{4,8}$/.test(pin)){ toast('PIN must be 4–8 digits'); return; }
  setPin(DB.active,pin); markPinSet(DB.active); $('#setNewPin').value=''; toast('PIN updated ✓');
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
      <span><b>${esc(p.name)}</b><br><span class="ur-desg">${esc(p.email)}${blocked.includes(p.email)?' · BLOCKED':''}</span></span>
      <span class="au-actions">
        <button class="mini" data-block="${esc(p.email)}">${blocked.includes(p.email)?'Unblock':'Block'}</button>
        <button class="mini del" data-remove="${esc(p.email)}">Remove</button>
      </span></div>`).join('') || '<span class="hint">No other users.</span>';
  $$('#adminUsers [data-block]').forEach(b=>b.onclick=()=>toggleBlock(b.dataset.block));
  $$('#adminUsers [data-remove]').forEach(b=>b.onclick=()=>removeUser(b.dataset.remove));
}
$('#setAddHw').onclick=()=>{ const v=$('#setNewHw').value.trim(); if(!v)return; const a=LS.get('ta_hw_extra',[]); a.push(v); LS.set('ta_hw_extra',a); $('#setNewHw').value=''; renderAdminSettings(); buildVisitControls(); toast('Hardware module added'); };
$('#setAddSw').onclick=()=>{ const v=$('#setNewSw').value.trim(); if(!v)return; const a=LS.get('ta_sw_extra',[]); a.push(v); LS.set('ta_sw_extra',a); $('#setNewSw').value=''; renderAdminSettings(); buildVisitControls(); toast('Software module added'); };
$('#setResetPin').onclick=()=>{ const em=$('#setResetUser').value; if(!em)return; setPin(em,'1234'); clearPinSet(em); toast('PIN reset to 1234 (user must set new on next login)'); };
function toggleBlock(email){ const a=LS.get('ta_blocked',[]); const i=a.indexOf(email); if(i>=0)a.splice(i,1); else a.push(email); LS.set('ta_blocked',a); renderAdminSettings(); toast('User '+(i>=0?'unblocked':'blocked')); }
function removeUser(email){
  const prof=DB.profiles.find(p=>p.email===email);
  if(!confirm(`Remove ${prof?.name||email} and ALL their entries & visit reports? This cannot be undone.`)) return;
  DB.profiles=DB.profiles.filter(p=>p.email!==email);
  DB.allE=DB.allE.filter(e=>e.email!==email);
  DB.allV=DB.allV.filter(v=>v.email!==email);
  LS.set('ta_blocked',LS.get('ta_blocked',[]).filter(x=>x!==email));
  const pm=LS.get('ta_pins',{}); delete pm[email]; LS.set('ta_pins',pm);
  clearPinSet(email);
  renderAdminSettings(); toast('User removed');
}

/* ---- First-time / forced PIN change ---- */
$('#pinSave').onclick=()=>{
  const a=$('#pinNew1').value.trim(), b=$('#pinNew2').value.trim();
  if(!/^\d{4,8}$/.test(a)){ $('#pinMsg').textContent='PIN must be 4–8 digits.'; return; }
  if(a!==b){ $('#pinMsg').textContent='The two PINs do not match.'; return; }
  const email=pendingLoginEmail || DB.active;
  setPin(email,a); markPinSet(email);
  $('#pinModal').classList.remove('open');
  if(pendingLoginEmail){ const em=pendingLoginEmail; pendingLoginEmail=null; finishLogin(em); }
  toast('PIN set ✓');
};

/* ---- Word export ---- */
$('#sheetWord').onclick=()=>{
  const title=$('#sheetTitle').textContent||'report';
  const html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">'
    +'<head><meta charset="utf-8"><style>'
    +'body{font-family:'+getComputedStyle(document.documentElement).getPropertyValue('--doc-font')+';}'
    +'table{border-collapse:collapse;width:100%}td,th{border:1px solid #000;padding:4px 6px;font-size:11px;vertical-align:top}'
    +'h1{font-size:15px;text-align:center}h2{font-size:13px;text-align:center}.right{text-align:right}.center{text-align:center}.num{text-align:right}'
    +'.sign{display:flex;justify-content:space-between;margin-top:30px}</style></head><body>'
    + $('#sheetBody').innerHTML + '</body></html>';
  const blob=new Blob(['﻿'+html],{type:'application/msword'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=title.replace(/[^\w]+/g,'_')+'.doc'; a.click(); toast('Word file downloaded');
};

/* ---- OCR (Diary detail text) ---- */
function ensureTesseract(){ return new Promise((res,rej)=>{ if(window.Tesseract) return res();
  const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
$('#ocrBtn').onclick=()=>$('#ocrFile').click();
$('#ocrFile').onchange=async(ev)=>{
  const f=ev.target.files[0]; if(!f) return; const st=$('#ocrStatus');
  st.textContent='Loading OCR engine…';
  try{
    await ensureTesseract();
    st.textContent='Scanning… 0%';
    const {data}=await Tesseract.recognize(f,'eng',{logger:m=>{ if(m.status==='recognizing text') st.textContent='Scanning… '+Math.round(m.progress*100)+'%'; }});
    const txt=(data.text||'').replace(/\n{2,}/g,'\n').trim();
    const box=$('#fDiaryDetail'); box.value=(box.value?box.value+'\n':'')+txt;
    st.textContent='✓ Added text from image ('+txt.length+' chars)';
  }catch(e){ st.textContent='⚠ OCR needs internet to load the first time. Please connect and retry.'; }
  ev.target.value='';
};

/* ---- Login ---- */
$('#loginBtn').onclick=doLogin;
$('#loginPin').addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });
$('#forgotPin').onclick=()=>{
  const email=$('#loginEmail').value.trim().toLowerCase();
  const prof=DB.profiles.find(p=>p.email.toLowerCase()===email);
  if(!prof){ loginErr('Type your email above first, then tap “Forgot PIN?”.'); return; }
  if(isBlocked(prof.email)){ loginErr('This account is blocked. Contact the admin.'); return; }
  if(!confirm('Reset the PIN for '+prof.email+' back to 1234 on this device?')) return;
  setPin(prof.email,'1234'); clearPinSet(prof.email);
  const el=$('#loginMsg'); el.classList.remove('err');
  el.innerHTML='PIN reset to <b>1234</b>. Sign in — you will set a new PIN.';
  $('#loginPin').value='1234'; $('#loginPin').focus();
};
$('#miExport').onclick=()=>{
  const data={profiles:DB.profiles,active:DB.active,entries:DB.allE,visits:DB.allV,exported:new Date().toISOString()};
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.download=`ta-diary-backup-${todayISO()}.json`; a.click(); toast('Backup downloaded');
};
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

  // login gate
  const session=localStorage.getItem('ta_session');
  const valid = session && DB.profiles.some(p=>p.email===session) && !isBlocked(session) && pinIsSet(session);
  if(valid){ DB.active=session; renderHeader(); renderHome(); }
  else { localStorage.removeItem('ta_session'); showLogin(); renderHeader(); renderHome(); }
})();
