/** FG2026 - Timer Backend (Google Apps Script)
 *  Database: Google Sheet ID: 1jwYoZfkzJIG_qkWPcx5pjqmeFfeIR_60ccdr5TbKNIY
 *  Sheets:
 *   - events: header = id,day,date,time,title,description,location,icon,color,sort
 *   - current_event: header = id,event_id,updated_at,updated_by
 *
 *  Public read-only endpoint:
 *    /exec?action=timer.get
 *  Optional JSONP:
 *    /exec?action=timer.get&callback=yourFunc
 */
const SHEET_ID = '1jwYoZfkzJIG_qkWPcx5pjqmeFfeIR_60ccdr5TbKNIY';

function doGet(e){
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || '').trim() || 'timer.get';

  let payload;
  try{
    if(action === 'timer.get'){
      payload = timerGet_();
    } else if(action === 'events.list'){
      payload = { ok:true, events: readEvents_() };
    } else if(action === 'current.get'){
      payload = { ok:true, current: readCurrent_() };
    } else {
      payload = { ok:false, error:'Unknown action' };
    } 
  }catch(err){
    payload = { ok:false, error: String(err && err.message ? err.message : err) };
  }

  return output_(payload, params.callback);
}

/** Build the response used by the standalone timer */
function timerGet_(){
  const eventsRaw = readEvents_();     // raw dari sheet events
  const current = readCurrent_();      // row current_event
  const config  = readConfig_();       // CFG json dari app_confiq/app_config

  // Index events by id
  const byId = {};
  eventsRaw.forEach(r => { if(r && r.id) byId[String(r.id)] = r; });

  // Attach title + minutes to current
  if(current && current.event_id){
    const ev = byId[String(current.event_id)];
    if(ev){
      current.title = String(ev.title || '');
      current.minutes = parseDurationMinutes_(ev.time || '');
      current.sort = ev.sort ?? '';
    }else{
      current.title = '';
      current.minutes = 0;
      current.sort = '';
    }
  }

  // Normalize events untuk frontend (format konsisten: {id,name,minutes,sort})
  const eventsNormalized = eventsRaw
    .slice()
    .sort((a,b)=> (Number(a.sort)||0) - (Number(b.sort)||0))
    .map(ev => ({
      id: String(ev.id || ''),
      name: String(ev.title || ''),
      minutes: parseDurationMinutes_(ev.time || ''),
      sort: ev.sort ?? ''
    }))
    .filter(x => x.id && x.name);

    // Compute upcoming (exclude current).
  // Jika sort valid -> ambil sort > currentSort
  // Jika sort tidak valid (kosong/0 semua) -> fallback exclude current saja
  const curId = current && current.event_id ? String(current.event_id).trim() : '';

  // cek apakah sort benar-benar berguna (ada minimal 1 angka > 0)
  const hasMeaningfulSort = eventsNormalized.some(x => Number(x.sort) > 0);

  let curSort = null;
  if(curId && hasMeaningfulSort){
    const found = eventsNormalized.find(x => x.id === curId);
    if(found) curSort = Number(found.sort) || 0;
  }

  const upcoming = eventsNormalized.filter(x=>{
    if(curId && x.id === curId) return false;
    if(curSort !== null) return (Number(x.sort) || 0) > curSort;
    return true; // fallback: sort tidak dipakai -> tampilkan semua kecuali current
  }).map(x=>({ id:x.id, name:x.name, minutes:x.minutes }));

  return {
    ok:true,
    server_time: new Date().toISOString(),
    config,
    events: eventsNormalized,   // untuk dropdown timer (format konsisten)
    upcoming,                  // untuk panel Upcoming (sudah difilter)
    current                    // current (sudah title + minutes)
  };
}

function readEvents_(){
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName('events');
  if(!sh) throw new Error('Sheet "events" not found');

  const values = sh.getDataRange().getValues();
  if(values.length < 2) return [];

  const headers = values[0].map(String);
  const rows = values.slice(1).filter(r => r.join('').trim() !== '');

  return rows.map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i]);
    // normalize (Apps Script sometimes returns Date objects)
    if(o.updated_at instanceof Date) o.updated_at = Utilities.formatDate(o.updated_at, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    return o;
  });
}

function readCurrent_(){
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName('current_event');
  if(!sh) throw new Error('Sheet "current_event" not found');

  const values = sh.getDataRange().getValues();
  if(values.length < 2) return null;

  const headers = values[0].map(h => String(h).trim());
  const rows = values.slice(1).filter(r => (r || []).join('').trim() !== '');
  if(rows.length === 0) return null;

  const idIdx = headers.indexOf('id');

  // prefer row dengan id = CUR (kalau kolom id ada)
  let row = null;
  if(idIdx >= 0){
    row = rows.find(r => String(r[idIdx] || '').trim() === 'CUR') || null;
  }
  // fallback: ambil baris terakhir non-kosong
  if(!row) row = rows[rows.length - 1];

  const o = {};
  headers.forEach((h, i) => o[h] = row[i]);

  // normalize updated_at as string
  if(o.updated_at instanceof Date){
    o.updated_at = Utilities.formatDate(o.updated_at, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  } else {
    o.updated_at = String(o.updated_at || '').trim();
  }

  // normalize event_id
  o.event_id = String(o.event_id || '').trim();

  return o;
}

/** Parse "17:00 - 18:30" => 90 minutes */
function parseDurationMinutes_(timeRange){
  const s = String(timeRange || '').trim();
  // dukung "16:00 - 16:30" / "16.00 - 16.30" / dash "–"
  const m = s.match(/(\d{1,2})[:\.](\d{2})\s*[-–]\s*(\d{1,2})[:\.](\d{2})/);
  if(!m) return 0;

  const sh = Number(m[1]), sm = Number(m[2]), eh = Number(m[3]), em = Number(m[4]);
  if([sh,sm,eh,em].some(x => isNaN(x))) return 0;

  let start = sh*60 + sm;
  let end   = eh*60 + em;
  if(end < start) end += 24*60; // jaga-jaga kalau lewat tengah malam
  return Math.max(0, end - start);
}


function readConfig_(){
  const ss = SpreadsheetApp.openById(SHEET_ID);
  // Nama sheet mengikuti permintaan user: "app_confiq"
  const sh = ss.getSheetByName('app_confiq') || ss.getSheetByName('app_config');
  if(!sh) return null;

  const values = sh.getDataRange().getValues();
  if(values.length < 2) return null;

  const headers = values[0].map(String);
  const keyIdx = headers.indexOf('key');
  const valIdx = headers.indexOf('value_json');

  if(keyIdx < 0 || valIdx < 0) return null;

  const rows = values.slice(1).filter(r => r.join('').trim() !== '');
  const row = rows.find(r => String(r[keyIdx]||'') === 'CFG') || rows[rows.length-1];
  if(!row) return null;

  const raw = row[valIdx];
  if(raw == null || raw === '') return null;

  try{
    const obj = (typeof raw === 'string') ? JSON.parse(raw) : raw;
    return obj;
  }catch(err){
    // kalau JSON invalid, kirim string saja agar frontend bisa handle
    return String(raw);
  }
}


function output_(obj, callback){
  const json = JSON.stringify(obj);
  if(callback){
    const cb = String(callback).replace(/[^\w$.]/g,''); // basic sanitize
    return ContentService
      .createTextOutput(`${cb}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
