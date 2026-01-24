/* ==========================
   FG2026 - Rundown Backend (Google Apps Script)
   Scope: hanya endpoint yang dibutuhkan untuk aplikasi Rundown Operator
   Database: 1 Spreadsheet (Google Sheets)

   Deploy as Web App:
   - Execute as: Me
   - Who has access: Anyone

   Request (frontend):
   - doPost Content-Type: application/x-www-form-urlencoded
   - Params:
     - action: string
     - payload: JSON string
     - token: (opsional) session token (untuk operator set/clear current event)
   ========================== */

const SPREADSHEET_ID = '1jwYoZfkzJIG_qkWPcx5pjqmeFfeIR_60ccdr5TbKNIY';
const APP_TZ = 'Asia/Jakarta';
const SESSION_DAYS = 7;
const SALT = 'FG2026_SALT_CHANGE_ME';

// Sheet names (minimal)
const SH = {
  events: 'events',
  current: 'current_event',
  users: 'panel_users',
  sessions: 'panel_sessions',
  logs: 'logs'
};

function doGet(){
  return ContentService
    .createTextOutput('OK - FG2026 Rundown Backend')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e){
  try{
    ensureSheets_();

    const action = String((e && e.parameter && e.parameter.action) || '').trim();
    const token  = String((e && e.parameter && e.parameter.token) || '').trim();
    const payloadStr = String((e && e.parameter && e.parameter.payload) || '{}');

    if(!action) return json_({ ok:false, error:'action required' });

    let payload = {};
    try{ payload = JSON.parse(payloadStr || '{}') || {}; }catch(err){ payload = {}; }

    const data = route_(action, payload, token);
    return json_({ ok:true, ...data });
  }catch(err){
    return json_({ ok:false, error: String(err && err.message ? err.message : err) });
  }
}

// ==========================
// Router (minimal)
// ==========================
function route_(action, p, token){
  switch(action){
    // Public (tanpa token)
    case 'public.getSchedule': return public_getSchedule_();
    case 'public.getCurrentEvent': return public_getCurrentEvent_();
    case 'public.bootstrap': return public_bootstrap_();

    // Operator/Admin (butuh token session)
    case 'operator.eventsList': return operator_any_(token, operator_eventsList_, p);
    case 'operator.setCurrentEvent': return operator_any_(token, operator_setCurrentEvent_, p);
    case 'operator.clearCurrentEvent': return operator_any_(token, operator_clearCurrentEvent_, p);

    default:
      throw new Error('Unknown action: ' + action);
  }
}

// ==========================
// Endpoints
// ==========================

// ==========================
// Cache helpers (percepat respon)
// ==========================
function getEventsCached_(){
  // cache 10 detik untuk mengurangi read Google Sheets berulang
  var cache = CacheService.getScriptCache();
  var key = 'rundown_events_v1';
  var cached = cache.get(key);
  if(cached){
    try{ return JSON.parse(cached); }catch(e){}
  }
  var rows = getAll_(SH.events);
  // simpan raw rows supaya fungsi lain bisa map sesuai kebutuhan
  try{ cache.put(key, JSON.stringify(rows), 10); }catch(e){}
  return rows;
}

function public_getSchedule_(){
  function normDate_(v){
    if(!v) return '';
    if(Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())){
      return Utilities.formatDate(v, APP_TZ, 'yyyy-MM-dd');
    }
    if(typeof v === 'number'){
      var d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return Utilities.formatDate(d, APP_TZ, 'yyyy-MM-dd');
    }
    var s = String(v).trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var d2 = new Date(s);
    if(!isNaN(d2.getTime())){
      return Utilities.formatDate(d2, APP_TZ, 'yyyy-MM-dd');
    }
    return '';
  }

  const ev = getEventsCached_().map(r => ({
      id: String(r.id || ''),
      day: Number(r.day || 0),
      date: normDate_(r.date),
      time: String(r.time || ''),
      title: String(r.title || ''),
      description: String(r.description || ''),
      location: String(r.location || ''),
      icon: String(r.icon || ''),
      color: String(r.color || 'blue'),
      sort: Number(r.sort || 0)
    }))
    .map(e => ({ ...e, day: (isFinite(e.day) && e.day >= 1) ? Math.floor(e.day) : 1 }))
    .sort((a,b)=> (a.day - b.day) || (a.sort - b.sort));

  const dailySchedules = {};
  ev.forEach(e=>{
    const key = 'day' + (Number(e.day)||1);
    if(!dailySchedules[key]){
      dailySchedules[key] = {
        date: e.date || '',
        title: e.title || '',
        icon: e.icon || 'fa-calendar',
        color: e.color || 'blue',
        events: []
      };
    }
    dailySchedules[key].events.push({
      time: e.time,
      title: e.title,
      description: e.description,
      location: e.location,
      icon: e.icon || 'fa-circle'
    });

    if(!dailySchedules[key].title && e.title) dailySchedules[key].title = e.title;
    if(dailySchedules[key].date === '' && e.date) dailySchedules[key].date = e.date;
    if((!dailySchedules[key].icon || dailySchedules[key].icon === 'fa-calendar') && e.icon) dailySchedules[key].icon = e.icon;
    if((!dailySchedules[key].color || dailySchedules[key].color === 'blue') && e.color) dailySchedules[key].color = e.color;
  });

  const sortedKeys = Object.keys(dailySchedules).sort((a,b)=>{
    const da = Number(String(a).replace('day','')) || 0;
    const db = Number(String(b).replace('day','')) || 0;
    return da - db;
  });

  const ordered = {};
  sortedKeys.forEach(k => ordered[k] = dailySchedules[k]);

  return { events: ev, dailySchedules: ordered };
}

