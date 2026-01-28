var SHEET_NAME = "Kendaraan";
var SPREADSHEET_ID = "1sVmDbB0DxQWRsx9CTqCZMwf5kLgCkTT0br1ykmVUpGw";


// === SHEET REGION (mapping Unit -> Region) ===
var REGION_SHEET_NAME = "Region";

function getRegionMap_(){
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(REGION_SHEET_NAME);
  if(!sh) return {};
  var values = sh.getDataRange().getValues();
  if(values.length <= 1) return {};

  // cari kolom Unit & Region dengan header fleksibel
  var headers = values[0].map(function(h){ return String(h||'').trim().toLowerCase(); });
  var colUnit = -1, colRegion = -1;
  for(var i=0;i<headers.length;i++){
    var h = headers[i];
    if(colUnit === -1 && h.indexOf('unit') !== -1) colUnit = i;
    if(colRegion === -1 && (h.indexOf('region') !== -1 || h.indexOf('wilayah') !== -1)) colRegion = i;
  }
  // fallback sederhana: asumsi 2 kolom pertama (Region, Unit) atau (Unit, Region)
  if(colUnit === -1 || colRegion === -1){
    if(headers.length >= 2){
      if(colUnit === -1 && (headers[0].indexOf('unit') !== -1)) colUnit = 0;
      if(colRegion === -1 && (headers[1].indexOf('region') !== -1 || headers[1].indexOf('wilayah') !== -1)) colRegion = 1;
      if(colUnit === -1 && (headers[1].indexOf('unit') !== -1)) colUnit = 1;
      if(colRegion === -1 && (headers[0].indexOf('region') !== -1 || headers[0].indexOf('wilayah') !== -1)) colRegion = 0;
    }
  }
  if(colUnit === -1 || colRegion === -1){
    // coba tebak: kolom yang isi mayoritas 4 huruf kapital = Unit
    var guessUnit = -1, guessRegion = -1;
    for(var c=0;c<Math.min(headers.length,6);c++){
      var unitLike=0, nonEmpty=0;
      for(var r=1;r<values.length;r++){
        var v = String(values[r][c]||'').trim();
        if(!v) continue;
        nonEmpty++;
        if(/^[A-Z]{4}$/.test(v)) unitLike++;
      }
      if(nonEmpty>0 && unitLike/nonEmpty > 0.6){ guessUnit = c; break; }
    }
    if(guessUnit !== -1){
      guessRegion = (guessUnit===0 && headers.length>1) ? 1 : 0;
      colUnit = guessUnit; colRegion = guessRegion;
    }
  }

  var map = {};
  for(var r=1;r<values.length;r++){
    var unit = String(values[r][colUnit]||'').trim();
    var region = String(values[r][colRegion]||'').trim();
    if(unit) map[unit] = region || '';
  }
  return map;
}

// Skema kolom terbaru (ditambah: Catatan)
var HEADERS = [
  "id",
  "Unit",
  "Code",
  "Type",
  "Capacity",
  "Driver",
  "DriverPhone",
  "Catatan",
  "CreatedAt",
  "UpdatedAt"
];

function doGet(e) {
  return handleRequest_(e);
}

function doPost(e) {
  // Optional: kalau suatu saat Anda pakai fetch POST JSON, ini tetap bisa.
  return handleRequest_(e);
}

function handleRequest_(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var action = String(p.action || "").trim();

    if (!action) {
      return respond_({ success: false, message: "Action tidak ditemukan" }, p.callback);
    }

    var result;
    switch (action) {
      case "getData":
        result = getData_(String(p.unit || "").trim());
        break;

      // ADMIN: ambil semua data (untuk dashboard)
      case "getAllData":
        result = getAllData_();
        break;

      case "addData":
        result = addData_({
          unit: String(p.unit || "").trim(),
          code: String(p.code || "").trim(),
          type: String(p.type || "").trim(),
          capacity: String(p.capacity || "").trim(),
          driver: String(p.driver || "").trim(),
          driverPhone: String(p.driverPhone || "").trim(),
          catatan: String(p.catatan || "").trim()
        });
        break;

      case "updateData":
        result = updateData_({
          id: String(p.id || "").trim(),
          unit: String(p.unit || "").trim(),
          code: String(p.code || "").trim(),
          type: String(p.type || "").trim(),
          capacity: String(p.capacity || "").trim(),
          driver: String(p.driver || "").trim(),
          driverPhone: String(p.driverPhone || "").trim(),
          catatan: String(p.catatan || "").trim()
        });
        break;

      case "deleteData":
        result = deleteData_(String(p.id || "").trim());
        break;

      default:
        result = { success: false, message: "Action tidak valid: " + action };
    }

    return respond_(result, p.callback);
  } catch (err) {
    return respond_({ success: false, message: String(err) }, (e && e.parameter) ? e.parameter.callback : "");
  }
}

