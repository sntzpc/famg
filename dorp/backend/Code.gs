/* ==========================
   FG2026 - Doorprize Backend (Google Apps Script)
   Standalone untuk Aplikasi Doorprize Operator

   Database: Google Sheets (1 file)

   Deploy as Web App:
   - Execute as: Me
   - Who has access: Anyone

   Request:
   - POST x-www-form-urlencoded
   - action: string
   - payload: JSON string
   - token: (opsional)
   ========================== */

const SPREADSHEET_ID = '1jwYoZfkzJIG_qkWPcx5pjqmeFfeIR_60ccdr5TbKNIY';
const APP_TZ = 'Asia/Jakarta';
const SESSION_DAYS = 7;
const SALT = 'FG2026_SALT_CHANGE_ME';

// (Opsional) Folder Drive untuk upload gambar hadiah (tidak dipakai oleh frontend ini)
const PRIZE_IMG_FOLDER_ID = '16EBlzWqYRT-5SAZMSZJdwkc_WyI03qbD';

// Sheet names (minimal)
const SH = {
  participants: 'participants',
  // sumber master peserta (untuk flag is_staff, dll)
  // NOTE: pool undian TIDAK lagi memakai participants, tapi memakai attendance
  attendance: 'attendance',
  prizes: 'doorprize_items',
  draws: 'doorprize_draws',
  users: 'panel_users',
  sessions: 'panel_sessions',
  logs: 'logs',
  config: 'app_config'
};

// ==========================
// Attendance-based eligibility
// ==========================
// Pool peserta undian diambil dari sheet attendance (yang sudah terkonfirmasi hadir).
// Jika onlyStaff=true, maka peserta attendance akan di-filter lagi dengan master participants.is_staff.
// Support multi-event: bila event_id tersedia (dari payload atau config), akan di-filter sesuai event tersebut.

function getActiveEventId_(){
  // coba ambil dari app_config (jika ada). Format config sangat fleksibel.
  // Kita dukung beberapa kemungkinan path umum: event_id, event.id, event.event_id
  try{
    const cfg = public_getConfig_();
    const c = (cfg && cfg.config) ? cfg.config : {};
    const a = c.event_id || (c.event && (c.event.id || c.event.event_id)) || (c.event && c.event.active_id);
    const s = String(a||'').trim();
    return s || '';
  }catch(e){
    return '';
  }
}

function buildStaffSet_(){
  // master participants untuk flag staff
  try{
    const part = getAll_(SH.participants);
    const set = new Set();
    part.forEach(r=>{ if(bool_(r.is_staff) && String(r.nik||'').trim()) set.add(String(r.nik).trim()); });
    return set;
  }catch(e){
    return new Set();
  }
}

function listEligibleFromAttendance_(onlyStaff, eventId){
  const ev = String(eventId||'').trim();
  const rows = getAll_(SH.attendance);
  const staffSet = onlyStaff ? buildStaffSet_() : null;

  // dedupe by NIK (ambil data terbaru jika ada duplikat)
  const byNik = new Map();
  rows.forEach(r=>{
    const nik = String(r.nik||'').trim();
    if(!nik) return;
    if(ev && String(r.event_id||'').trim() !== ev) return;
    if(staffSet && !staffSet.has(nik)) return;
    const ts = new Date(String(r.timestamp||''));
    const prev = byNik.get(nik);
    if(!prev || (ts && !isNaN(ts) && ts > prev._ts)){
      byNik.set(nik, {
        nik,
        name: String(r.name||''),
        _ts: (ts && !isNaN(ts)) ? ts : new Date(0)
      });
    }
  });

  return Array.from(byNik.values()).map(x=>({ nik:x.nik, name:x.name }));
}

function uniqByNik_(rows){
  const seen = new Set();
  const out = [];
  (rows||[]).forEach(r=>{
    const nik = String(r.nik||'').trim();
    if(!nik) return;
    if(seen.has(nik)) return;
    seen.add(nik);
    out.push(r);
  });
  return out;
}