function public_getCurrentEvent_(){
  const cur = getAll_(SH.current);
  if(!cur.length) return { event:null };

  const row = cur[0] || {};
  const id = String(row.event_id||'').trim();
  if(!id) return { event:null };

  // Jika snapshot sudah tersimpan di sheet current, pakai itu (lebih cepat)
  const snapTitle = String(row.title||'').trim();
  if(snapTitle){
    return { event:{
      id: id,
      day: Number(row.day||0),
      time: String(row.time||''),
      title: snapTitle,
      description: String(row.description||''),
      location: String(row.location||''),
      active: true
    }};
  }

  // fallback: cari dari sheet events (pakai cache)
  const ev = getEventsCached_();
  const r = ev.find(x => String(x.id)===id);
  if(!r) return { event:null };
  return { event:{
    id: String(r.id),
    day: Number(r.day||0),
    time: String(r.time||''),
    title: String(r.title||''),
    description: String(r.description||''),
    location: String(r.location||''),
    active: true
  }};
}


function public_bootstrap_(){
  // 1 call: schedule + current (lebih instan)
  const eventsRaw = getEventsCached_();
  const events = eventsRaw.map(r=>({
    id: String(r.id||''),
    day: Number(r.day||0),
    time: String(r.time||''),
    title: String(r.title||''),
    description: String(r.description||''),
    location: String(r.location||''),
    icon: String(r.icon || r.ico || ''),
    color: String(r.color || 'blue'),
    sort: Number(r.sort || 0)
  }));

  // current
  const cur = getAll_(SH.current);
  let current = null;
  if(cur.length){
    const row = cur[0] || {};
    const id = String(row.event_id||'').trim();
    if(id){
      const snapTitle = String(row.title||'').trim();
      if(snapTitle){
        current = {
          id:id,
          day:Number(row.day||0),
          time:String(row.time||''),
          title:snapTitle,
          description:String(row.description||''),
          location:String(row.location||''),
          active:true
        };
      }else{
        const r = events.find(x=>String(x.id)===id) || null;
        if(r) current = { ...r, active:true };
      }
    }
  }

  return { events: events, current: current };
}

function operator_eventsList_(p, u){
  // untuk kompatibilitas, output pakai struktur { rows: [...] }
  const rows = getAll_(SH.events).map(r=>({
    id: String(r.id||''),
    day: Number(r.day||0),
    time: String(r.time||''),
    title: String(r.title||''),
    description: String(r.description||''),
    location: String(r.location||''),
    icon: String(r.icon||''),
    color: String(r.color||'blue'),
    sort: Number(r.sort||0),
    date: r.date || ''
  })).sort((a,b)=> (a.day-b.day)||(a.sort-b.sort));
  return { rows };
}

function operator_setCurrentEvent_(p, u){
  const eventId = String(p.eventId||'').trim();
  if(!eventId) throw new Error('eventId required');

  // ambil event untuk snapshot (pakai cache)
  const ev = getEventsCached_();
  const r = ev.find(x => String(x.id) === eventId);
  if(!r) throw new Error('Event tidak ditemukan: ' + eventId);

  upsertByKey_(SH.current, 'id', {
    id:'CUR',
    event_id:eventId,
    day: Number(r.day||0),
    time: String(r.time||''),
    title: String(r.title||''),
    description: String(r.description||''),
    location: String(r.location||''),
    updated_at: nowIso_(),
    updated_by: u.username
  });

  log_('set_current_event', JSON.stringify({ event_id:eventId, by:u.username }));
  // invalidate cache quickly
  try{ CacheService.getScriptCache().remove('rundown_events_v1'); }catch(e){}
  return { ok:true, current:{
    id: String(r.id||eventId),
    day: Number(r.day||0),
    time: String(r.time||''),
    title: String(r.title||''),
    description: String(r.description||''),
    location: String(r.location||''),
    active: true
  }};
}

