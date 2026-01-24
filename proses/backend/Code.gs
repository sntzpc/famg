// Konfigurasi
const CONFIG = {
  sheetId: '1jwYoZfkzJIG_qkWPcx5pjqmeFfeIR_60ccdr5TbKNIY',
  sheetNames: {
    participants: 'participants',
    data_staff: 'data_staff'
  }
};

/**
 * Web App endpoint (CORS-safe via JSONP)
 *
 * Cara pakai dari frontend statis:
 *   <GAS_URL>?action=dashboard&callback=myFn
 *
 * Jika parameter callback tidak ada, akan mengembalikan JSON biasa.
 */
function doGet(e){
  return handleHttp_(e);
}

function doPost(e){
  return handleHttp_(e);
}

function handleHttp_(e){
  const p = (e && e.parameter) ? e.parameter : {};
  const action = String(p.action || '').trim() || 'dashboard';
  const cb = String(p.callback || '').trim();

  let payload;
  try{
    if(action === 'dashboard'){
      payload = getDashboardData();
    } else if(action === 'ping'){
      payload = { success:true, message:'ok', now: new Date().toISOString() };
    } else {
      payload = { success:false, message:'Unknown action', action };
    }
  }catch(err){
    payload = { success:false, message:'Server error', error: String(err) };
  }

  const json = JSON.stringify(payload);
  if(cb){
    return ContentService
      .createTextOutput(`${cb}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// Fungsi untuk mengambil semua data dashboard dengan error handling yang lebih baik
function getDashboardData() {
  try {
    // Buka spreadsheet
    let spreadsheet;
    try {
      spreadsheet = SpreadsheetApp.openById(CONFIG.sheetId);
    } catch (e) {
      console.error('Error opening spreadsheet:', e);
      return {
        success: false,
        error: 'Tidak dapat mengakses Google Sheet. Pastikan Sheet ID benar dan Anda memiliki akses.',
        message: 'Spreadsheet Error'
      };
    }
    
    // Ambil data dari kedua sheet
    const participants = getSheetData(spreadsheet, CONFIG.sheetNames.participants);
    const staff = getSheetData(spreadsheet, CONFIG.sheetNames.data_staff);
    
    console.log('Participants count:', participants.length);
    console.log('Staff count:', staff.length);
    
    // Jika tidak ada data staff, beri pesan error
    if (staff.length === 0) {
      return {
        success: false,
        error: 'Tidak ada data staff ditemukan. Pastikan sheet "data_staff" memiliki data.',
        message: 'Data Kosong'
      };
    }
    
    // Normalisasi staff unik by NIK
    const staffByNik = {};
    staff.forEach(s => {
      const nik = (s.nik || '').toString().trim();
      if(!nik) return;
      if(!staffByNik[nik]) staffByNik[nik] = s;
    });
    const staffList = Object.keys(staffByNik).map(k => staffByNik[k]);

    // Set NIK peserta terdaftar (unik)
    const regSet = {};
    participants.forEach(p => {
      const nik = (p.nik || '').toString().trim();
      if(nik) regSet[nik] = true;
    });

    // Hitung statistik (hanya staff yang terdaftar)
    const totalStaff = staffList.length;
    const registeredStaffCount = staffList.reduce((acc, s) => {
      const nik = (s.nik || '').toString().trim();
      return acc + (nik && regSet[nik] ? 1 : 0);
    }, 0);
    const registrationRate = totalStaff > 0 ? (registeredStaffCount / totalStaff) * 100 : 0;
    
    // Hitung statistik per region
    const regions = {};
    staffList.forEach(s => {
      const region = (s.region || 'Unknown').toString().trim();
      const regionKey = region.toLowerCase();
      
      if (!regions[regionKey]) {
        regions[regionKey] = {
          name: region,
          total: 0,
          registered: 0
        };
      }
      regions[regionKey].total++;
      const nik = (s.nik || '').toString().trim();
      if(nik && regSet[nik]) regions[regionKey].registered++;
    });
    
    // Hitung statistik per unit
    const units = {};
    staffList.forEach(s => {
      const unit = (s.unit || 'Unknown').toString().trim();
      const unitKey = unit.toLowerCase();
      
      if (!units[unitKey]) {
        units[unitKey] = {
          name: unit,
          total: 0,
          registered: 0,
          region: (s.region || 'Unknown').toString().trim()
        };
      }
      units[unitKey].total++;
      const nik = (s.nik || '').toString().trim();
      if(nik && regSet[nik]) units[unitKey].registered++;
    });
    
    // Data peserta yang belum mendaftar
    const registeredNiks = Object.keys(regSet);
    const unregisteredStaff = staffList.filter(s => {
      const nik = s.nik ? s.nik.toString() : '';
      return !registeredNiks.includes(nik);
    });
    
    // Format response
    return {
      success: true,
      data: {
        summary: {
          totalStaff,
          registeredCount: registeredStaffCount,
          registrationRate: parseFloat(registrationRate.toFixed(2)),
          unregisteredCount: Math.max(0, totalStaff - registeredStaffCount)
        },
        regions: Object.values(regions).map(region => ({
          ...region,
          percentage: region.total > 0 ? parseFloat(((region.registered / region.total) * 100).toFixed(2)) : 0
        })),
        units: Object.values(units).map(unit => ({
          ...unit,
          percentage: unit.total > 0 ? parseFloat(((unit.registered / unit.total) * 100).toFixed(2)) : 0
        })),
        registeredParticipants: participants,
        unregisteredStaff: unregisteredStaff // kirim semua, filtering di frontend
      },
      lastUpdated: new Date().toISOString(),
      message: 'Data berhasil diambil'
    };
  } catch (error) {
    console.error('Error in getDashboardData:', error);
    return {
      success: false,
      error: error.toString(),
      message: 'Gagal mengambil data dari Google Sheets',
      lastUpdated: new Date().toISOString()
    };
  }
}

// Fungsi untuk mengambil data dari sheet dengan error handling
function getSheetData(spreadsheet, sheetName) {
  try {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      console.error(`Sheet "${sheetName}" tidak ditemukan`);
      return [];
    }
    
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    
    if (lastRow <= 1 || lastColumn < 1) {
      console.log(`Sheet "${sheetName}" kosong atau hanya memiliki header`);
      return [];
    }
    
    const dataRange = sheet.getRange(1, 1, lastRow, lastColumn);
    const values = dataRange.getValues();
    
    if (!values || values.length <= 1) {
      return [];
    }
    
    // Ambil header dan normalisasi (ubah ke lowercase, ganti spasi dengan underscore)
    const headers = values[0].map(h => {
      if (!h) return '';
      return h.toString()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/\./g, '');
    });
    
    // Konversi ke array of objects
    const data = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const obj = {};
      
      headers.forEach((header, index) => {
        if (header && row[index] !== undefined && row[index] !== '') {
          obj[header] = row[index];
        }
      });
      
      // Hanya tambah jika ada minimal NIK atau nama
      if (obj.nik || obj.name) {
        // Pastikan NIK selalu string untuk konsistensi
        if (obj.nik) {
          obj.nik = obj.nik.toString().trim();
        }
        
        // Pastikan nama selalu string
        if (obj.name) {
          obj.name = obj.name.toString().trim();
        }
        
        data.push(obj);
      }
    }
    
    console.log(`Data dari sheet "${sheetName}":`, data.length, 'records');
    return data;
  } catch (error) {
    console.error(`Error reading sheet ${sheetName}:`, error);
    return [];
  }
}

// Fungsi untuk mencari peserta
function searchParticipants(searchTerm) {
  try {
    if (!searchTerm || searchTerm.trim() === '') {
      // Jika search kosong, kembalikan semua data
      const dashboardData = getDashboardData();
      if (dashboardData.success) {
        return dashboardData.data.registeredParticipants;
      }
      return [];
    }
    
    const spreadsheet = SpreadsheetApp.openById(CONFIG.sheetId);
    const participants = getSheetData(spreadsheet, CONFIG.sheetNames.participants);
    
    const term = searchTerm.toLowerCase().trim();
    return participants.filter(p => {
      return (
        (p.name && p.name.toString().toLowerCase().includes(term)) ||
        (p.nik && p.nik.toString().toLowerCase().includes(term)) ||
        (p.region && p.region.toString().toLowerCase().includes(term)) ||
        (p.unit && p.unit.toString().toLowerCase().includes(term))
      );
    });
  } catch (error) {
    console.error('Error in searchParticipants:', error);
    return [];
  }
}

// Fungsi untuk mencari staff yang belum mendaftar
function searchUnregisteredStaff(searchTerm) {
  try {
    if (!searchTerm || searchTerm.trim() === '') {
      // Jika search kosong, kembalikan semua data
      const dashboardData = getDashboardData();
      if (dashboardData.success) {
        return dashboardData.data.unregisteredStaff;
      }
      return [];
    }
    
    const spreadsheet = SpreadsheetApp.openById(CONFIG.sheetId);
    const participants = getSheetData(spreadsheet, CONFIG.sheetNames.participants);
    const staff = getSheetData(spreadsheet, CONFIG.sheetNames.data_staff);
    
    const registeredNiks = participants.map(p => p.nik ? p.nik.toString() : '');
    const unregisteredStaff = staff.filter(s => {
      const nik = s.nik ? s.nik.toString() : '';
      return !registeredNiks.includes(nik);
    });
    
    const term = searchTerm.toLowerCase().trim();
    return unregisteredStaff.filter(s => {
      return (
        (s.name && s.name.toString().toLowerCase().includes(term)) ||
        (s.nik && s.nik.toString().toLowerCase().includes(term)) ||
        (s.region && s.region.toString().toLowerCase().includes(term)) ||
        (s.unit && s.unit.toString().toLowerCase().includes(term))
      );
    });
  } catch (error) {
    console.error('Error in searchUnregisteredStaff:', error);
    return [];
  }
}

// Fungsi untuk mendapatkan statistik real-time
function getRealTimeStats() {
  try {
    const dashboardData = getDashboardData();
    if (!dashboardData.success) {
      return {
        success: false,
        error: dashboardData.error,
        message: dashboardData.message
      };
    }
    
    return {
      success: true,
      summary: dashboardData.data.summary,
      lastUpdated: new Date().toISOString(),
      message: 'Statistik berhasil diambil'
    };
  } catch (error) {
    return {
      success: false,
      error: error.toString(),
      message: 'Gagal mengambil statistik'
    };
  }
}

// Catatan: fungsi data contoh sengaja dihapus agar tidak ada data dummy di backend.