function staffNikSet_(){
  // master staff dari sheet participants
  let set = new Set();
  try{
    const meta = sheetMeta_(SH.participants);
    const nikIdx = meta.idx('nik');
    const isStaffIdx = meta.idx('is_staff');
    for(let r=1;r<meta.values.length;r++){
      const row = meta.values[r];
      const nik = String(row[nikIdx]||'').trim();
      if(!nik) continue;
      if(bool_(row[isStaffIdx])) set.add(nik);
    }
  }catch(e){
    // participants sheet mungkin belum ada / header berbeda -> fallback: anggap semua staff
    set = null;
  }
  return set;
}

function eligibleFromAttendance_(onlyStaff, eventId){
  const eid = String(eventId||'').trim();
  let rows = [];
  try{
    rows = getAll_(SH.attendance);
  }catch(e){
    throw new Error('Sheet attendance tidak ditemukan. Pastikan sheet attendance sudah ada di database.');
  }

  if(eid){
    rows = rows.filter(r => String(r.event_id||'').trim() === eid);
  }

  rows = uniqByNik_(rows).map(r=>({
    nik: String(r.nik||'').trim(),
    name: String(r.name||'').trim(),
    region: String(r.region||'').trim(),
    unit: String(r.unit||'').trim()
  })).filter(r=>!!r.nik);

  if(onlyStaff){
    const staffSet = staffNikSet_();
    if(staffSet && staffSet.size){
      rows = rows.filter(r => staffSet.has(r.nik));
    }
  }

  return rows;
}

