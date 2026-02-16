// Konfigurasi
const SPREADSHEET_ID = '1GOqDTBaRZb6PjX1kHKIZnebNJ4QIENr7cVnoMjZZHqE';
const SHEET_NAME = 'attendance';

// ===== PATCH START: normalize (case-insensitive grouping) + display uppercase =====
function _normKey(v){
  v = (v === null || v === undefined) ? '' : String(v);
  // rapikan: trim + collapse spasi + lowercase untuk key
  return v.trim().replace(/\s+/g,' ').toLowerCase();
}
function _dispUpper(v){
  v = (v === null || v === undefined) ? '' : String(v);
  // rapikan: trim + collapse spasi + tampil uppercase
  return v.trim().replace(/\s+/g,' ').toUpperCase();
}
// ===== PATCH END =====


// ===== PATCH START: JSONP-friendly doGet/doPost =====
function doGet(e) {
  e = e || {};
  var params = (e.parameter || {});
  var action = params.action || "";
  var callback = params.callback; // untuk JSONP

  var result;
  try {
    switch (action) {
      case 'getRegions':
        result = getRegions();
        break;
      case 'getUnits':
        result = getUnits(params.region);
        break;
      case 'getParticipants':
        result = getParticipants(params.region, params.unit);
        break;
      case 'getAllData':
        result = getAllData();
        break;
      case 'ping':
        result = { success:true, ts: new Date().toISOString() };
        break;
      default:
        result = { success: false, error: 'Invalid action' };
    }
  } catch (err) {
    result = { success: false, error: String(err && err.stack ? err.stack : err) };
  }

  var json = JSON.stringify(result);

  // === JSONP mode (paling aman terhadap CORS, cocok untuk Chrome mobile) ===
  if (callback) {
    // sanitasi callback (hindari karakter aneh)
    callback = String(callback).replace(/[^\w.$]/g, '');
    var js = callback + "(" + json + ");";
    return ContentService
      .createTextOutput(js)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  // === Normal JSON mode (untuk akses langsung, bukan dari browser beda domain) ===
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  // untuk kompatibilitas: POST diarahkan ke GET logic
  return doGet(e);
}
// ===== PATCH END =====

// Mendapatkan daftar region unik
function getRegions() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var regionIndex = headers.indexOf('region');
  var unitIndex   = headers.indexOf('unit');
  var famIdx      = headers.indexOf('family_json');

  var regions = {}; // key: region_norm

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    var rawRegion = row[regionIndex];
    var rawUnit   = row[unitIndex];

    var rKey  = _normKey(rawRegion);
    var rDisp = _dispUpper(rawRegion);

    var uKey  = _normKey(rawUnit);
    var uDisp = _dispUpper(rawUnit);

    if (!rKey) continue; // skip region kosong

    if (!regions[rKey]) {
      regions[rKey] = {
        key: rKey,              // untuk pemanggilan API berikutnya
        name: rDisp,            // TAMPILAN: HURUF KAPITAL
        units: {},              // key: unit_norm -> {key,name,count}
        totalParticipants: 0
      };
    } else {
      // pastikan display name tetap uppercase versi "rapi"
      regions[rKey].name = rDisp || regions[rKey].name;
    }

    if (uKey) {
      if (!regions[rKey].units[uKey]) {
        regions[rKey].units[uKey] = { key: uKey, name: uDisp, count: 0 };
      } else {
        regions[rKey].units[uKey].name = uDisp || regions[rKey].units[uKey].name;
      }
    }

    // hitung jumlah peserta (family_json jika ada)
    var addCount = 1;
    try {
      var fam = famIdx >= 0 ? JSON.parse(row[famIdx]) : null;
      if (Array.isArray(fam) && fam.length > 0) addCount = fam.length;
    } catch (e) {}

    if (uKey) regions[rKey].units[uKey].count += addCount;
    regions[rKey].totalParticipants += addCount;
  }

  // output: unit list tetap berbentuk object agar frontend Anda tetap kompatibel
  var out = Object.keys(regions).map(function(rk){
    var r = regions[rk];
    var unitsObj = {};
    Object.keys(r.units).forEach(function(uk){
      unitsObj[uk] = r.units[uk].count; // kompatibel dengan Object.keys(region.units).length
    });
    return {
      key: r.key,
      name: r.name,
      units: unitsObj,
      totalParticipants: r.totalParticipants
    };
  });

  return { success: true, data: out };
}

// Mendapatkan daftar unit berdasarkan region
function getUnits(region) {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var regionIndex = headers.indexOf('region');
  var unitIndex   = headers.indexOf('unit');
  var famIdx      = headers.indexOf('family_json');

  var rKeyReq = _normKey(region);
  var units = {}; // key: unit_norm

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    var rKeyRow = _normKey(row[regionIndex]);
    if (rKeyRow !== rKeyReq) continue;

    var rawUnit = row[unitIndex];
    var uKey = _normKey(rawUnit);
    var uDisp = _dispUpper(rawUnit);
    if (!uKey) continue;

    if (!units[uKey]) {
      units[uKey] = { key: uKey, name: uDisp, totalParticipants: 0 };
    } else {
      units[uKey].name = uDisp || units[uKey].name;
    }

    var addCount = 1;
    try {
      var fam = famIdx >= 0 ? JSON.parse(row[famIdx]) : null;
      if (Array.isArray(fam) && fam.length > 0) addCount = fam.length;
    } catch (e) {}

    units[uKey].totalParticipants += addCount;
  }

  return { success: true, data: Object.keys(units).map(k => units[k]) };
}

// Mendapatkan daftar peserta berdasarkan region dan unit
function getParticipants(region, unit) {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var regionIndex = headers.indexOf('region');
  var unitIndex   = headers.indexOf('unit');
  var idIndex = headers.indexOf('id');
  var eventIdIndex = headers.indexOf('event_id');
  var nikIndex = headers.indexOf('nik');
  var nameIndex = headers.indexOf('name');
  var familyJsonIndex = headers.indexOf('family_json');
  var timestampIndex = headers.indexOf('timestamp');

  var rKeyReq = _normKey(region);
  var uKeyReq = _normKey(unit);

  var participants = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    if (_normKey(row[regionIndex]) !== rKeyReq) continue;
    if (_normKey(row[unitIndex]) !== uKeyReq) continue;

    var family = [];
    try { family = JSON.parse(row[familyJsonIndex]); if (!Array.isArray(family)) family = []; } catch(e) {}

    participants.push({
      id: row[idIndex],
      eventId: row[eventIdIndex],
      nik: row[nikIndex],
      name: row[nameIndex],
      // tampilkan uppercase yang rapi
      region: _dispUpper(row[regionIndex]),
      unit: _dispUpper(row[unitIndex]),
      family: family,
      timestamp: row[timestampIndex]
    });
  }

  return { success: true, data: participants };
}

// Mendapatkan semua data untuk tabel
function getAllData() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  var allData = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowData = {};
    
    for (var j = 0; j < headers.length; j++) {
      if (headers[j] === 'family_json') {
        try {
          var family = JSON.parse(row[j]);
          rowData['family_members'] = family.join(', ');
          rowData['total_family'] = family.length;
        } catch(e) {
          rowData['family_members'] = row[j];
          rowData['total_family'] = 1;
        }
      } else {
        rowData[headers[j]] = row[j];
      }
    }
    
    allData.push(rowData);
  }
  
  return {
    success: true,
    data: allData,
    headers: headers
  };
}