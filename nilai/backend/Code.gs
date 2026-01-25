
/**
 * FG Evaluation Backend v5 (Google Apps Script)
 * - JSONP API (tanpa CORS) + POST fallback (tetap JSON response)
 * - Auth via NIK di sheet data_staff (kolom juri = TRUE)
 * - Role admin via sheet admin_users (kolom nik), optional dibuat otomatis
 * - Config editable oleh admin tersimpan di sheet app_config (config_json)
 * - Ratings dedupe: event_id + date + competition_id + team_id + criterion_id + judge_nik
 *
 * Spreadsheet ID: ganti di CONFIG.SPREADSHEET_ID
 */

const CONFIG = {
  SPREADSHEET_ID: '1COAJ2tk0KgmUNbHGAwzY4S4Y0AFQ7uLykDOkZRujLcs', // <-- ganti sesuai file Anda
  SHEETS: {
    STAFF: 'data_staff',
    ADMINS: 'admin_users',
    CONFIG: 'app_config',
    SESSIONS: 'sessions',
    RATINGS: 'ratings',
    ADJUST: 'adjustments',
    LOG: 'api_log'
  },
  SESSION_HOURS: 24,
  MAX_JSONP_CHUNK: 60 // max records per request untuk JSONP
};

function doGet(e){ return handle_(e); }
function doPost(e){ return handle_(e); }

function handle_(e){
  const t0 = Date.now();
  try{
    const p = (e && e.parameter) ? e.parameter : {};
    const action = (p.action || '').trim();
    const callback = (p.callback || '').trim();

    const body = parseBody_(e);

    const result = route_(action, p, body);

    log_(action, true, Date.now()-t0, result && result.error ? result.error : '');

    // transport=pm: kirim balik lewat postMessage (untuk fallback Chrome Mobile)
    if(String(p.transport||'') === 'pm'){
      return pm_(result, String(p.cbid||''));
    }

    if(callback){
      return jsonp_(callback, result);
    }
    return json_(result);
  }catch(err){
    const msg = (err && err.message) ? err.message : String(err);
    try{ log_((e && e.parameter && e.parameter.action) || 'unknown', false, Date.now()-t0, msg); }catch(_){}
    const out = { ok:false, error: msg };
    const cb = (e && e.parameter && e.parameter.callback) ? e.parameter.callback : '';
    if(cb) return jsonp_(cb, out);
    return json_(out);
  }
}

function route_(action, p, body){
  switch(action){
    case 'public.getConfig': return publicGetConfig_();
    case 'auth.login': return authLogin_(p, body);
    case 'auth.me': return authMe_(p);
    case 'admin.saveConfig': return adminSaveConfig_(p, body);
    case 'admin.saveConfigChunk': return adminSaveConfigChunk_(p, body);
    case 'admin.listRatings': return adminListRatings_(p);
    case 'ratings.saveBatch': return ratingsSaveBatch_(p, body);
    case 'adjustments.save': return adjustmentsSave_(p, body);
    case 'adjustments.list': return adjustmentsList_(p);
    default:
      return { ok:false, error:'Unknown action: ' + action };
  }
}

function parseBody_(e){
  try{
    if(!e || !e.postData || !e.postData.contents) return null;
    const c = e.postData.contents;
    if(!c) return null;
    // allow either JSON or x-www-form-urlencoded with payload=
    if((e.postData.type||'').indexOf('application/json')>-1){
      return JSON.parse(c);
    }
    // try parse as json anyway
    try{ return JSON.parse(c); }catch(_){}
    // parse payload param
    const m = c.match(/(?:^|&)payload=([^&]+)/);
    if(m) return JSON.parse(decodeURIComponent(m[1]));
    return null;
  }catch(err){
    return { _parseError: String(err) };
  }
}

function ss_(){ return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }

function ensureSheet_(name, headers){
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if(!sh){
    sh = ss.insertSheet(name);
  }
  if(headers && headers.length){
    const lastCol = sh.getLastColumn();
    const lastRow = sh.getLastRow();
    if(lastRow === 0){
      sh.getRange(1,1,1,headers.length).setValues([headers]);
    }else if(lastRow >= 1 && lastCol < headers.length){
      // expand header if needed
      const cur = sh.getRange(1,1,1,lastCol).getValues()[0];
      const merged = cur.slice();
      headers.forEach((h,i)=>{ merged[i]=merged[i]||h; });
      sh.getRange(1,1,1,headers.length).setValues([merged]);
    }
  }
  return sh;
}

function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function jsonp_(cb, obj){
  const safeCb = cb.replace(/[^\w.$]/g,'');
  const txt = safeCb + '(' + JSON.stringify(obj) + ');';
  return ContentService.createTextOutput(txt)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}


function pm_(obj, cbid){
  // Allow embedded in IFRAME (dibutuhkan untuk transport=pm)
  const payload = JSON.stringify(obj);
  const html =
    '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<script>(function(){' +
    'var data=' + payload + ';' +
    'try{ parent.postMessage({__fg_pm:true, cbid:' + JSON.stringify(cbid) + ', data:data}, "*"); }catch(e){}' +
    '})();</script>' +
    '</body></html>';
  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* =========================
   CONFIG
========================= */

function defaultConfig_(){
  return {
    title: 'Penilaian Family Gathering',
    event_id: 'FG',
    max_stars: 5,
    competitions: [
      {
        id:'yel-yel',
        name:'Yel-Yel',
        category:'KMP1',
        teams:[
          {id:'BNRE', name:'BNRE'},
          {id:'BSME', name:'BSME'}
        ],
        criteria:[
          {id:'k1', name:'Kekompakan', weight:20, desc:{1:'-',2:'-',3:'-',4:'-',5:'-'} }
        ]
      }
    ]
  };
}

function publicGetConfig_(){
  const sh = ensureSheet_(CONFIG.SHEETS.CONFIG, ['key','value','updated_at','updated_by']);
  const rows = sh.getDataRange().getValues();
  const map = {};
  for(let i=1;i<rows.length;i++){
    const k = String(rows[i][0]||'').trim();
    if(!k) continue;
    map[k] = rows[i][1];
  }
  let cfg = null;
  if(map.config_json){
    try{ cfg = JSON.parse(String(map.config_json)); }catch(_){ cfg = null; }
  }
  if(!cfg) cfg = defaultConfig_();

  return { ok:true, config: cfg, updated_at: map.updated_at||'', updated_by: map.updated_by||'' };
}

function adminSaveConfig_(p, body){
  const ses = requireAdmin_(p);
  let cfg = (body && body.config) ? body.config : (p.payload ? JSON.parse(decodeURIComponent(p.payload)) : null);
  if(cfg && cfg.config) cfg = cfg.config;
  if(!cfg) return { ok:false, error:'Missing config' };

  // minimal validate
  if(!cfg.title || !cfg.event_id) return { ok:false, error:'title dan event_id wajib' };
  if(!cfg.max_stars) cfg.max_stars = 5;

  const sh = ensureSheet_(CONFIG.SHEETS.CONFIG, ['key','value','updated_at','updated_by']);
  const now = new Date();
  upsertKey_(sh, 'config_json', JSON.stringify(cfg), now, ses.nik);
  upsertKey_(sh, 'updated_at', now.toISOString(), now, ses.nik);
  upsertKey_(sh, 'updated_by', ses.nik, now, ses.nik);

  return { ok:true };
}

function adminSaveConfigChunk_(p, body){
  const ses = requireAdmin_(p);
  const uploadId = String(p.upload_id || '').trim();
  const idx = Number(p.idx || 0);
  const total = Number(p.total || 0);
  if(!uploadId) return { ok:false, error:'Missing upload_id' };
  if(!total || total<1) return { ok:false, error:'Invalid total' };

  let chunk = (body && body.chunk) ? body.chunk : null;
  if(chunk===null && p.payload){
    const obj = JSON.parse(decodeURIComponent(p.payload));
    chunk = obj?.chunk ?? null;
  }
  if(chunk===null) return { ok:false, error:'Missing chunk' };

  const props = PropertiesService.getScriptProperties();
  const key = 'CFGCH_' + uploadId + '_' + idx;
  props.setProperty(key, chunk);

  // jika ini chunk terakhir, rakit dan simpan
  if(idx === total-1){
    let all = '';
    for(let i=0;i<total;i++){
      const k = 'CFGCH_' + uploadId + '_' + i;
      const part = props.getProperty(k);
      if(part===null || part===undefined) return { ok:false, error:'Chunk hilang: ' + i };
      all += part;
    }
    // bersihkan
    for(let i=0;i<total;i++){
      props.deleteProperty('CFGCH_' + uploadId + '_' + i);
    }

    // payload di sisi client adalah JSON string (mis. {"config":{...}})
    const payloadObj = JSON.parse(all);
    let cfg = payloadObj?.config ? payloadObj.config : payloadObj;
    // validasi minimal sama seperti adminSaveConfig_
    if(!cfg || !cfg.title || !cfg.event_id) return { ok:false, error:'title dan event_id wajib' };
    if(!cfg.max_stars) cfg.max_stars = 5;

    const sh = ensureSheet_(CONFIG.SHEETS.CONFIG, ['key','value','updated_at','updated_by']);
    const now = new Date();
    upsertKey_(sh, 'config_json', JSON.stringify(cfg), now, ses.nik);
    upsertKey_(sh, 'updated_at', now.toISOString(), now, ses.nik);
    upsertKey_(sh, 'updated_by', ses.nik, now, ses.nik);

    return { ok:true, uploaded:true };
  }

  return { ok:true, uploaded:false };
}


function upsertKey_(sh, key, value, now, by){
  const lr = sh.getLastRow();
  if(lr < 2){
    sh.appendRow([key, value, now.toISOString(), by]);
    return;
  }
  const range = sh.getRange(2,1,lr-1,1).getValues();
  for(let i=0;i<range.length;i++){
    if(String(range[i][0]||'')===key){
      sh.getRange(i+2,2,1,3).setValues([[value, now.toISOString(), by]]);
      return;
    }
  }
  sh.appendRow([key, value, now.toISOString(), by]);
}

/* =========================
   AUTH
========================= */

function authLogin_(p, body){
  const nik = String((p.nik || (body && body.nik) || '')).trim();
  if(!nik) return { ok:false, error:'NIK wajib' };

  const staff = getStaffByNik_(nik);
  if(!staff) return { ok:false, error:'NIK tidak ditemukan di data_staff' };
  if(String(staff.juri||'').toUpperCase() !== 'TRUE') return { ok:false, error:'NIK ini tidak punya hak sebagai juri' };

  const isAdmin = isAdminNik_(nik);

  const token = Utilities.getUuid().replace(/-/g,'');
  const exp = new Date(Date.now() + CONFIG.SESSION_HOURS*3600*1000);

  const sh = ensureSheet_(CONFIG.SHEETS.SESSIONS, ['token','nik','role','exp_iso','created_at']);
  sh.appendRow([token, nik, isAdmin ? 'admin' : 'juri', exp.toISOString(), new Date().toISOString()]);

  return { ok:true, token, exp: exp.toISOString(), profile:{
    nik: nik,
    name: staff.name || '',
    region: staff.region || '',
    unit: staff.unit || '',
    role: isAdmin ? 'admin' : 'juri'
  }};
}

function authMe_(p){
  const ses = requireSession_(p);
  return { ok:true, profile: ses };
}

function requireSession_(p){
  const token = String(p.token||'').trim();
  if(!token) throw new Error('Token kosong. Silakan login ulang.');
  const sh = ensureSheet_(CONFIG.SHEETS.SESSIONS, ['token','nik','role','exp_iso','created_at']);
  const lr = sh.getLastRow();
  if(lr < 2) throw new Error('Session tidak ditemukan');
  const data = sh.getRange(2,1,lr-1,4).getValues(); // token nik role exp
  for(let i=0;i<data.length;i++){
    if(String(data[i][0]) === token){
      const expIso = String(data[i][3]||'');
      if(expIso && new Date(expIso).getTime() < Date.now()) throw new Error('Session expired. Login ulang.');
      const nik = String(data[i][1]||'');
      const staff = getStaffByNik_(nik) || {};
      return {
        nik,
        name: staff.name||'',
        region: staff.region||'',
        unit: staff.unit||'',
        role: String(data[i][2]||'juri')
      };
    }
  }
  throw new Error('Token tidak valid');
}

function requireAdmin_(p){
  const ses = requireSession_(p);
  if(ses.role !== 'admin') throw new Error('Akses admin diperlukan');
  return ses;
}

function getStaffByNik_(nik){
  const sh = ensureSheet_(CONFIG.SHEETS.STAFF, null);
  const lr = sh.getLastRow();
  if(lr < 2) return null;
  const values = sh.getDataRange().getValues();
  const header = values[0].map(h=>String(h||'').trim().toLowerCase());
  const idx = {
    nik: header.indexOf('nik'),
    name: header.indexOf('name'),
    region: header.indexOf('region'),
    unit: header.indexOf('unit'),
    juri: header.indexOf('juri')
  };
  for(let i=1;i<values.length;i++){
    const row = values[i];
    if(String(row[idx.nik]||'').trim() === nik){
      return {
        nik,
        name: row[idx.name]||'',
        region: row[idx.region]||'',
        unit: row[idx.unit]||'',
        juri: row[idx.juri]
      };
    }
  }
  return null;
}

function isAdminNik_(nik){
  const sh = ensureSheet_(CONFIG.SHEETS.ADMINS, ['nik','name','note','created_at']);
  const lr = sh.getLastRow();
  if(lr < 2) return false;
  const data = sh.getRange(2,1,lr-1,1).getValues();
  for(let i=0;i<data.length;i++){
    if(String(data[i][0]||'').trim()===nik) return true;
  }
  return false;
}


/* =========================
   RATINGS
========================= */

function ratingsSaveBatch_(p, body){
  const ses = requireSession_(p);

  let payload = null;
  if(body && body.records) payload = body;
  else if(p.payload){
    try{ payload = JSON.parse(p.payload); }
    catch(e1){
      try{ payload = JSON.parse(decodeURIComponent(p.payload)); }catch(e2){ payload = null; }
    }
  }
  const records = payload && payload.records ? payload.records : [];
  if(!Array.isArray(records) || records.length===0) return { ok:false, error:'records kosong' };
  if(records.length > CONFIG.MAX_JSONP_CHUNK) return { ok:false, error:'Terlalu banyak records. Maks ' + CONFIG.MAX_JSONP_CHUNK };

  const sh = ensureSheet_(CONFIG.SHEETS.RATINGS, [
    'server_ts','event_id','date','judge_nik','judge_name','competition_id','competition_name','category',
    'team_id','team_name','criterion_id','criterion_name','weight','rating','comment',
    'device_id','client_id','client_ts','dedupe_key','updated_at'
  ]);

  const results = [];
  records.forEach(rec=>{
    const r = normalizeRecord_(rec, ses);
    const k = r.dedupe_key;
    const foundRow = findRowByDedupe_(sh, k);
    if(foundRow){
      // update existing
      sh.getRange(foundRow, 1, 1, 20).setValues([[
        new Date(), r.event_id, r.date, r.judge_nik, r.judge_name, r.competition_id, r.competition_name, r.category,
        r.team_id, r.team_name, r.criterion_id, r.criterion_name, r.weight, r.rating, r.comment,
        r.device_id, r.client_id, r.client_ts, r.dedupe_key, new Date()
      ]]);
      results.push({ client_id:r.client_id, status:'updated', dedupe_key:k });
    }else{
      sh.appendRow([
        new Date(), r.event_id, r.date, r.judge_nik, r.judge_name, r.competition_id, r.competition_name, r.category,
        r.team_id, r.team_name, r.criterion_id, r.criterion_name, r.weight, r.rating, r.comment,
        r.device_id, r.client_id, r.client_ts, r.dedupe_key, new Date()
      ]);
      results.push({ client_id:r.client_id, status:'inserted', dedupe_key:k });
    }
  });

  return { ok:true, saved: results.length, results };
}

function normalizeRecord_(rec, ses){
  const event_id = String(rec.event_id||'').trim();
  const date = String(rec.date||'').trim();
  const competition_id = String(rec.competition_id||'').trim();
  const team_id = String(rec.team_id||'').trim();
  const criterion_id = String(rec.criterion_id||'').trim();

  if(!event_id || !date || !competition_id || !team_id || !criterion_id) throw new Error('Record wajib berisi event_id,date,competition_id,team_id,criterion_id');

  const judge_nik = ses.nik;
  const judge_name = ses.name || String(rec.judge_name||'');
  const competition_name = String(rec.competition_name||'');
  const category = String(rec.category||'');
  const team_name = String(rec.team_name||'');
  const criterion_name = String(rec.criterion_name||'');
  const weight = Number(rec.weight||0) || 0;
  const rating = Number(rec.rating||0) || 0;
  const comment = String(rec.comment||'');
  const device_id = String(rec.device_id||'');
  const client_id = String(rec.client_id||Utilities.getUuid());
  const client_ts = String(rec.client_ts||new Date().toISOString());

  const dedupe_key = [event_id,date,competition_id,team_id,criterion_id,judge_nik].join('|');

  return { event_id,date,judge_nik,judge_name,competition_id,competition_name,category,team_id,team_name,criterion_id,criterion_name,weight,rating,comment,device_id,client_id,client_ts,dedupe_key };
}

function findRowByDedupe_(sh, key){
  const lr = sh.getLastRow();
  if(lr < 2) return 0;
  const finder = sh.getRange(2,19,lr-1,1).createTextFinder(key);
  const cell = finder.findNext();
  if(!cell) return 0;
  return cell.getRow();
}

/* =========================
   ADJUSTMENTS
========================= */

function adjustmentsSave_(p, body){
  const ses = requireAdmin_(p); // adjustment dilakukan via admin panel (kesepakatan juri)
  const adj = body && body.adjustment ? body.adjustment : null;
  if(!adj) return { ok:false, error:'Missing adjustment' };
  const event_id = String(adj.event_id||'').trim();
  const competition_id = String(adj.competition_id||'').trim();
  const team_id = String(adj.team_id||'').trim();
  const value = Number(adj.value||0) || 0;
  const note = String(adj.note||'').trim();
  if(!event_id || !competition_id || !team_id) return { ok:false, error:'event_id, competition_id, team_id wajib' };

  const sh = ensureSheet_(CONFIG.SHEETS.ADJUST, ['server_ts','event_id','competition_id','team_id','value','note','by_nik','by_name']);
  sh.appendRow([new Date(), event_id, competition_id, team_id, value, note, ses.nik, ses.name]);

  return { ok:true };
}

function adjustmentsList_(p){
  const ses = requireSession_(p);
  const sh = ensureSheet_(CONFIG.SHEETS.ADJUST, ['server_ts','event_id','competition_id','team_id','value','note','by_nik','by_name']);
  const lr = sh.getLastRow();
  if(lr < 2) return { ok:true, rows: [] };
  const data = sh.getRange(2,1,lr-1,8).getValues();
  const rows = data.map(r=>({
    server_ts: r[0], event_id:r[1], competition_id:r[2], team_id:r[3], value:r[4], note:r[5], by_nik:r[6], by_name:r[7]
  }));
  return { ok:true, rows };
}

/* =========================
   ADMIN REVIEW
========================= */

function adminListRatings_(p){
  requireAdmin_(p);
  const sh = ensureSheet_(CONFIG.SHEETS.RATINGS, null);
  const lr = sh.getLastRow();
  if(lr < 2) return { ok:true, rows: [] };
  const data = sh.getDataRange().getValues();
  const header = data[0].map(h=>String(h||'').trim());
  const rows = data.slice(1).map(r=>{
    const o = {};
    header.forEach((h,i)=>{ o[h]=r[i]; });
    return o;
  });
  return { ok:true, rows };
}

function log_(action, ok, ms, msg){
  const sh = ensureSheet_(CONFIG.SHEETS.LOG, ['ts','action','ok','ms','msg']);
  sh.appendRow([new Date(), action, ok ? 'TRUE' : 'FALSE', ms, String(msg||'').slice(0,500)]);
}