function doPost(e){
  try{
    const action = (e.parameter.action || '').trim();
    const payload = JSON.parse(e.parameter.payload || '{}');
    const token = (e.parameter.token || '').trim();

    const out = route_(action, payload, token);
    return json_({ ok:true, data: out });
  }catch(err){
    return json_({ ok:false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet(){
  return json_({ ok:true, data:{ msg:'FG2026 doorprize backend running' } });
}

function json_(obj){
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================
// Routing
// ==========================
function route_(action, p, token){
  switch(action){
    // public
    case 'public.getPrizeImageDataUrl': return public_getPrizeImageDataUrl_(p);
    case 'public.getConfig': return public_getConfig_();

    // auth
    case 'auth.login': return auth_login_(p);
    case 'auth.me': return auth_me_(token);
    case 'auth.logout': return auth_logout_(token);

    // operator (token required: OPERATOR/ADMIN)
    case 'operator.prizesList': return operator_any_(token, operator_prizesList_, p);
    case 'operator.participantsEligible': return operator_any_(token, operator_participantsEligible_, p);
    case 'operator.drawDoorprize': return operator_any_(token, operator_drawDoorprize_, p);
    case 'operator.doorprizeListByPrize': return operator_any_(token, operator_doorprizeListByPrize_, p);
    case 'operator.doorprizeRemoveAndRedraw': return operator_any_(token, operator_doorprizeRemoveAndRedraw_, p);
    case 'operator.confirmStage': return operator_any_(token, operator_confirmStage_, p);

    default: throw new Error('Unknown action: ' + action);
  }
}

function operator_any_(token, fn, payload){
  const u = sessionRequire_(token);
  if(u.role !== 'ADMIN' && u.role !== 'OPERATOR') throw new Error('Forbidden: operator role required');
  return fn(payload, u);
}

// ==========================
// Spreadsheet helpers
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

function ensureSheet_(name, headers){
  const s = ss_();
  let sh = s.getSheetByName(name);
  if(!sh) sh = s.insertSheet(name);
  if(headers && headers.length){
    const firstRow = sh.getRange(1,1,1,headers.length).getValues()[0];
    const empty = firstRow.every(v=>String(v||'').trim()==='');
    if(empty) sh.getRange(1,1,1,headers.length).setValues([headers]);
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
// ==========================
// Fast sheet helpers (batch ops)
// ==========================
function sheetMeta_(sheetName){
  const sh = sh_(sheetName);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const values = (lastRow >= 1 && lastCol >= 1) ? sh.getRange(1,1,lastRow,lastCol).getValues() : [[]];
  const headers = (values[0]||[]).map(String);
  const idxMap = {};
  headers.forEach((h,i)=>{ idxMap[h]=i; });
  return {
    sh,
    sheetName,
    headers,
    values,
    idx: (h)=>{
      const i = idxMap[String(h)];
      if(i === undefined) throw new Error('Header not found in '+sheetName+': '+h);
      return i;
    }
  };
}

// Append objects into sheet using meta.headers ordering, in a single setValues call.
// Assumes all objects are NEW rows (no upsert).
function appendObjects_(meta, objects){
  if(!objects || !objects.length) return;
  const sh = meta.sh;
  const headers = meta.headers;
  const startRow = sh.getLastRow() + 1;
  const rows = objects.map(o => headers.map(h => (o[h] !== undefined ? o[h] : '')));
  sh.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
}

// Fisher–Yates shuffle (in place)
function shuffleInPlace_(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    const tmp = arr[i]; arr[i]=arr[j]; arr[j]=tmp;
  }
  return arr;
}

function upsertByKey_(sheetName, keyField, obj){
  const sh = sh_(sheetName);
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(String);
  const keyIdx = headers.indexOf(keyField);
  if(keyIdx < 0) throw new Error('Key field not found: ' + keyField);

  const rowObj = headers.map(h => obj[h] !== undefined ? obj[h] : '');

  let targetRow = -1;
  for(let i=1;i<data.length;i++){
    if(String(data[i][keyIdx]) === String(obj[keyField])){ targetRow = i+1; break; }
  }
  if(targetRow === -1){
    sh.appendRow(rowObj);
    targetRow = sh.getLastRow();
  }else{
    sh.getRange(targetRow,1,1,headers.length).setValues([rowObj]);
  }
  return { row: targetRow };
}

function deleteByKey_(sheetName, keyField, key){
  const sh = sh_(sheetName);
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(String);
  const keyIdx = headers.indexOf(keyField);
  if(keyIdx < 0) throw new Error('Key field not found: ' + keyField);
  for(let i=1;i<data.length;i++){
    if(String(data[i][keyIdx]) === String(key)){
      sh.deleteRow(i+1);
      return true;
    }
  }
  return false;
}

function nowIso_(){
  return Utilities.formatDate(new Date(), APP_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function toLocal_(iso){
  if(!iso) return '';
  const d = new Date(iso);
  return Utilities.formatDate(d, APP_TZ, 'dd MMM yyyy HH:mm');
}

function bool_(x){
  const s = String(x||'').toUpperCase();
  return x === true || s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y';
}

// ==========================
// Auth + sessions
// ==========================
function hash_(s){
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s)+SALT);
  return bytes.map(b => (b<0?b+256:b).toString(16).padStart(2,'0')).join('');
}

function sessionCreate_(user){
  const token = Utilities.getUuid();
  const exp = new Date(Date.now() + SESSION_DAYS*24*3600*1000);
  const item = {
    token,
    username: user.username,
    role: user.role,
    name: user.name || user.username,
    expires_at: exp.toISOString()
  };
  upsertByKey_(SH.sessions, 'token', item);
  return token;
}

function sessionRequire_(token){
  if(!token) throw new Error('Unauthorized: token required');
  const rows = getAll_(SH.sessions);
  const r = rows.find(x => String(x.token) === String(token));
  if(!r) throw new Error('Unauthorized: invalid token');
  if(new Date(r.expires_at) < new Date()) throw new Error('Unauthorized: session expired');
  return { username:r.username, role:r.role, name:r.name };
}

function auth_login_(p){
  const username = String(p.username||'').trim();
  const password = String(p.password||'');
  if(!username || !password) throw new Error('Username/password required');

  const users = getAll_(SH.users);
  const u = users.find(x => String(x.username)===username);
  if(!u) throw new Error('User not found');
  if(String(u.active||'TRUE').toUpperCase() === 'FALSE') throw new Error('User disabled');

  const ok = String(u.password_hash) === hash_(password);
  if(!ok) throw new Error('Wrong password');

  const token = sessionCreate_(u);
  return { token, user:{ username:u.username, role:u.role, name:u.name } };
}

function auth_me_(token){
  const u = sessionRequire_(token);
  return { user:u };
}

function auth_logout_(token){
  if(!token) return { ok:true };
  deleteByKey_(SH.sessions, 'token', token);
  return { ok:true };
}

// ==========================
// Public endpoints
// ==========================
function public_getConfig_(){
  // Branding / multi-event config
  // Sheet: app_config
  // Header: key | value_json | updated_at | updated_by
  // - key boleh kosong: value_json dianggap patch root (object) dan di-merge
  // - key boleh berupa path "a.b.c": value_json akan diset ke nested object
  // - value_json idealnya JSON (object/array/string/number/bool). Jika bukan JSON valid, dianggap string biasa.

  var patch = {};
  var rows = [];
  try{
    rows = getAll_(SH.config);
  }catch(e){
    // sheet belum ada
    rows = [];
  }

  rows.forEach(function(r){
    var key = String(r.key || '').trim();
    var raw = (r.value_json === undefined || r.value_json === null) ? '' : String(r.value_json).trim();
    if(!raw) return;

    var val;
    try{ val = JSON.parse(raw); }
    catch(_){ val = raw; }

    if(!key){
      if(val && typeof val === 'object' && !Array.isArray(val)) deepMerge_(patch, val);
      else patch['__value__'] = val;
      return;
    }

    setByPath_(patch, key, val);
  });

  return { config: patch };
}

// ==========================
// Config helpers (private)
// ==========================
function deepMerge_(target, src){
  if(!src || typeof src !== 'object') return target;
  Object.keys(src).forEach(function(k){
    var sv = src[k];
    var tv = target[k];
    if(sv && typeof sv === 'object' && !Array.isArray(sv)){
      if(!tv || typeof tv !== 'object' || Array.isArray(tv)) target[k] = {};
      deepMerge_(target[k], sv);
    }else{
      target[k] = sv;
    }
  });
  return target;
}

function setByPath_(obj, path, value){
  var parts = String(path||'').split('.').map(function(s){ return String(s).trim(); }).filter(Boolean);
  if(!parts.length) return;
  var cur = obj;
  for(var i=0;i<parts.length-1;i++){
    var p = parts[i];
    if(!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length-1]] = value;
}

function extractDriveId_(s){
  var str = String(s || '').trim();
  if(!str) return '';
  if(/^[a-zA-Z0-9_-]{20,}$/.test(str) && str.indexOf('http') < 0) return str;

  var m = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if(m && m[1]) return m[1];

  m = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if(m && m[1]) return m[1];

  m = str.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if(m && m[1]) return m[1];

  return '';
}

// PUBLIC: ambil gambar doorprize sebagai dataURL (anti ORB)
function public_getPrizeImageDataUrl_(p){
  var any = String((p && (p.fileId || p.id || p.url)) || '').trim();
  var fileId = extractDriveId_(any);
  if(!fileId) throw new Error('fileId required');

  var file = DriveApp.getFileById(fileId);
  var blob = file.getBlob();
  var mime = String(blob.getContentType() || 'image/jpeg');

  var bytes = blob.getBytes();
  if(bytes.length > 2 * 1024 * 1024){
    throw new Error('Image too large (>2MB). Compress image before upload.');
  }

  var b64 = Utilities.base64Encode(bytes);
  var dataUrl = 'data:' + mime + ';base64,' + b64;

  return { file_id: fileId, mime: mime, data_url: dataUrl, filename: file.getName() };
}

// ==========================
// Operator endpoints
// ==========================
function operator_prizesList_(p, u){
  const rows = getAll_(SH.prizes).map(r=>({
    id:String(r.id),
    name:String(r.name),
    qty_total:Number(r.qty_total||0),
    qty_remaining:Number(r.qty_remaining||0),
    image_url:String(r.image_url||''),
    active: bool_(r.active)
  }));
  return { rows };
}

function operator_participantsEligible_(p, u){
  const onlyStaff = (p && p.onlyStaff !== undefined) ? bool_(p.onlyStaff) : true;
  const eventId = (p && p.event_id) ? String(p.event_id||'').trim() : getActiveEventId_();

  const rows = listEligibleFromAttendance_(onlyStaff, eventId)
    .map(r=>({ nik: String(r.nik), name: String(r.name||''), is_staff: !!onlyStaff }));

  return { rows, source:'attendance', event_id:eventId||'' };
}

function operator_drawDoorprize_(p, u){
  const prizeId = String(p.prizeId||'');
  const count = Math.max(1, Number(p.count||1));
  const eventId = (p && p.event_id) ? String(p.event_id||'').trim() : getActiveEventId_();
  if(!prizeId) throw new Error('prizeId required');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    // ===== Load once (avoid SpreadsheetApp loops) =====
    const prizeMeta = sheetMeta_(SH.prizes);
    const drawMeta  = sheetMeta_(SH.draws);

    // find prize row
    const idIdx = prizeMeta.idx('id');
    const nameIdx = prizeMeta.idx('name');
    const remIdx = prizeMeta.idx('qty_remaining');
    const totalIdx = prizeMeta.idx('qty_total');
    const imgIdx = prizeMeta.idx('image_url');
    const activeIdx = prizeMeta.idx('active');

    let prizeRowPos = -1; // 1-based row number in sheet
    let prizeRow = null;
    for(let r=1;r<prizeMeta.values.length;r++){
      if(String(prizeMeta.values[r][idIdx]) === prizeId){
        prizeRowPos = r+1;
        prizeRow = prizeMeta.values[r];
        break;
      }
    }
    if(!prizeRow) throw new Error('Doorprize not found');

    const remain = Number(prizeRow[remIdx]||0);
    if(remain <= 0) throw new Error('Stok doorprize habis');

    const n = Math.min(count, remain);

    // build drawnNiks set from draws once
    const nikIdx = drawMeta.idx('nik');
    const drawnNiks = new Set();
    for(let r=1;r<drawMeta.values.length;r++){
      const nik = String(drawMeta.values[r][nikIdx]||'').trim();
      if(nik) drawnNiks.add(nik);
    }

    // build eligible list from attendance (confirmed hadir)
    // default: only staff
    const baseEligible = listEligibleFromAttendance_(true, eventId);
    const eligible = baseEligible.filter(x => !drawnNiks.has(String(x.nik||'').trim()));
    if(!eligible.length) throw new Error('Tidak ada peserta hadir yang eligible untuk diundi');

    // sample without replacement (shuffle partial)
    shuffleInPlace_(eligible);

    const winners = [];
    const now = nowIso_();
    const prizeName = String(prizeRow[nameIdx]||'');
    const prizeImg  = String(prizeRow[imgIdx]||'');

    const take = Math.min(n, eligible.length);
    for(let i=0;i<take;i++){
      const pick = eligible[i];
      drawnNiks.add(pick.nik);

      winners.push({
        draw_id: Utilities.getUuid(),
        prize_id: prizeId,
        prize_name: prizeName,
        prize_image: prizeImg,
        slot: i+1,
        nik: pick.nik,
        name: pick.name,
        status: 'WIN',
        timestamp: now,
        by_user: u.username,
        replaced_draw_id: ''
      });
    }

    if(!winners.length) throw new Error('Tidak ada peserta eligible untuk diundi');

    // append draws in one batch
    appendObjects_(drawMeta, winners);

    // update remaining (single cell)
    const newRemain = remain - winners.length;
    prizeMeta.sh.getRange(prizeRowPos, remIdx+1).setValue(newRemain);

    // keep other prize fields intact (optional normalize)
    // (No need to upsert full row to avoid costly reads)

    return { ok:true, winners, qty_remaining:newRemain };
  }finally{
    lock.releaseLock();
  }
}

function operator_doorprizeListByPrize_(p){
  const prizeId = String(p.prizeId||'');
  if(!prizeId) throw new Error('prizeId required');
  const rows = getAll_(SH.draws)
    .filter(r=>String(r.prize_id)===prizeId)
    .sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp))
    .map(r=>({
      draw_id:String(r.draw_id),
      prize_id:String(r.prize_id),
      prize_name:String(r.prize_name),
      prize_image:String(r.prize_image||''),
      slot:Number(r.slot||0),
      nik:String(r.nik),
      name:String(r.name),
      status:String(r.status||'WIN'),
      timestamp:String(r.timestamp),
      time_local: toLocal_(r.timestamp)
    }));
  return { rows };
}

function operator_doorprizeRemoveAndRedraw_(p, u){
  const drawId = String(p.drawId||'');
  const eventId = (p && p.event_id) ? String(p.event_id||'').trim() : getActiveEventId_();
  if(!drawId) throw new Error('drawId required');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const drawMeta  = sheetMeta_(SH.draws);
    const prizeMeta = sheetMeta_(SH.prizes);

    const idxDrawId   = drawMeta.idx('draw_id');
    const idxPrizeId  = drawMeta.idx('prize_id');
    const idxSlot     = drawMeta.idx('slot');
    const idxNik      = drawMeta.idx('nik');
    const idxStatus   = drawMeta.idx('status');
    const idxRemovedAt= drawMeta.idx('removed_at');
    const idxRemovedBy= drawMeta.idx('removed_by');

    // find old draw row
    let oldRowIndex = -1;
    for(let r=1;r<drawMeta.values.length;r++){
      if(String(drawMeta.values[r][idxDrawId]) === drawId){ oldRowIndex = r; break; }
    }
    if(oldRowIndex < 0) throw new Error('draw not found');

    const oldRow = drawMeta.values[oldRowIndex];
    const prizeId = String(oldRow[idxPrizeId]);
    const slot = Number(oldRow[idxSlot] || 0);

    // find prize meta row
    const idxPid = prizeMeta.idx('id');
    const idxPName = prizeMeta.idx('name');
    const idxPImg = prizeMeta.idx('image_url');
    const idxRemain = prizeMeta.idx('qty_remaining');

    let prizeRowIndex = -1;
    for(let r=1;r<prizeMeta.values.length;r++){
      if(String(prizeMeta.values[r][idxPid]) === prizeId){ prizeRowIndex = r; break; }
    }
    if(prizeRowIndex < 0) throw new Error('Doorprize not found');

    const prizeRow = prizeMeta.values[prizeRowIndex];
    const prizeName = String(prizeRow[idxPName]||'');
    const prizeImg  = String(prizeRow[idxPImg]||'');

    // 1) mark old as NO_SHOW (only update a few cells)
    const rowNo = oldRowIndex + 1;
    drawMeta.sh.getRange(rowNo, idxStatus+1).setValue('NO_SHOW');
    drawMeta.sh.getRange(rowNo, idxRemovedAt+1).setValue(nowIso_());
    drawMeta.sh.getRange(rowNo, idxRemovedBy+1).setValue(u.username);

    // 2) build drawn NIK set (exclude everyone ever drawn)
    const drawnNiks = new Set();
    for(let r=1;r<drawMeta.values.length;r++){
      const nik = String(drawMeta.values[r][idxNik]||'').trim();
      if(nik) drawnNiks.add(nik);
    }

    // 3) find eligible participant (attendance-based)
    const eligible = listEligibleFromAttendance_(true, eventId)
      .filter(x => !drawnNiks.has(String(x.nik||'').trim()));

    if(!eligible.length){
      // no replacement -> restore stock +1 so prize can be drawn again later
      const remainNow = Number(prizeRow[idxRemain]||0);
      prizeMeta.sh.getRange(prizeRowIndex+1, idxRemain+1).setValue(remainNow + 1);
      return { ok:true, replacement:null, note:'no eligible replacement' };
    }

    const pick = eligible[Math.floor(Math.random()*eligible.length)];

    // 4) append replacement draw (fast)
    const replacement = {
      draw_id: Utilities.getUuid(),
      prize_id: prizeId,
      prize_name: prizeName,
      prize_image: prizeImg,
      slot: slot,
      nik: pick.nik,
      name: pick.name,
      status: 'WIN',
      timestamp: nowIso_(),
      by_user: u.username,
      replaced_draw_id: drawId
    };

    const rowArr = drawMeta.headers.map(h => replacement[h] !== undefined ? replacement[h] : '');
    drawMeta.sh.appendRow(rowArr);

    // stock net should stay the same in normal replacement case
    return { ok:true, replacement };

  } finally {
    lock.releaseLock();
  }
}

function operator_confirmStage_(p, u){
  const prizeId = String(p.prizeId||'');
  if(!prizeId) throw new Error('prizeId required');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try{
    const drawMeta = sheetMeta_(SH.draws);
    const idxPrize = drawMeta.idx('prize_id');
    const idxStatus = drawMeta.idx('status');
    const idxTakenAt = drawMeta.idx('taken_at');
    const idxTakenBy = drawMeta.idx('taken_by');

    const now = nowIso_();
    let updated = 0;

    // Update only the needed cells (fast, no getDataRange loops per row)
    for(let r=1;r<drawMeta.values.length;r++){
      const row = drawMeta.values[r];
      if(String(row[idxPrize]) === prizeId && String(row[idxStatus]||'') === 'WIN'){
        const rowNo = r+1; // sheet row number
        drawMeta.sh.getRange(rowNo, idxStatus+1).setValue('TAKEN');
        drawMeta.sh.getRange(rowNo, idxTakenAt+1).setValue(now);
        drawMeta.sh.getRange(rowNo, idxTakenBy+1).setValue(u.username);
        updated++;
      }
    }

    return { ok:true, updated, status:'TAKEN' };
  } finally {
    lock.releaseLock();
  }
}

function drawOne_(prizeId, slot, u, replacedDrawId){
  const prize = getAll_(SH.prizes).find(r=>String(r.id)===prizeId);
  const eventId = getActiveEventId_();
  const participants = listEligibleFromAttendance_(true, eventId);

  // exclude semua NIK yang pernah terundi (status apapun)
  const drawnNiks = new Set(getAll_(SH.draws).map(r=>String(r.nik)));

  const eligible = participants
    .map(r=>({ nik:String(r.nik), name:String(r.name) }))
    .filter(p => !drawnNiks.has(p.nik));

  if(!eligible.length) return null;
  const pick = eligible[Math.floor(Math.random()*eligible.length)];

  const draw = {
    draw_id: Utilities.getUuid(),
    prize_id: prizeId,
    prize_name: String(prize && prize.name || ''),
    prize_image: String(prize && prize.image_url || ''),
    slot: Number(slot||0),
    nik: pick.nik,
    name: pick.name,
    status: 'WIN',
    timestamp: nowIso_(),
    by_user: u.username,
    replaced_draw_id: replacedDrawId || ''
  };

  upsertByKey_(SH.draws, 'draw_id', draw);
  return draw;
}

// ==========================
// Setup (jalankan sekali)
// ==========================
function setup(){
  ensureSheet_(SH.participants, ['nik','name','region','unit','is_staff','family_json']);
  ensureSheet_(SH.attendance, ['id','event_id','nik','name','region','unit','family_json','timestamp']);
  ensureSheet_(SH.prizes, ['id','name','qty_total','qty_remaining','image_url','active']);
  ensureSheet_(SH.draws, ['draw_id','prize_id','prize_name','prize_image','slot','nik','name','status','timestamp','by_user','replaced_draw_id','taken_at','taken_by','removed_at','removed_by']);
  ensureSheet_(SH.users, ['username','name','role','active','password_hash']);
  ensureSheet_(SH.sessions, ['token','username','role','name','expires_at']);
  ensureSheet_(SH.logs, ['ts','action','detail']);
  ensureSheet_(SH.config, ['key','value_json','updated_at','updated_by']);

  seedInitialData_();

  try{ ss_().toast('Setup Doorprize selesai. Deploy Web App, lalu isi URL di config.js'); }catch(err){ Logger.log('Setup done'); }
}

function seedInitialData_(){
  const users = getAll_(SH.users);

  if(!users.find(r=>String(r.username)==='admin')){
    upsertByKey_(SH.users,'username',{
      username:'admin',
      name:'Administrator',
      role:'ADMIN',
      active:'TRUE',
      password_hash: hash_('admin123')
    });
  }

  if(!users.find(r=>String(r.username)==='operator')){
    upsertByKey_(SH.users,'username',{
      username:'operator',
      name:'Operator',
      role:'OPERATOR',
      active:'TRUE',
      password_hash: hash_('operator123')
    });
  }
}