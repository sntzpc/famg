/**
 * FG2026 - Gala Dinner Dashboard Backend (Google Apps Script)
 * Data source: Google Sheet attendance
 *
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 */

const CFG = {
  SHEET_ID: '1jwYoZfkzJIG_qkWPcx5pjqmeFfeIR_60ccdr5TbKNIY',
  SHEET_ATTENDANCE: 'attendance',
  CACHE_SEC: 2 // cache ringan untuk mengurangi beban (detik)
};

function doGet(e){ return handle_(e); }
function doPost(e){ return handle_(e); }

function handle_(e){
  try{
    const p = (e && e.parameter) ? e.parameter : {};
    const action = String(p.action || '').trim();

    if(action === 'public.getSummary'){
      const eventId = String(p.event_id || '').trim();
      const out = publicGetSummary_(eventId);
      return json_(out);
    }

    return json_({ ok:false, error:'Unknown action' });
  }catch(err){
    return json_({ ok:false, error: String(err && err.message || err) });
  }
}

// -------------------- Public API --------------------

function publicGetSummary_(eventId){
  const cacheKey = 'gala_summary_' + (eventId || 'ALL');
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if(cached){
    try{ return JSON.parse(cached); }catch(_){}
  }

  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  const sh = ss.getSheetByName(CFG.SHEET_ATTENDANCE);
  if(!sh) throw new Error('Sheet not found: ' + CFG.SHEET_ATTENDANCE);

  const values = sh.getDataRange().getValues();
  if(!values || values.length < 2){
    const empty = {
      ok:true,
      event_id: eventId || '',
      generated_at: new Date().toISOString(),
      rows_count: 0,
      totals: { staff:0, pasangan:0, anak:0, keluarga:0, total:0 },
      regions: [],
      units: []
    };
    cache.put(cacheKey, JSON.stringify(empty), CFG.CACHE_SEC);
    return empty;
  }

  const header = values[0].map(x => String(x||'').trim());
  const idx = indexMap_(header);

  // Required columns
  const need = ['event_id','region','unit','family_json'];
  need.forEach(k=>{
    if(!(k in idx)) throw new Error('Header not found in attendance: ' + k);
  });

  const totals = { staff:0, pasangan:0, anak:0, keluarga:0, total:0 };
  const regionMap = {}; // region -> agg
  const unitMap = {};   // region|unit -> agg

  let rowsCount = 0;

  for(let r=1;r<values.length;r++){
    const row = values[r];
    if(!row || row.length===0) continue;

    const ev = String(row[idx.event_id] || '').trim();
    if(eventId && ev !== eventId) continue;

    const region = String(row[idx.region] || '').trim() || '-';
    const unit   = String(row[idx.unit] || '').trim() || '-';

    const famRaw = row[idx.family_json];
    const members = parseFamily_(famRaw);

    const cat = categorizeMembers_(members);
    // If family_json empty, still count staff by row (fallback)
    if(members.length === 0){
      cat.staff += 1;
    }

    // totals
    addAgg_(totals, cat);

    // region
    if(!regionMap[region]) regionMap[region] = makeAgg_(region);
    addAgg_(regionMap[region], cat);

    // unit
    const key = region + '||' + unit;
    if(!unitMap[key]) unitMap[key] = makeAggUnit_(region, unit);
    addAgg_(unitMap[key], cat);

    rowsCount++;
  }

  totals.total = totals.staff + totals.pasangan + totals.anak + totals.keluarga;

  const regions = Object.keys(regionMap).sort().map(k=>{
    const a = regionMap[k];
    a.total = a.staff + a.pasangan + a.anak + a.keluarga;
    return a;
  });

  const units = Object.keys(unitMap).sort().map(k=>{
    const a = unitMap[k];
    a.total = a.staff + a.pasangan + a.anak + a.keluarga;
    return a;
  });

  const out = {
    ok: true,
    event_id: eventId || '',
    generated_at: new Date().toISOString(),
    rows_count: rowsCount,
    totals: totals,
    regions: regions,
    units: units
  };

  cache.put(cacheKey, JSON.stringify(out), CFG.CACHE_SEC);
  return out;
}

// -------------------- Helpers --------------------

function indexMap_(header){
  const m = {};
  for(let i=0;i<header.length;i++){
    const k = String(header[i]||'').trim();
    if(k) m[k] = i;
  }
  return m;
}

function json_(obj){
  const output = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);

  // CORS headers (best effort). Some environments ignore this.
  try{
    // eslint-disable-next-line no-undef
    return output.setHeader('Access-Control-Allow-Origin', '*')
                 .setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
                 .setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }catch(_){
    return output;
  }
}

function parseFamily_(val){
  // family_json can be JSON string, already array, or blank
  if(val === null || val === undefined) return [];
  if(Array.isArray(val)) return val.map(String);
  const s = String(val).trim();
  if(!s) return [];
  try{
    const arr = JSON.parse(s);
    if(Array.isArray(arr)) return arr.map(x=>String(x||''));
    return [];
  }catch(_){
    return [];
  }
}

function categorizeMembers_(members){
  const out = { staff:0, pasangan:0, anak:0, keluarga:0, total:0 };

  for(let i=0;i<members.length;i++){
    const t = String(members[i]||'').trim();
    if(!t) continue;

    const role = extractRole_(t);
    if(role === 'Peserta Utama') out.staff++;
    else if(role === 'Suami' || role === 'Istri') out.pasangan++;
    else if(role === 'Anak') out.anak++;
    else if(role === 'Orang Tua' || role === 'Lainnya') out.keluarga++;
    else {
      // unknown role -> keluarga (lebih aman)
      out.keluarga++;
    }
  }

  out.total = out.staff + out.pasangan + out.anak + out.keluarga;
  return out;
}

function extractRole_(s){
  // "Nama (Role)" -> Role
  const m = String(s||'').match(/\(([^()]+)\)\s*$/);
  return m ? String(m[1]).trim() : '';
}

function makeAgg_(region){
  return { region: region, staff:0, pasangan:0, anak:0, keluarga:0, total:0 };
}
function makeAggUnit_(region, unit){
  return { region: region, unit: unit, staff:0, pasangan:0, anak:0, keluarga:0, total:0 };
}

function addAgg_(agg, cat){
  agg.staff += Number(cat.staff||0);
  agg.pasangan += Number(cat.pasangan||0);
  agg.anak += Number(cat.anak||0);
  agg.keluarga += Number(cat.keluarga||0);
  agg.total = agg.staff + agg.pasangan + agg.anak + agg.keluarga;
}