// ---------- RESPONSE (JSON / JSONP) ----------
function respond_(obj, callback) {
  var json = JSON.stringify(obj);

  // JSONP
  if (callback && String(callback).trim()) {
    var cb = String(callback).replace(/[^\w$.]/g, ""); // sanitasi callback name
    return ContentService
      .createTextOutput(cb + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  // JSON biasa
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- SHEET HELPERS ----------
function getSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_NAME);

  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight("bold");
    sh.setFrozenRows(1);
    return sh;
  }

  // Migrasi sederhana: pastikan header sesuai skema terbaru.
  // Jika kolom "Catatan" belum ada, tambahkan sebelum CreatedAt.
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight("bold");
    sh.setFrozenRows(1);
    return sh;
  }

  var existingHeaders = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h){
    return String(h || "").trim();
  });

  var hasCatatan = existingHeaders.indexOf("Catatan") !== -1;
  var hasCreated = existingHeaders.indexOf("CreatedAt") !== -1;
  var hasUpdated = existingHeaders.indexOf("UpdatedAt") !== -1;

  if (!hasCatatan) {
    // Insert kolom Catatan di posisi setelah DriverPhone (kolom 7) -> Catatan jadi kolom 8
    sh.insertColumnAfter(7);
    sh.getRange(1, 8).setValue("Catatan").setFontWeight("bold");
  }

  // Pastikan CreatedAt & UpdatedAt ada (jika sheet lama belum lengkap)
  // Taruh di ujung kanan agar aman.
  existingHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(h){
    return String(h || "").trim();
  });
  if (!hasCreated) {
    sh.insertColumnAfter(sh.getLastColumn());
    sh.getRange(1, sh.getLastColumn()).setValue("CreatedAt").setFontWeight("bold");
  }
  existingHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(h){
    return String(h || "").trim();
  });
  if (!hasUpdated) {
    sh.insertColumnAfter(sh.getLastColumn());
    sh.getRange(1, sh.getLastColumn()).setValue("UpdatedAt").setFontWeight("bold");
  }

  return sh;
}

function toPhone62_(phoneRaw) {
  var phone = String(phoneRaw || "").trim();
  if (!phone) return "";
  if (phone.startsWith("0")) return "62" + phone.substring(1);
  return phone;
}

function parseCapacity_(v) {
  var n = parseInt(String(v || "").trim(), 10);
  return isNaN(n) ? "" : n;
}

function uuid_() {
  return Utilities.getUuid();
}

function headerMap_(sh) {
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h || "").trim();
  });
  var m = {};
  headers.forEach(function (h, idx) {
    if (h) m[h] = idx; // zero-based index
  });
  return m;
}