function operator_clearCurrentEvent_(p, u){
  // clear current event (set blank)
  upsertByKey_(SH.current, 'id', {
    id:'CUR',
    event_id:'',
    day:'',
    time:'',
    title:'',
    description:'',
    location:'',
    updated_at: nowIso_(),
    updated_by:u.username
  });
  log_('clear_current_event', JSON.stringify({ by:u.username }));
  return { ok:true };
}

// ==========================
// Session / Auth helpers (minimal)
// ==========================
function operator_any_(token, fn, payload){
  const u = sessionRequire_(token);
  if(u.role !== 'ADMIN' && u.role !== 'OPERATOR') throw new Error('Forbidden: operator role required');
  return fn(payload, u);
}

function sessionRequire_(token){
  token = String(token||'').trim();
  if(!token) throw new Error('Unauthorized: token required');
  const rows = getAll_(SH.sessions);
  const r = rows.find(x => String(x.token||'') === token);
  if(!r) throw new Error('Unauthorized: invalid token');
  const exp = r.expires_at ? new Date(r.expires_at) : null;
  if(exp && !isNaN(exp.getTime()) && exp.getTime() < Date.now()){
    throw new Error('Unauthorized: session expired');
  }
  return { username:String(r.username||''), role:String(r.role||'') };
}

// ==========================
// Sheet utils
// ==========================
function ss_(){
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}
function sh_(name){
  const s = ss_();
  const sh = s.getSheetByName(name);
  if(!sh) throw new Error('Sheet not found: ' + name);
  return sh;
}

function ensureSheets_(){
  const s = ss_();

  ensureSheet_(s, SH.events, ['id','day','date','time','title','description','location','icon','color','sort']);
  ensureSheet_(s, SH.current, ['id','event_id','updated_at','updated_by']);
  ensureSheet_(s, SH.users, ['username','password_hash','role','created_at']);
  ensureSheet_(s, SH.sessions, ['token','username','role','created_at','expires_at']);
  ensureSheet_(s, SH.logs, ['ts','action','detail']);
}

// ensureSheet_ diambil dari pola backend utama agar kompatibel dengan sheet existing
function ensureSheet_(ss, name, headers){
  let sh = ss.getSheetByName(name);
  if(!sh){
    sh = ss.insertSheet(name);
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    return sh;
  }
  const lastCol = sh.getLastColumn();
  const cur = lastCol ? sh.getRange(1,1,1,lastCol).getValues()[0].map(String) : [];
  // Jika header kosong, tulis header
  if(cur.join('').trim()===''){
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    return sh;
  }
  // Jika kolom kurang, tambahkan header yang hilang (tanpa mengubah data)
  const missing = headers.filter(h => cur.indexOf(h) < 0);
  if(missing.length){
    const newHeaders = cur.concat(missing);
    sh.getRange(1,1,1,newHeaders.length).setValues([newHeaders]);
  }
  return sh;
}

function getAll_(sheetName){
  const sh = sh_(sheetName);
  const data = sh.getDataRange().getValues();
  if(data.length < 2) return [];
  const headers = data[0].map(String);
  const out = [];
  for(let i=1;i<data.length;i++){
    const row = data[i];
    if(row.join('').trim()==='') continue;
    const o = {};
    headers.forEach((h,idx)=>o[h]=row[idx]);
    out.push(o);
  }
  return out;
}

function upsertByKey_(sheetName, keyField, obj){
  const sh = sh_(sheetName);
  const data = sh.getDataRange().getValues();
  if(data.length < 1) throw new Error('Sheet empty: ' + sheetName);

  const headers = data[0].map(String);
  const keyIdx = headers.indexOf(keyField);
  if(keyIdx < 0) throw new Error('Key header not found: ' + keyField);

  const keyVal = String(obj[keyField]||'');
  if(!keyVal) throw new Error('Key value required: ' + keyField);

  let rowIndex = -1;
  for(let i=1;i<data.length;i++){
    if(String(data[i][keyIdx]||'') === keyVal){ rowIndex = i+1; break; } // 1-based
  }

  const row = headers.map(h => (obj[h] !== undefined ? obj[h] : (rowIndex>0 ? sh.getRange(rowIndex, headers.indexOf(h)+1).getValue() : '')));
  if(rowIndex > 0){
    sh.getRange(rowIndex,1,1,headers.length).setValues([row]);
  }else{
    sh.appendRow(row);
  }
}

function nowIso_(){
  return Utilities.formatDate(new Date(), APP_TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

function log_(action, detail){
  try{
    sh_(SH.logs).appendRow([nowIso_(), String(action||''), String(detail||'')]);
  }catch(err){}
}

function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
