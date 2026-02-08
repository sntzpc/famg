const CONFIG = {
  SPREADSHEET_ID: '1COAJ2tk0KgmUNbHGAwzY4S4Y0AFQ7uLykDOkZRujLcs', // <-- ganti sesuai file Anda
  SHEETS: {
    STAFF: 'data_staff',
    ADMINS: 'admin_users',
    CONFIG: 'app_config',
    SESSIONS: 'sessions',
    RATINGS: 'ratings',
    ADJUST: 'adjustments',
    LOG: 'api_log',
    OTP: 'otp',
    OTP_REQ: 'otp_requests'
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
    case 'admin.createOtp': return adminCreateOtp_(p, body);
    case 'otp.verify': return otpVerify_(p, body);
    case 'otp.request': return otpRequest_(p, body);
    case 'otp.requests.list': return otpRequestsList_(p);
    case 'otp.request.approve': return otpRequestApprove_(p, body);
    case 'otp.my': return otpMy_(p);
    case 'ratings.listMine': return ratingsListMine_(p);
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
    if(m) return JSON.parse(decodeURIComponent(String(m[1]).replace(/\+/g, "%20")));
    return null;
  }catch(err){
    return { _parseError: String(err) };
  }
}

function tryParsePayload_(s){
  if(!s) return null;
  const str = String(s);
  // 1) coba langsung (kadang e.parameter sudah ter-decode)
  try{ return JSON.parse(str); }catch(_){ }
  // 2) coba decodeURIComponent biasa
  try{ return JSON.parse(decodeURIComponent(str)); }catch(_){ }
  // 3) handle + sebagai spasi (x-www-form-urlencoded)
  try{ return JSON.parse(decodeURIComponent(str.replace(/\+/g, "%20"))); }catch(_){ }
  return null;
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
  let cfg = (body && body.config) ? body.config : (p.payload ? tryParsePayload_(p.payload) : null);
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
    const obj = tryParsePayload_(p.payload);
    chunk = (obj && obj.chunk !== undefined) ? obj.chunk : null;
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

  // OTP meta (untuk unlock edit)
  const metaOtp = String((payload && (payload.otp||payload.OTP)) || p.otp || '').trim();
  const metaScope = String((payload && (payload.scope_key||payload.scopeKey)) || p.scope_key || '').trim();
  let otpConsumed = false;

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
      // ✅ LOCK: sudah pernah tersimpan → hanya boleh diubah dengan OTP admin (scope: event|date|competition|team|judge)
      const scope_key = [r.event_id, r.date, r.competition_id, r.team_id, r.judge_nik].join('|');

      if(!metaOtp || !metaScope || metaScope !== scope_key){
        throw new Error('LOCKED: Penilaian sudah tersimpan. OTP admin diperlukan untuk ubah. | scope_key=' + scope_key);
      }

      if(!otpConsumed){
        const okOtp = consumeOtp_(metaOtp, ses.nik, scope_key);
        if(!okOtp) throw new Error('LOCKED: OTP tidak valid / expired / sudah dipakai | scope_key=' + scope_key);
        otpConsumed = true;
      }

      // update existing (OTP valid)
      sh.getRange(foundRow, 1, 1, 20).setValues([[
        new Date(), r.event_id, r.date, r.judge_nik, r.judge_name, r.competition_id, r.competition_name, r.category,
        r.team_id, r.team_name, r.criterion_id, r.criterion_name, r.weight, r.rating, r.comment,
        r.device_id, r.client_id, r.client_ts, r.dedupe_key, new Date()
      ]]);
      results.push({ client_id:r.client_id, status:'updated', dedupe_key:k, scope_key: scope_key, otp_used:true });
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
   OTP (Unlock Edit)
========================= */

function otpSheet_(){
  return ensureSheet_(CONFIG.SHEETS.OTP, ['created_at','otp','admin_nik','judge_nik','scope_key','exp_iso','used_at','used_by']);
}

function adminCreateOtp_(p, body){
  const ses = requireAdmin_(p);

  const judge_nik = String((p.judge_nik || (body && body.judge_nik) || '')).trim();
  const scope_key = String((p.scope_key || (body && body.scope_key) || '')).trim();
  const ttl_min = Number(p.ttl_min || (body && body.ttl_min) || 10) || 10;

  if(!judge_nik) return { ok:false, error:'judge_nik wajib' };
  if(!scope_key) return { ok:false, error:'scope_key wajib' };

  const otp = String(Math.floor(100000 + Math.random()*900000));
  const exp = new Date(Date.now() + max_(3, min_(60, ttl_min))*60*1000);

  const sh = otpSheet_();
  sh.appendRow([new Date().toISOString(), otp, ses.nik, judge_nik, scope_key, exp.toISOString(), '', '']);

  return { ok:true, otp, exp: exp.toISOString(), judge_nik, scope_key };
}

function otpVerify_(p, body){
  const ses = requireSession_(p);
  const otp = String((p.otp || (body && body.otp) || '')).trim();
  const scope_key = String((p.scope_key || (body && body.scope_key) || '')).trim();
  if(!otp || !scope_key) return { ok:false, error:'otp dan scope_key wajib' };

  const v = findValidOtp_(otp, ses.nik, scope_key);
  if(!v) return { ok:false, error:'OTP tidak valid / expired / sudah dipakai' };
  return { ok:true, exp: v.exp_iso };
}

function consumeOtp_(otp, judge_nik, scope_key){
  const sh = otpSheet_();
  const lr = sh.getLastRow();
  if(lr < 2) return false;

  const data = sh.getRange(2,1,lr-1,8).getValues();
  const now = Date.now();

  for(let i=data.length-1;i>=0;i--){
    const row = data[i];
    const rowOtp = String(row[1]||'').trim();
    const rowJudge = String(row[3]||'').trim();
    const rowScope = String(row[4]||'').trim();
    const expIso = String(row[5]||'').trim();
    const usedAt = String(row[6]||'').trim();

    if(rowOtp !== otp) continue;
    if(rowJudge !== judge_nik) continue;
    if(rowScope !== scope_key) continue;
    if(usedAt) return false;
    if(expIso && new Date(expIso).getTime() < now) return false;

    sh.getRange(i+2,7,1,2).setValues([[new Date().toISOString(), judge_nik]]);
    try{ markOtpRequestUsed_(otp, judge_nik, scope_key); }catch(e){}
    return true;
  }
  return false;
}

function findValidOtp_(otp, judge_nik, scope_key){
  const sh = otpSheet_();
  const lr = sh.getLastRow();
  if(lr < 2) return null;

  const data = sh.getRange(2,1,lr-1,8).getValues();
  const now = Date.now();

  for(let i=data.length-1;i>=0;i--){
    const row = data[i];
    const rowOtp = String(row[1]||'').trim();
    const rowJudge = String(row[3]||'').trim();
    const rowScope = String(row[4]||'').trim();
    const expIso = String(row[5]||'').trim();
    const usedAt = String(row[6]||'').trim();

    if(rowOtp !== otp) continue;
    if(rowJudge !== judge_nik) continue;
    if(rowScope !== scope_key) continue;
    if(usedAt) return null;
    if(expIso && new Date(expIso).getTime() < now) return null;

    return { exp_iso: expIso };
  }
  return null;
}

function min_(a,b){ return a<b?a:b; }
function max_(a,b){ return a>b?a:b; }



/* =========================
   OTP REQUESTS (Juri -> Admin)
========================= */

function otpReqSheet_(){
  return ensureSheet_(CONFIG.SHEETS.OTP_REQ, [
    'id','created_at','status',
    'event_id','date','competition_id','team_id','scope_key',
    'judge_nik','judge_name','device_id',
    'note',
    'approved_at','approved_by','otp','exp_iso',
    'used_at'
  ]);
}

function otpRequest_(p, body){
  const ses = requireSession_(p);

  const event_id = String((body && body.event_id) || p.event_id || '').trim();
  const date = String((body && body.date) || p.date || '').trim();
  const competition_id = String((body && body.competition_id) || p.competition_id || '').trim();
  const team_id = String((body && body.team_id) || p.team_id || '').trim();
  const scope_key = String((body && body.scope_key) || p.scope_key || '').trim();
  const note = String((body && body.note) || p.note || '').trim();
  const device_id = String((body && body.device_id) || p.device_id || '').trim();

  if(!event_id || !date || !competition_id || !team_id || !scope_key){
    return { ok:false, error:'event_id,date,competition_id,team_id,scope_key wajib' };
  }

  const sh = otpReqSheet_();
  const lr = sh.getLastRow();
  if(lr >= 2){
    const data = sh.getRange(2,1,lr-1,17).getValues();
    for(let i=data.length-1;i>=0;i--){
      const row = data[i];
      const status = String(row[2]||'').trim();
      const rowScope = String(row[7]||'').trim();
      const rowJudge = String(row[8]||'').trim();
      const expIso = String(row[15]||'').trim();
      const usedAt = String(row[16]||'').trim();

      if(rowScope !== scope_key) continue;
      if(rowJudge !== ses.nik) continue;

      // jika sudah ada pending -> jangan bikin baru
      if(status === 'PENDING'){
        return { ok:true, request_id: String(row[0]||''), status:'PENDING', message:'Permintaan OTP sudah ada (pending).' };
      }
      // jika sudah approved tapi belum expired & belum used -> kembalikan OTP
      if(status === 'APPROVED' && !usedAt){
        if(expIso && new Date(expIso).getTime() > Date.now()){
          return { ok:true, request_id: String(row[0]||''), status:'APPROVED', otp:String(row[14]||''), exp: expIso, scope_key };
        }
      }
    }
  }

  const id = Utilities.getUuid();
  sh.appendRow([
    id, new Date().toISOString(), 'PENDING',
    event_id, date, competition_id, team_id, scope_key,
    ses.nik, ses.name || '', device_id,
    note,
    '', '', '', '',
    ''
  ]);

  return { ok:true, request_id:id, status:'PENDING' };
}

function otpRequestsList_(p){
  requireAdmin_(p);

  const sh = otpReqSheet_();
  const lr = sh.getLastRow();
  if(lr < 2) return { ok:true, rows: [] };

  const data = sh.getRange(2,1,lr-1,17).getValues();
  const rows = data
    .map(r=>({
      id:String(r[0]||''),
      created_at:r[1],
      status:String(r[2]||''),
      event_id:r[3], date:r[4], competition_id:r[5], team_id:r[6], scope_key:r[7],
      judge_nik:r[8], judge_name:r[9], device_id:r[10], note:r[11],
      approved_at:r[12], approved_by:r[13], otp:r[14], exp_iso:r[15], used_at:r[16]
    }))
    // tampilkan dulu yang PENDING lalu APPROVED belum used
    .sort((a,b)=>{
      const wa = a.status==='PENDING'?0:(a.status==='APPROVED' && !a.used_at?1:2);
      const wb = b.status==='PENDING'?0:(b.status==='APPROVED' && !b.used_at?1:2);
      if(wa!==wb) return wa-wb;
      return String(b.created_at||'').localeCompare(String(a.created_at||''));
    })
    .slice(0,200);

  return { ok:true, rows };
}

function otpRequestApprove_(p, body){
  const ses = requireAdmin_(p);
  const request_id = String((body && body.request_id) || p.request_id || '').trim();
  const ttl_min = Number((body && body.ttl_min) || p.ttl_min || 10) || 10;
  if(!request_id) return { ok:false, error:'request_id wajib' };

  const sh = otpReqSheet_();
  const lr = sh.getLastRow();
  if(lr < 2) return { ok:false, error:'Belum ada request' };

  const data = sh.getRange(2,1,lr-1,17).getValues();
  let rowIdx = 0;
  let row = null;
  for(let i=0;i<data.length;i++){
    if(String(data[i][0]||'') === request_id){
      rowIdx = i+2;
      row = data[i];
      break;
    }
  }
  if(!rowIdx) return { ok:false, error:'Request tidak ditemukan' };

  const status = String(row[2]||'').trim();
  if(status !== 'PENDING'){
    // kalau sudah approved, kembalikan otp jika masih valid & belum used
    const otp = String(row[14]||'').trim();
    const expIso = String(row[15]||'').trim();
    const usedAt = String(row[16]||'').trim();
    if(status==='APPROVED' && otp && expIso && !usedAt && new Date(expIso).getTime() > Date.now()){
      return { ok:true, request_id, status:'APPROVED', otp, exp: expIso, scope_key:String(row[7]||''), judge_nik:String(row[8]||'') };
    }
    return { ok:false, error:'Request sudah diproses: ' + status };
  }

  const judge_nik = String(row[8]||'').trim();
  const scope_key = String(row[7]||'').trim();
  if(!judge_nik || !scope_key) return { ok:false, error:'Data request tidak valid' };

  // generate OTP & simpan ke sheet OTP utama (dipakai verifikasi/consume)
  const otp = String(Math.floor(100000 + Math.random()*900000));
  const exp = new Date(Date.now() + max_(3, min_(60, ttl_min))*60*1000);

  // tulis ke sheet otp (created_at, otp, admin_nik, judge_nik, scope_key, exp_iso, used_at, used_by)
  const otpSh = otpSheet_();
  otpSh.appendRow([new Date().toISOString(), otp, ses.nik, judge_nik, scope_key, exp.toISOString(), '', '']);

  // update request status
  sh.getRange(rowIdx,1,1,17).setValues([[
    String(row[0]||''), row[1], 'APPROVED',
    row[3], row[4], row[5], row[6], scope_key,
    judge_nik, row[9], row[10], row[11],
    new Date().toISOString(), ses.nik, otp, exp.toISOString(),
    ''
  ]]);

  return { ok:true, request_id, status:'APPROVED', otp, exp: exp.toISOString(), judge_nik, scope_key };
}

function otpMy_(p){
  const ses = requireSession_(p);
  const sh = otpReqSheet_();
  const lr = sh.getLastRow();
  if(lr < 2) return { ok:true, rows: [] };

  const data = sh.getRange(2,1,lr-1,17).getValues();
  const now = Date.now();
  const rows = [];
  for(let i=data.length-1;i>=0;i--){
    const r = data[i];
    const judge = String(r[8]||'').trim();
    const status = String(r[2]||'').trim();
    const otp = String(r[14]||'').trim();
    const expIso = String(r[15]||'').trim();
    const usedAt = String(r[16]||'').trim();
    if(judge !== ses.nik) continue;
    if(status !== 'APPROVED') continue;
    if(usedAt) continue;
    if(!otp || !expIso) continue;
    if(new Date(expIso).getTime() < now) continue;

    rows.push({
      request_id: String(r[0]||''),
      scope_key: String(r[7]||''),
      otp, exp: expIso,
      date: r[4], competition_id: r[5], team_id: r[6],
      approved_at: r[12], approved_by: r[13]
    });
    if(rows.length >= 20) break;
  }
  return { ok:true, rows };
}

function markOtpRequestUsed_(otp, judge_nik, scope_key){
  try{
    const sh = otpReqSheet_();
    const lr = sh.getLastRow();
    if(lr < 2) return;
    const data = sh.getRange(2,1,lr-1,17).getValues();
    for(let i=data.length-1;i>=0;i--){
      const r = data[i];
      const rowOtp = String(r[14]||'').trim();
      const rowJudge = String(r[8]||'').trim();
      const rowScope = String(r[7]||'').trim();
      const status = String(r[2]||'').trim();
      const usedAt = String(r[16]||'').trim();
      if(rowOtp!==otp) continue;
      if(rowJudge!==judge_nik) continue;
      if(rowScope!==scope_key) continue;
      if(status!=='APPROVED') continue;
      if(usedAt) return;
      sh.getRange(i+2,17).setValue(new Date().toISOString());
      return;
    }
  }catch(e){}
}

/* =========================
   RATINGS LIST (Mine vs Admin)
========================= */

function ratingsListMine_(p){
  const ses = requireSession_(p);
  const sh = ensureSheet_(CONFIG.SHEETS.RATINGS, null);
  const lr = sh.getLastRow();
  if(lr < 2) return { ok:true, rows: [] };

  const data = sh.getDataRange().getValues();
  const header = data[0].map(h=>String(h||'').trim());
  const rows = [];
  for(let i=1;i<data.length;i++){
    const r = data[i];
    const o = {};
    header.forEach((h,idx)=>{ o[h]=r[idx]; });
    if(String(o.judge_nik||'').trim() !== String(ses.nik||'').trim()) continue;
    rows.push(o);
  }
  return { ok:true, rows };
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