// ---------- ACTIONS ----------
function getData_(unit) {
  try {
    if (!unit || unit.length !== 4) {
      return { success: true, data: [] };
    }

    var sh = getSheet_();
    var values = sh.getDataRange().getValues();
    if (values.length <= 1) return { success: true, data: [] };

    var idx = headerMap_(sh);
    var regionMap = getRegionMap_();

    var out = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (String(row[idx.Unit] || "") === unit) {
        out.push({
          id: String(row[idx.id] || ""),
          Unit: String(row[idx.Unit] || ""),
          Region: String(regionMap[String(row[idx.Unit]||'').trim()] || ''),
          Code: String(row[idx.Code] || ""),
          Type: String(row[idx.Type] || ""),
          Capacity: row[idx.Capacity] === "" ? "" : row[idx.Capacity],
          Driver: String(row[idx.Driver] || ""),
          DriverPhone: String(row[idx.DriverPhone] || ""),
          Catatan: String(row[idx.Catatan] || ""),
          CreatedAt: row[idx.CreatedAt] || "",
          UpdatedAt: row[idx.UpdatedAt] || ""
        });
      }
    }

    return { success: true, data: out };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

// ADMIN: ambil semua data tanpa filter unit (untuk dashboard)
function getAllData_() {
  try {
    var sh = getSheet_();
    var values = sh.getDataRange().getValues();
    if (values.length <= 1) return { success: true, data: [] };

    var idx = headerMap_(sh);
    var regionMap = getRegionMap_();
    var out = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      out.push({
        id: String(row[idx.id] || ""),
        Unit: String(row[idx.Unit] || ""),
        Region: String(regionMap[String(row[idx.Unit]||'').trim()] || ''),
        Code: String(row[idx.Code] || ""),
        Type: String(row[idx.Type] || ""),
        Capacity: row[idx.Capacity] === "" ? "" : row[idx.Capacity],
        Driver: String(row[idx.Driver] || ""),
        DriverPhone: String(row[idx.DriverPhone] || ""),
        Catatan: String(row[idx.Catatan] || ""),
        CreatedAt: row[idx.CreatedAt] || "",
        UpdatedAt: row[idx.UpdatedAt] || ""
      });
    }
    return { success: true, data: out };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

function addData_(d) {
  // NOTE: getDocumentLock() bisa null pada script standalone.
  // Pakai ScriptLock agar aman untuk WebApp.
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var unit = String(d.unit || "").trim();
    var code = String(d.code || "").trim();
    var type = String(d.type || "").trim();
    var capacity = parseCapacity_(d.capacity);
    var driver = String(d.driver || "").trim();
    var driverPhone = toPhone62_(d.driverPhone);
    var catatan = String(d.catatan || "").trim();

    if (!unit || !code || !type || !capacity || !driver || !driverPhone) {
      return { success: false, message: "Semua field harus diisi" };
    }

    // cek duplikat code dalam unit yg sama
    var existing = getData_(unit);
    if (existing.success) {
      for (var i = 0; i < existing.data.length; i++) {
        if (String(existing.data[i].Code) === code) {
          return { success: false, message: "Kode sudah ada dalam unit ini" };
        }
      }
    }

    var sh = getSheet_();
    var id = uuid_();
    var ts = new Date();

    // Urutan harus mengikuti HEADERS
    sh.appendRow([id, unit, code, type, capacity, driver, driverPhone, catatan, ts, ts]);

    return { success: true, message: "Data berhasil ditambahkan", id: id };
  } catch (err) {
    return { success: false, message: String(err) };
  } finally {
    lock.releaseLock();
  }
}

function updateData_(d) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var id = String(d.id || "").trim();
    var unit = String(d.unit || "").trim();
    var code = String(d.code || "").trim();
    var type = String(d.type || "").trim();
    var capacity = parseCapacity_(d.capacity);
    var driver = String(d.driver || "").trim();
    var driverPhone = toPhone62_(d.driverPhone);
    var catatan = String(d.catatan || "").trim();

    if (!id) return { success: false, message: "ID kosong" };
    if (!unit || !code || !type || !capacity || !driver || !driverPhone) {
      return { success: false, message: "Semua field harus diisi" };
    }

    var sh = getSheet_();
    var idx = headerMap_(sh);
    var values = sh.getDataRange().getValues();

    var rowIndex = -1;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0] || "") === id) {
        rowIndex = i + 1; // sheet row number
        break;
      }
    }
    if (rowIndex === -1) return { success: false, message: "Data tidak ditemukan" };

    // optional: cegah duplikat code utk unit tsb (kecuali record ini sendiri)
    for (var j = 1; j < values.length; j++) {
      if (j + 1 === rowIndex) continue;
      if (String(values[j][idx.Unit] || "") === unit && String(values[j][idx.Code] || "") === code) {
        return { success: false, message: "Kode sudah ada dalam unit ini" };
      }
    }

    // update berdasarkan header map (lebih tahan perubahan kolom)
    sh.getRange(rowIndex, idx.Unit + 1).setValue(unit);
    sh.getRange(rowIndex, idx.Code + 1).setValue(code);
    sh.getRange(rowIndex, idx.Type + 1).setValue(type);
    sh.getRange(rowIndex, idx.Capacity + 1).setValue(capacity);
    sh.getRange(rowIndex, idx.Driver + 1).setValue(driver);
    sh.getRange(rowIndex, idx.DriverPhone + 1).setValue(driverPhone);
    if (idx.Catatan !== undefined) sh.getRange(rowIndex, idx.Catatan + 1).setValue(catatan);
    if (idx.UpdatedAt !== undefined) sh.getRange(rowIndex, idx.UpdatedAt + 1).setValue(new Date());

    return { success: true, message: "Data berhasil diupdate" };
  } catch (err) {
    return { success: false, message: String(err) };
  } finally {
    lock.releaseLock();
  }
}

function deleteData_(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (!id) return { success: false, message: "ID kosong" };

    var sh = getSheet_();
    var values = sh.getDataRange().getValues();

    var rowIndex = -1;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0] || "") === id) {
        rowIndex = i + 1;
        break;
      }
    }
    if (rowIndex === -1) return { success: false, message: "Data tidak ditemukan" };

    sh.deleteRow(rowIndex);
    return { success: true, message: "Data berhasil dihapus" };
  } catch (err) {
    return { success: false, message: String(err) };
  } finally {
    lock.releaseLock();
  }
}
