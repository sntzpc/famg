/** FG2026 - Unit Peserta Lomba Randomizer (GAS Backend)
 * Sheets (in the same Spreadsheet):
 *  - Settings: key,value
 *  - Participants: id,name,unit,category,active,updated_at
 *  - Draws: draw_no,ts,name,unit,category,participant_id,by_nik
 *  - Sessions: token,role,nik_or_user,expires_at,created_at
 *
 * Deploy as Web App: Execute as "Me", Access "Anyone" (Display is public).
 * IMPORTANT: Run setup() once from Apps Script editor.
 */

const SETTINGS = {
  SS_ID: "1Tz9bP8K3YQrTT_WldMTWWGFcUEIxZmPGHoV-WjABKzg", // optional override. leave empty to use active spreadsheet
  ADMIN_USER: "admin",
  ADMIN_HASH_SHA256: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9", // default for "admin123"
  TRIGGER_ALLOWED_NIKS: "[]", // JSON array string
  DRAW_CURRENT: "{}", // JSON object string
  TOKEN_TTL_MIN: "720" // 12 hours
};

const DRAW_PATTERN = ["B","A","B","A","C"];

function getSS_(){
  if(SETTINGS.SS_ID) return SpreadsheetApp.openById(SETTINGS.SS_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name, headers){
  const ss = getSS_();
  let sh = ss.getSheetByName(name);
  if(!sh) sh = ss.insertSheet(name);
  if(headers && sh.getLastRow() === 0){
    sh.appendRow(headers);
  }
  return sh;
}

function setup(){
  const shSet = sheet_("Settings", ["key","value"]);
  const existing = shSet.getRange(1,1,shSet.getLastRow(),2).getValues()
    .slice(1).reduce((m,r)=>{ if(r[0]) m[r[0]] = String(r[1] ?? ""); return m; },{});
  Object.keys(SETTINGS).forEach(k=>{
    if(existing[k] === undefined){
      shSet.appendRow([k, SETTINGS[k]]);
    }
  });
  sheet_("Participants", ["id","name","unit","category","active","updated_at"]);
  sheet_("Draws", ["draw_no","ts","name","unit","category","participant_id","by_nik"]);
  sheet_("Sessions", ["token","role","nik_or_user","expires_at","created_at"]);
  return "OK";
}

function doGet(e){
  const p = (e && e.parameter) ? e.parameter : {};
  const action = String(p.action || "").trim() || "ping";
  try{
    const out = route_(action, p);
    return respond_(out, p.callback);
  }catch(err){
    return respond_({ ok:false, error:String(err && err.message ? err.message : err), action }, p.callback);
  }
}

function doPost(e){
  // Optional: support POST JSON (e.g., bulk import) if you prefer.
  const p = (e && e.parameter) ? e.parameter : {};
  const action = String(p.action || "").trim() || "ping";
  let body = null;
  try{
    if(e && e.postData && e.postData.contents){
      body = JSON.parse(e.postData.contents);
    }
  }catch(_){
    body = null;
  }
  try{
    const out = route_(action, p, body);
    return respond_(out, p.callback);
  }catch(err){
    return respond_({ ok:false, error:String(err && err.message ? err.message : err), action }, p.callback);
  }
}

function respond_(obj, callback){
  const json = JSON.stringify(obj);
  if(callback){
    return ContentService
      .createTextOutput(`${callback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function route_(action, p, body){
  switch(action){
    case "ping": return { ok:true, ts:new Date().toISOString() };
    case "public.config": return publicConfig_();
    case "display.state": return displayState_();
    case "draw.list": return drawList_();
    case "trigger.login": return triggerLogin_(p);
    case "draw.next": return drawNext_(p); // legacy (single draw)
    case "draw.runAll": return drawRunAll_(p);
    case "draw.reset": return drawResetByTrigger_(p);
    case "admin.login": return adminLogin_(p);
    case "admin.logout": return adminLogout_(p);
    case "admin.get": return adminGet_(p);
    case "admin.setPassword": return adminSetPassword_(p);
    case "admin.setAllowedNiks": return adminSetAllowedNiks_(p);
    case "participants.list": return participantsList_(p);
    case "participants.upsert": return participantsUpsert_(p);
    case "participants.delete": return participantsDelete_(p);
    case "participants.bulk": return participantsBulk_(p, body);
    case "draws.clear": return drawsClear_(p);
    default: throw new Error("Unknown action: " + action);
  }
}

function settingsGetMap_(){
  const sh = sheet_("Settings", ["key","value"]);
  const vals = sh.getRange(2,1,Math.max(0, sh.getLastRow()-1),2).getValues();
  const map = {};
  vals.forEach(r=>{ if(r[0]) map[String(r[0]).trim()] = String(r[1] ?? ""); });
  return map;
}

function settingsPut_(key, value){
  const sh = sheet_("Settings", ["key","value"]);
  const last = sh.getLastRow();
  if(last < 2){
    sh.appendRow([key, String(value)]);
    return;
  }
  const keys = sh.getRange(2,1,last-1,1).getValues().map(r=>String(r[0]||""));
  const idx = keys.findIndex(k=>k===key);
  if(idx >= 0){
    sh.getRange(2+idx, 2).setValue(String(value));
  } else {
    sh.appendRow([key, String(value)]);
  }
}

function tokenNew_(role, who){
  const ttlMin = Number(settingsGetMap_().TOKEN_TTL_MIN || 720);
  const token = Utilities.getUuid().replace(/-/g,"");
  const now = new Date();
  const exp = new Date(now.getTime() + ttlMin*60*1000);
  const sh = sheet_("Sessions", ["token","role","nik_or_user","expires_at","created_at"]);
  sh.appendRow([token, role, who, exp.toISOString(), now.toISOString()]);
  return { token, expiresAt: exp.toISOString() };
}

function tokenValidate_(token, role){
  if(!token) return null;
  const sh = sheet_("Sessions", ["token","role","nik_or_user","expires_at","created_at"]);
  const last = sh.getLastRow();
  if(last < 2) return null;
  const data = sh.getRange(2,1,last-1,5).getValues();
  const now = new Date().getTime();
  for(let i=data.length-1;i>=0;i--){ // scan from latest
    const r = data[i];
    if(String(r[0]) === String(token) && String(r[1]) === String(role)){
      const exp = Date.parse(String(r[3]));
      if(!isNaN(exp) && exp > now){
        return { token: r[0], role:r[1], who:r[2], expiresAt:r[3] };
      }
      return null;
    }
  }
  return null;
}

function tokenRevoke_(token){
  if(!token) return 0;
  const sh = sheet_("Sessions", ["token","role","nik_or_user","expires_at","created_at"]);
  const last = sh.getLastRow();
  if(last < 2) return 0;
  const data = sh.getRange(2,1,last-1,1).getValues().map(r=>String(r[0]||""));
  const rowsToDelete = [];
  data.forEach((t,idx)=>{ if(t===String(token)) rowsToDelete.push(2+idx); });
  rowsToDelete.reverse().forEach(r=>sh.deleteRow(r));
  return rowsToDelete.length;
}

/** PUBLIC */
function publicConfig_(){
  const m = settingsGetMap_();
  let allowed = [];
  try{ allowed = JSON.parse(m.TRIGGER_ALLOWED_NIKS || "[]") || []; }catch(_){
    allowed = [];
  }
  return {
    ok:true,
    allowedNiks: allowed,
    theme: "light"
  };
}

function displayState_(){
  const m = settingsGetMap_();
  let cur = {};
  try{ cur = JSON.parse(m.DRAW_CURRENT || "{}") || {}; }catch(_){
    cur = {};
  }
  return { ok:true, current: cur };
}

function drawList_(){
  const sh = sheet_("Draws", ["draw_no","ts","name","unit","category","participant_id","by_nik"]);
  const last = sh.getLastRow();
  if(last < 2) return { ok:true, items: [] };
  const vals = sh.getRange(2,1,last-1,7).getValues();
  const items = vals.map(r=>({
    drawNo: Number(r[0])||0,
    ts: String(r[1]||""),
    name: String(r[2]||""),
    unit: String(r[3]||""),
    category: String(r[4]||""),
    participantId: String(r[5]||""),
    byNik: String(r[6]||""),
  }));
  return { ok:true, items };
}

/** TRIGGER */
function triggerLogin_(p){
  const nik = String(p.nik || "").trim();
  if(!nik) throw new Error("NIK wajib diisi");
  const m = settingsGetMap_();
  let allowed = [];
  try{ allowed = JSON.parse(m.TRIGGER_ALLOWED_NIKS || "[]") || []; }catch(_){
    allowed = [];
  }
  if(allowed.indexOf(nik) < 0) throw new Error("NIK tidak diizinkan");
  const tok = tokenNew_("trigger", nik);
  return { ok:true, token: tok.token, expiresAt: tok.expiresAt };
}

function drawNext_(p){
  const token = String(p.token || "").trim();
  const ses = tokenValidate_(token, "trigger");
  if(!ses) throw new Error("Token trigger tidak valid / expired. Login ulang.");

  // Read active participants
  const parts = participantsReadActive_();
  if(parts.length === 0) throw new Error("Tidak ada peserta aktif untuk diacak.");

  // Pools (shuffled)
  const poolA = shuffleArr_(parts.filter(x=>x.category==="A"));
  const poolB = shuffleArr_(parts.filter(x=>x.category==="B"));
  const poolC = shuffleArr_(parts.filter(x=>x.category==="C"));

  // Determine next drawNo (based on Draws sheet)
  const shD = sheet_("Draws", ["draw_no","ts","name","unit","category","participant_id","by_nik"]);
  const nextDrawNo = Math.max(0, shD.getLastRow()-1) + 1;

  // Determine pattern index: (drawNo-1) % patternLen
  const patIdx = (nextDrawNo - 1) % DRAW_PATTERN.length;

  // Pick next using pattern best-effort
  const next = chooseNextByPattern_(poolA, poolB, poolC, patIdx);
  if(!next) throw new Error("Peserta habis.");

  // Mark inactive
  participantsSetActive_(next.id, false);

  // Append to draws
  const ts = new Date().toISOString();
  shD.appendRow([nextDrawNo, ts, next.name, next.unit, next.category, next.id, ses.who]);

  // Update current
  const current = {
    drawNo: nextDrawNo, ts,
    name: next.name,
    unit: next.unit,
    category: next.category,
    participantId: next.id,
    byNik: ses.who
  };
  settingsPut_("DRAW_CURRENT", JSON.stringify(current));

  return { ok:true, current };
}

function drawRunAll_(p){
  const token = String(p.token || "").trim();
  const ses = tokenValidate_(token, "trigger");
  if(!ses) throw new Error("Token trigger tidak valid / expired. Login ulang.");

  const shD = sheet_("Draws", ["draw_no","ts","name","unit","category","participant_id","by_nik"]);
  if(shD.getLastRow() > 1) throw new Error("Hasil sudah ada. Gunakan tombol Acak Ulang untuk reset.");

  const parts = participantsReadActive_();
  if(parts.length === 0) throw new Error("Tidak ada peserta aktif untuk diacak.");

  // Pools (shuffled once)
  const poolA = shuffleArr_(parts.filter(x=>x.category==="A"));
  const poolB = shuffleArr_(parts.filter(x=>x.category==="B"));
  const poolC = shuffleArr_(parts.filter(x=>x.category==="C"));

  const rows = [];
  let drawNo = 1;
  let t = new Date().getTime();

  const anyRemain = ()=> poolA.length + poolB.length + poolC.length;

  while(anyRemain() > 0){
    const patIdx = (drawNo - 1) % DRAW_PATTERN.length; // B,A,B,A,C repeat
    const next = chooseNextByPattern_(poolA, poolB, poolC, patIdx);
    if(!next) break;

    // mark inactive
    participantsSetActive_(next.id, false);

    const ts = new Date(t).toISOString();
    rows.push([drawNo, ts, next.name, next.unit, next.category, next.id, ses.who]);
    drawNo++;
    t += 250;
  }

  // batch write
  if(rows.length){
    shD.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  // update current => last
  const last = rows.length ? rows[rows.length-1] : null;
  const current = last ? {
    drawNo: Number(last[0])||0,
    ts: String(last[1]||""),
    name: String(last[2]||""),
    unit: String(last[3]||""),
    category: String(last[4]||""),
    participantId: String(last[5]||""),
    byNik: String(last[6]||"")
  } : {};
  settingsPut_("DRAW_CURRENT", JSON.stringify(current));

  return { ok:true, total: rows.length };
}

// NEW: Reset from Trigger (no admin) — clears draws + re-activates participants
function drawResetByTrigger_(p){
  const token = String(p.token || "").trim();
  const ses = tokenValidate_(token, "trigger");
  if(!ses) throw new Error("Token trigger tidak valid / expired. Login ulang.");
  // reuse admin reset logic (but without admin token)
  return drawsClearInternal_();
}

/** ADMIN */
function adminLogin_(p){
  const user = String(p.username || "").trim();
  const passHash = String(p.passwordHash || "").trim().toLowerCase();
  if(!user || !passHash) throw new Error("Username/password wajib diisi");
  const m = settingsGetMap_();
  const adminUser = String(m.ADMIN_USER || "admin");
  const adminHash = String(m.ADMIN_HASH_SHA256 || "").toLowerCase();
  if(user !== adminUser) throw new Error("Username salah");
  if(passHash !== adminHash) throw new Error("Password salah");
  const tok = tokenNew_("admin", user);
  return { ok:true, token: tok.token, expiresAt: tok.expiresAt, username: user };
}

function adminLogout_(p){
  const token = String(p.token || "").trim();
  const n = tokenRevoke_(token);
  return { ok:true, revoked: n };
}

function adminRequire_(p){
  const token = String(p.token || "").trim();
  const ses = tokenValidate_(token, "admin");
  if(!ses) throw new Error("Admin token tidak valid / expired. Login ulang.");
  return ses;
}

function adminGet_(p){
  adminRequire_(p);
  const m = settingsGetMap_();
  let allowed = [];
  try{ allowed = JSON.parse(m.TRIGGER_ALLOWED_NIKS || "[]") || []; }catch(_){
    allowed = [];
  }
  return {
    ok:true,
    adminUser: String(m.ADMIN_USER || "admin"),
    allowedNiks: allowed,
    tokenTtlMin: Number(m.TOKEN_TTL_MIN || 720)
  };
}

function adminSetPassword_(p){
  adminRequire_(p);
  const newHash = String(p.newHash || "").trim().toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(newHash)) throw new Error("Hash password tidak valid");
  settingsPut_("ADMIN_HASH_SHA256", newHash);
  return { ok:true };
}

function adminSetAllowedNiks_(p){
  adminRequire_(p);
  const json = String(p.allowedJson || "[]");
  let arr = [];
  try{ arr = JSON.parse(json) || []; }catch(_){
    throw new Error("Format NIK tidak valid (harus JSON array)");
  }
  arr = arr.map(x=>String(x).trim()).filter(x=>x);
  settingsPut_("TRIGGER_ALLOWED_NIKS", JSON.stringify(arr));
  return { ok:true, allowedNiks: arr };
}

function participantsList_(p){
  const token = String(p.token || "").trim();
  // allow admin token for full list; without admin token only active items for public
  const isAdmin = !!tokenValidate_(token, "admin");
  const sh = sheet_("Participants", ["id","name","unit","category","active","updated_at"]);
  const last = sh.getLastRow();
  if(last < 2) return { ok:true, items: [] };
  const vals = sh.getRange(2,1,last-1,6).getValues();
  let items = vals.map(r=>({
    id: String(r[0]||""),
    name: String(r[1]||""),
    unit: String(r[2]||""),
    category: String(r[3]||""),
    active: String(r[4]||"TRUE").toUpperCase() === "TRUE",
    updatedAt: String(r[5]||"")
  }));
  if(!isAdmin){
    items = items.filter(x=>x.active);
  }
  return { ok:true, items };
}

function participantsUpsert_(p){
  adminRequire_(p);
  const id = String(p.id || "").trim() || Utilities.getUuid();
  const name = String(p.name || "").trim();
  const unit = String(p.unit || "").trim();
  const category = String(p.category || "").trim().toUpperCase();
  const active = String(p.active || "TRUE").toUpperCase() === "TRUE";
  if(!name || !unit) throw new Error("Name & Unit wajib diisi");
  if(["A","B","C"].indexOf(category)<0) throw new Error("Kategori harus A/B/C");

  const sh = sheet_("Participants", ["id","name","unit","category","active","updated_at"]);
  const last = sh.getLastRow();
  const now = new Date().toISOString();
  if(last < 2){
    sh.appendRow([id,name,unit,category, active ? "TRUE" : "FALSE", now]);
    return { ok:true, id };
  }
  const ids = sh.getRange(2,1,last-1,1).getValues().map(r=>String(r[0]||""));
  const idx = ids.findIndex(x=>x===id);
  if(idx>=0){
    sh.getRange(2+idx,2,1,5).setValues([[name,unit,category, active ? "TRUE":"FALSE", now]]);
  } else {
    sh.appendRow([id,name,unit,category, active ? "TRUE" : "FALSE", now]);
  }
  return { ok:true, id };
}

function participantsDelete_(p){
  adminRequire_(p);
  const id = String(p.id||"").trim();
  if(!id) throw new Error("id wajib");
  const sh = sheet_("Participants", ["id","name","unit","category","active","updated_at"]);
  const last = sh.getLastRow();
  if(last < 2) return { ok:true, deleted:false };
  const ids = sh.getRange(2,1,last-1,1).getValues().map(r=>String(r[0]||""));
  const idx = ids.findIndex(x=>x===id);
  if(idx<0) return { ok:true, deleted:false };
  sh.deleteRow(2+idx);
  return { ok:true, deleted:true };
}

function participantsBulk_(p, body){
  adminRequire_(p);
  const items = body && body.items ? body.items : null;
  if(!Array.isArray(items)) throw new Error("Body.items harus array");
  const sh = sheet_("Participants", ["id","name","unit","category","active","updated_at"]);
  const now = new Date().toISOString();

  // Build index by id
  const last = sh.getLastRow();
  const mapRow = {};
  if(last >= 2){
    const vals = sh.getRange(2,1,last-1,1).getValues();
    vals.forEach((r, i)=>{ const id=String(r[0]||""); if(id) mapRow[id]=2+i; });
  }

  let upserted=0;
  items.forEach(it=>{
    const id = String(it.id || "").trim() || Utilities.getUuid();
    const name = String(it.name || "").trim();
    const unit = String(it.unit || "").trim();
    const category = String(it.category || "").trim().toUpperCase();
    const active = (String(it.active ?? "TRUE").toUpperCase() === "TRUE");
    if(!name || !unit) return;
    if(["A","B","C"].indexOf(category)<0) return;

    const row = mapRow[id];
    if(row){
      sh.getRange(row,2,1,5).setValues([[name,unit,category, active ? "TRUE":"FALSE", now]]);
    } else {
      sh.appendRow([id,name,unit,category, active ? "TRUE":"FALSE", now]);
      mapRow[id]=sh.getLastRow();
    }
    upserted++;
  });
  return { ok:true, upserted };
}

function drawsClear_(p){
  adminRequire_(p);
  return drawsClearInternal_();
}

function drawsClearInternal_(){
  // reset draws and reactivate all participants
  const shD = sheet_("Draws", ["draw_no","ts","name","unit","category","participant_id","by_nik"]);
  if(shD.getLastRow() > 1){
    shD.getRange(2,1,shD.getLastRow()-1, shD.getLastColumn()).clearContent();
  }
  // clear current
  settingsPut_("DRAW_CURRENT", "{}");

  // reactivate participants
  const shP = sheet_("Participants", ["id","name","unit","category","active","updated_at"]);
  const last = shP.getLastRow();
  if(last >= 2){
    const now = new Date().toISOString();
    const range = shP.getRange(2,1,last-1,6);
    const vals = range.getValues();
    for(let i=0;i<vals.length;i++){ vals[i][4] = "TRUE"; vals[i][5]=now; }
    range.setValues(vals);
  }
  return { ok:true };
}

/** Helpers */
function participantsReadActive_(){
  const sh = sheet_("Participants", ["id","name","unit","category","active","updated_at"]);
  const last = sh.getLastRow();
  if(last < 2) return [];
  const vals = sh.getRange(2,1,last-1,6).getValues();
  return vals
    .map(r=>({
      id:String(r[0]||""),
      name:String(r[1]||""),
      unit:String(r[2]||""),
      category:String(r[3]||"").toUpperCase(),
      active:String(r[4]||"TRUE").toUpperCase()==="TRUE"
    }))
    .filter(x=>x.id && x.active && ["A","B","C"].indexOf(x.category)>=0);
}

function participantsSetActive_(id, active){
  const sh = sheet_("Participants", ["id","name","unit","category","active","updated_at"]);
  const last = sh.getLastRow();
  if(last < 2) return false;
  const ids = sh.getRange(2,1,last-1,1).getValues().map(r=>String(r[0]||""));
  const idx = ids.findIndex(x=>x===id);
  if(idx<0) return false;
  sh.getRange(2+idx, 5).setValue(active ? "TRUE" : "FALSE");
  sh.getRange(2+idx, 6).setValue(new Date().toISOString());
  return true;
}

function chooseNextByPattern_(poolA, poolB, poolC, startIdx){
  // startIdx = index pola yang diinginkan saat ini (0..DRAW_PATTERN.length-1)
  // best-effort: coba kategori sesuai pola dari startIdx maju, lalu fallback kategori apa saja
  const pick = (cat)=>{
    if(cat==="A" && poolA.length) return poolA.shift();
    if(cat==="B" && poolB.length) return poolB.shift();
    if(cat==="C" && poolC.length) return poolC.shift();
    return null;
  };

  // 1) coba sesuai urutan pola mulai dari startIdx (wrap)
  for(let k=0;k<DRAW_PATTERN.length;k++){
    const idx = (startIdx + k) % DRAW_PATTERN.length;
    const cat = DRAW_PATTERN[idx];
    const it = pick(cat);
    if(it) return it;
  }

  // 2) fallback kategori apa saja yang masih ada
  return pick("B") || pick("A") || pick("C") || null;
}

function shuffleArr_(arr){
  // Fisher-Yates shuffle (in-place) using Math.random
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random() * (i+1));
    const t = arr[i]; arr[i]=arr[j]; arr[j]=t;
  }
  return arr;
}

function hashCode_(str){
  // simple deterministic hash for shuffling
  let h = 0;
  for (let i=0;i<str.length;i++){
    h = ((h<<5)-h) + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}
