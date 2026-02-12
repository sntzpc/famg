  let currentUnit = localStorage.getItem('currentUnit');
  let currentUnitData = [];
  let currentGroups = [];
  let groupModalOpen = false;
  let isEditing = false;

  // ADMIN dashboard state
  const ADMIN_TOKEN = 'ADMIN';
  let adminAllData = [];              // seluruh data dari semua unit
  let adminUnitStats = [];            // [{unit,region,count,capSum}]
  let adminRegionStats = [];          // [{region,count,capSum,unitCount}]
  let adminSelectedRegion = '';       // region aktif (filter unit list)
  let adminSelectedUnit = '';         // unit aktif di tabel detail
  let adminLastRows = [];             // cache rows yg dirender (untuk pencarian)
  let lastRenderedRows = [];          // cache rows unit-mode (untuk print all + search)

  // ========= MODERN NOTIFY (Toast) + CONFIRM =========
  const toastHost = () => document.getElementById('toastHost');
  function toast(message, type = 'info', timeout = 2800) {
    const host = toastHost();
    if (!host) return alert(message);

    const icons = {
      success: '<i class="fa-solid fa-circle-check"></i>',
      error: '<i class="fa-solid fa-triangle-exclamation"></i>',
      warn: '<i class="fa-solid fa-circle-exclamation"></i>',
      info: '<i class="fa-solid fa-circle-info"></i>'
    };
    const styles = {
      success: 'bg-emerald-600',
      error: 'bg-rose-600',
      warn: 'bg-amber-600',
      info: 'bg-slate-900'
    };

    const el = document.createElement('div');
    el.className = `toast-enter rounded-2xl shadow-2xl border border-white/10 ${styles[type] || styles.info} text-white px-4 py-3 flex items-start gap-3`;
    el.innerHTML = `
      <div class="mt-0.5 w-6 h-6 rounded-xl bg-white/15 flex items-center justify-center">${icons[type] || icons.info}</div>
      <div class="text-sm leading-snug font-semibold">${String(message || '')}</div>
    `;
    host.prepend(el);
    requestAnimationFrame(() => el.classList.add('toast-enter-active'));

    const remove = () => {
      el.classList.remove('toast-enter-active');
      el.classList.add('toast-exit-active');
      setTimeout(() => el.remove(), 220);
    };
    setTimeout(remove, timeout);
    el.addEventListener('click', remove);
  }

  function confirmDialog(message, title = 'Konfirmasi') {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      const t = document.getElementById('confirmTitle');
      const m = document.getElementById('confirmMsg');
      const bOk = document.getElementById('confirmOk');
      const bCancel = document.getElementById('confirmCancel');
      if (!modal || !t || !m || !bOk || !bCancel) {
        resolve(window.confirm(message));
        return;
      }
      t.textContent = title;
      m.textContent = message;
      modal.classList.remove('hidden');
      modal.classList.add('flex');

      const cleanup = () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        bOk.onclick = null;
        bCancel.onclick = null;
      };
      bOk.onclick = () => { cleanup(); resolve(true); };
      bCancel.onclick = () => { cleanup(); resolve(false); };
    });
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>\"]/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    }[c]));
  }

  // Escape untuk HTML attribute (value="", data-*, dll)
  function escapeAttr(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // GAS URL (/exec) tetap boleh, karena JSONP akan lolos redirect 302
  const GAS_URL_EXEC = 'https://script.google.com/macros/s/AKfycbzLl_IVnLc3tcwl_emxiCGyq8aNJplz1Bcy6hf7SaH9lP4jhHCSrzGWmiCHyDoOrh9M-Q/exec';

  const GAS_URL_GUC = 'PASTE_URL_GOOGLEUSERCONTENT_DISINI'; // <- WAJIB Anda isi

  // cache base yang pernah berhasil
  const LS_KEY_LAST_GOOD_BASE = 'fg_kendaraan_last_good_base_v1';

  // -------------------------
  // JSONP helpers (mobile-safe)
  // -------------------------
  function buildJsonpUrl(baseUrl, params, cbName){
    const q = new URLSearchParams({
      ...params,
      callback: cbName,
      _t: Date.now().toString()
    });
    return baseUrl + (baseUrl.includes('?') ? '&' : '?') + q.toString();
  }

  function jsonpCallOnce(baseUrl, params, timeoutMs = 30000){
    return new Promise((resolve, reject) => {
      const cb = '__fg_jsonp_' + Date.now() + '_' + Math.random().toString(16).slice(2);
      let script = null;
      let done = false;

      const cleanUp = () => {
        try { delete window[cb]; } catch(e){ window[cb] = undefined; }
        if(script && script.parentNode) script.parentNode.removeChild(script);
      };

      const timer = setTimeout(() => {
        if(done) return;
        done = true;
        cleanUp();
        reject(new Error('Timeout: Tidak ada respon dari server (JSONP).'));
      }, timeoutMs);

      window[cb] = (data) => {
        if(done) return;
        done = true;
        clearTimeout(timer);
        cleanUp();
        resolve(data);
      };

      const url = buildJsonpUrl(baseUrl, params, cb);

      script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.src = url;

      // kompatibilitas Chrome mobile
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer-when-downgrade';

      script.onerror = () => {
        if(done) return;
        done = true;
        clearTimeout(timer);
        cleanUp();
        reject(new Error('Gagal memuat JSONP. URL tidak publik / diblokir / salah base URL.'));
      };

      document.head.appendChild(script);
    });
  }

  function getBaseCandidates(){
    const list = [];

    const lastGood = (localStorage.getItem(LS_KEY_LAST_GOOD_BASE) || '').trim();
    if(lastGood) list.push(lastGood);

    const guc = String(GAS_URL_GUC || '').trim();
    if(guc && guc !== 'PASTE_URL_GOOGLEUSERCONTENT_DISINI') list.push(guc);

    list.push(GAS_URL_EXEC);

    return Array.from(new Set(list));
  }

  async function jsonpCall(params, timeoutMs = 30000){
    const candidates = getBaseCandidates();
    let lastErr = null;

    for(const baseUrl of candidates){
      try{
        const res = await jsonpCallOnce(baseUrl, params, timeoutMs);
        localStorage.setItem(LS_KEY_LAST_GOOD_BASE, baseUrl);
        return res;
      }catch(err){
        lastErr = err;
      }
    }

    const hint =
      'Pastikan Web App GAS: Execute as Me, Who has access: Anyone. ' +
      'Dan pastikan GAS_URL_GUC benar (script.googleusercontent.com).';

    throw new Error(((lastErr && lastErr.message) ? lastErr.message : 'Gagal memuat data') + ' | ' + hint);
  }

  // -------------------------
  // API wrapper (pakai jsonpCall dengan params {action,...})
  // -------------------------
  async function apiCall(action, params = {}, timeoutMs = 30000){
    return await jsonpCall({ action, ...params }, timeoutMs);
  }

 
  // ========= THEME (Light/Dark) =========
  const THEME_KEY = 'kend_theme';
  function getTheme(){
    return localStorage.getItem(THEME_KEY) || 'dark';
  }
  function applyTheme(theme){
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    const html = isDark
      ? '<i class="fa-solid fa-sun mr-2"></i><span class="hidden sm:inline">Light</span>'
      : '<i class="fa-solid fa-moon mr-2"></i><span class="hidden sm:inline">Dark</span>';
    const btn = document.getElementById('btnTheme');
    const btnA = document.getElementById('btnThemeAdmin');
    if(btn) btn.innerHTML = html;
    if(btnA) btnA.innerHTML = html;
  }
  function toggleTheme(){
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  // ========= UI INIT =========
  document.addEventListener('DOMContentLoaded', function() {
    applyTheme(getTheme());
    const btnTheme = document.getElementById('btnTheme');
    if(btnTheme) btnTheme.addEventListener('click', toggleTheme);
    const btnThemeAdmin = document.getElementById('btnThemeAdmin');
    if(btnThemeAdmin) btnThemeAdmin.addEventListener('click', toggleTheme);

    if (currentUnit === ADMIN_TOKEN) {
      // Admin dashboard
      document.getElementById('adminContainer')?.classList.remove('hidden');
      loadAdminData();
    } else if (currentUnit && currentUnit.length === 4) {
      // Unit mode
      document.getElementById('mainContainer').classList.remove('hidden');
      document.getElementById('currentUnit').textContent = currentUnit;
      loadData();
    } else {
      document.getElementById('unitModal').classList.remove('hidden');
    }

    document.getElementById('kodeJenis').addEventListener('change', function() {
      if (!isEditing) generateNextCode();
    });

    const q = document.getElementById('qSearch');
    if(q){
      q.addEventListener('input', () => renderTable());
    }

    const qa = document.getElementById('adminSearch');
    if(qa){
      qa.addEventListener('input', () => renderAdminTable());
    }
    const gf = document.getElementById('adminGroupFilter');
    if(gf){
      gf.addEventListener('change', () => renderAdminTable());
    }
    const sort = document.getElementById('adminSort');
    if(sort){
      sort.addEventListener('change', () => renderAdminUnitList());
    }

  });

  function setUnit() {
    const unitName = document.getElementById('unitName').value.toUpperCase().trim();
    const unitError = document.getElementById('unitError');

    const isAdmin = unitName === ADMIN_TOKEN;
    const isUnit4 = (unitName.length === 4 && /^[A-Z]+$/.test(unitName));
    if (!isAdmin && !isUnit4) {
      unitError.classList.remove('hidden');
      return;
    }

    unitError.classList.add('hidden');
    currentUnit = unitName;
    localStorage.setItem('currentUnit', unitName);

    document.getElementById('unitModal').classList.add('hidden');

    // Switch view
    if (isAdmin) {
      document.getElementById('mainContainer')?.classList.add('hidden');
      document.getElementById('adminContainer')?.classList.remove('hidden');
      loadAdminData();
    } else {
      document.getElementById('adminContainer')?.classList.add('hidden');
      document.getElementById('mainContainer')?.classList.remove('hidden');
      document.getElementById('currentUnit').textContent = unitName;
      loadData();
    }
  }

  function showUnitModal() {
    document.getElementById('unitModal').classList.remove('hidden');
    // Kosongkan input agar jelas saat ganti mode
    const input = document.getElementById('unitName');
    if(input){ input.value = ''; input.focus(); }
  }

  function generateNextCode() {
    const kodeJenis = document.getElementById('kodeJenis').value;
    if (!kodeJenis) return;

    const allCodes = currentUnitData.map(item => item.Code);
    let maxNumber = 0;

    allCodes.forEach(code => {
      const match = String(code || '').match(/-\d+$/);
      if (match) {
        const num = parseInt(match[0].substring(1), 10);
        if (!isNaN(num) && num > maxNumber) maxNumber = num;
      }
    });

    const nextNumber = (maxNumber + 1).toString().padStart(2, '0');
    document.getElementById('kodeNumber').textContent = nextNumber;
    document.getElementById('fullCode').textContent = `${currentUnit}${kodeJenis}-${nextNumber}`;
  }

  // ========= LOAD DATA (JSONP) =========
  async function loadData() {
    try {
      const data = await apiCall('getData', { unit: currentUnit });

      if (data && data.success) {
        currentUnitData = data.data || [];
        await loadGroups(currentUnit);
        renderTable();
        if (!isEditing) generateNextCode();
      } else {
        toast('Error: ' + (data && data.message ? data.message : 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('loadData error:', error);
      toast('Gagal memuat data (cek koneksi / deployment GAS)', 'error');
    }
  }

  // ========= LOAD GROUPS =========
  async function loadGroups(unitOverride) {
    try {
      const unit = String(unitOverride || currentUnit || '').trim();
      // admin / invalid unit -> kosongkan saja
      if (!unit || unit === ADMIN_TOKEN || unit.length !== 4) {
        currentGroups = [];
        syncGroupSelectUI(currentGroups);
        return { success: true, groups: [] };
      }

      const res = await apiCall('groups.list', { unit });
      currentGroups = (res && res.success && Array.isArray(res.groups)) ? res.groups : [];
      syncGroupSelectUI(currentGroups);
      if (groupModalOpen) renderGroupModal();
      return { success: true, groups: currentGroups };
    } catch (err) {
      console.warn('loadGroups error', err);
      currentGroups = [];
      syncGroupSelectUI(currentGroups);
      return { success: false, groups: [] };
    }
  }

  function syncGroupSelectUI(groups) {
    const sel = document.getElementById('groupSelect');
    if (!sel) return;
    const list = Array.isArray(groups) ? groups : (currentGroups || []);
    const currentVal = sel.value || '';
    sel.innerHTML = '<option value="">- Tanpa Group -</option>' +
      list.map(g => `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join('');
    if (currentVal && list.includes(currentVal)) sel.value = currentVal;
  }

  function renderTable() {
    const tableBody = document.getElementById('dataTable');
    tableBody.innerHTML = '';

    const q = (document.getElementById('qSearch')?.value || '').trim().toLowerCase();
    const rows = q
      ? currentUnitData.filter(item => {
          const hay = [
            item.Code, item.Type, item.Capacity,
            item.Driver, item.DriverPhone, item.Catatan, item.Group
          ].map(v => String(v||'').toLowerCase()).join(' ');
          return hay.includes(q);
        })
      : currentUnitData;

    lastRenderedRows = rows;

    rows.forEach((item) => {
      const row = document.createElement('tr');
      row.className = 'hover:bg-gray-50';
      row.innerHTML = `
        <td class="px-4 py-3 whitespace-nowrap">
          <div class="font-bold">${item.Code || ''}</div>
          ${item.Group ? `<div class="inline-flex mt-1 items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">${escapeHtml(item.Group)}</div>` : ''}
          <div class="text-xs text-slate-500">${item.DriverPhone || ''}</div>
          ${item.Catatan ? `<div class="text-xs text-slate-500 italic mt-0.5">${escapeHtml(item.Catatan)}</div>` : ''}
        </td>
        <td class="px-4 py-3 whitespace-nowrap">
          <div>${item.Type || ''}</div>
          <div class="text-xs text-gray-500">Capacity: ${item.Capacity || ''}</div>
        </td>
        <td class="px-4 py-3 whitespace-nowrap">${item.Driver || ''}</td>
        <td class="px-4 py-3 whitespace-nowrap">
          <div class="flex gap-2">
            <button onclick="editData('${item.id}')" class="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-1 px-3 rounded text-xs">
              <i class="fas fa-edit"></i>
            </button>
            <button onclick="deleteData('${item.id}')" class="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-xs">
              <i class="fas fa-trash"></i>
            </button>
            <button onclick="printQRCode('${item.Code}')" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-xs">
              <i class="fas fa-qrcode"></i>
            </button>
          </div>
        </td>
      `;
      tableBody.appendChild(row);
    });
  }

  // ========= ADMIN DASHBOARD =========
  async function loadAdminData(){
    try{
      const res = await apiCall('getAllData', {});
      if(!res || !res.success){
        toast('Error: ' + (res && res.message ? res.message : 'Unknown error'), 'error');
        return;
      }
      adminAllData = res.data || [];
      buildAdminStats();
      renderAdminSummary();
      renderAdminRegionList();
      renderAdminUnitList();

      // auto-select unit pertama jika belum ada
      if(!adminSelectedUnit){
        adminSelectedUnit = adminUnitStats[0] ? adminUnitStats[0].unit : '';
      }
      renderAdminTable();

      const elLast = document.getElementById('adminLastUpd');
      if(elLast) elLast.textContent = new Date().toLocaleString('id-ID');
    }catch(err){
      console.error('loadAdminData error:', err);
      toast('Gagal memuat data ADMIN (cek koneksi / deployment GAS)', 'error');
    }
  }

  
function buildAdminStats(){
  const unitMap = new Map();
  const regionMap = new Map();

  for(const r of adminAllData){
    const u = String(r.Unit||'').trim();
    if(!u) continue;
    const region = String(r.Region||'').trim() || 'Tanpa Region';

    // unit stats
    if(!unitMap.has(u)) unitMap.set(u, {unit:u, region, count:0, capSum:0});
    const us = unitMap.get(u);
    us.count += 1;
    const cap = parseInt(String(r.Capacity||'').trim(), 10);
    if(!isNaN(cap)) us.capSum += cap;

    // region stats
    if(!regionMap.has(region)) regionMap.set(region, {region, count:0, capSum:0, units:new Set()});
    const rs = regionMap.get(region);
    rs.count += 1;
    if(!isNaN(cap)) rs.capSum += cap;
    rs.units.add(u);
  }

  adminUnitStats = Array.from(unitMap.values()).sort((a,b)=> b.count - a.count);
  adminRegionStats = Array.from(regionMap.values())
    .map(x => ({ region:x.region, count:x.count, capSum:x.capSum, unitCount:x.units.size }))
    .sort((a,b)=> b.count - a.count);

  // jika region terpilih tidak ada lagi, reset
  if(adminSelectedRegion && !adminRegionStats.some(x => x.region === adminSelectedRegion)){
    adminSelectedRegion = '';
  }
}

function renderAdminSummary(){
    const totalRegion = adminRegionStats.length;
    const totalUnit = adminUnitStats.length;
    const totalRow = adminAllData.length;
    const totalCap = adminUnitStats.reduce((a,b)=> a + (b.capSum||0), 0);
    const elG = document.getElementById('statTotalRegion');
    const elU = document.getElementById('statTotalUnit');
    const elR = document.getElementById('statTotalRow');
    const elC = document.getElementById('statTotalCap');
    if(elG) elG.textContent = String(totalRegion);
    if(elU) elU.textContent = String(totalUnit);
    if(elR) elR.textContent = String(totalRow);
    if(elC) elC.textContent = String(totalCap);
  }

function renderAdminRegionList(){
  const host = document.getElementById('adminRegionList');
  const meta = document.getElementById('adminRegionMeta');
  if(!host) return;

  host.innerHTML = '';
  const total = adminAllData.length;

  // tombol "Semua Region"
  const btnAll = document.createElement('button');
  btnAll.type = 'button';
  btnAll.className = `w-full text-left rounded-2xl px-4 py-3 border ${adminSelectedRegion ? 'border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-white/5' : 'border-indigo-200/70 dark:border-indigo-400/30 bg-indigo-50/70 dark:bg-indigo-500/10'} hover:bg-slate-50 dark:hover:bg-white/10 transition`;
  btnAll.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="font-extrabold">Semua Region</div>
      <div class="text-xs px-2 py-1 rounded-full bg-slate-900 text-white">${total}</div>
    </div>
    <div class="text-xs text-slate-500 mt-1">Menampilkan semua unit</div>
  `;
  btnAll.addEventListener('click', () => {
    adminSelectedRegion = '';
    renderAdminRegionList();
    renderAdminRegionList();
      renderAdminUnitList();
      renderAdminTable();
    });
  host.appendChild(btnAll);

  adminRegionStats.forEach(r => {
    const active = r.region === adminSelectedRegion;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `w-full text-left rounded-2xl px-4 py-3 border ${active ? 'border-indigo-200/70 dark:border-indigo-400/30 bg-indigo-50/70 dark:bg-indigo-500/10' : 'border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-white/5'} hover:bg-slate-50 dark:hover:bg-white/10 transition`;
    btn.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div>
          <div class="font-extrabold">${escapeHtml(r.region)}</div>
          <div class="text-xs text-slate-500 mt-0.5">${r.unitCount} unit</div>
        </div>
        <div class="text-xs px-2 py-1 rounded-full bg-slate-900 text-white">${r.count}</div>
      </div>
      <div class="text-xs text-slate-500 mt-1">Kapasitas sum: ${escapeHtml(String(r.capSum||0))}</div>
    `;
    btn.addEventListener('click', () => {
      adminSelectedRegion = r.region;
      // reset unit jika tidak termasuk region terpilih
      if(adminSelectedUnit){
        const u = adminUnitStats.find(x => x.unit === adminSelectedUnit);
        if(!u || (String(u.region||'').trim()||'Tanpa Region') !== adminSelectedRegion){
          adminSelectedUnit = '';
        }
      }
      renderAdminRegionList();
      renderAdminUnitList();
      renderAdminTable();
    });
    host.appendChild(btn);
  });

  if(meta){
    if(!adminSelectedRegion) meta.textContent = `Total ${adminRegionStats.length} region`;
    else{
      const r = adminRegionStats.find(x => x.region === adminSelectedRegion);
      meta.textContent = r ? `${r.unitCount} unit • ${r.count} kendaraan` : '';
    }
  }
}



  function renderAdminUnitList(){
    const host = document.getElementById('adminUnitList');
    if(!host) return;
    host.innerHTML = '';
    const sort = document.getElementById('adminSort')?.value || 'count_desc';
    let arr = [...adminUnitStats];
    // filter berdasarkan region (jika dipilih)
    if(adminSelectedRegion){
      arr = arr.filter(x => (String(x.region||'').trim() || 'Tanpa Region') === adminSelectedRegion);
    }
    if(sort === 'count_asc') arr.sort((a,b)=> a.count - b.count);
    else if(sort === 'unit_asc') arr.sort((a,b)=> a.unit.localeCompare(b.unit));
    else arr.sort((a,b)=> b.count - a.count);

    arr.forEach(s => {
      const active = s.unit === adminSelectedUnit;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `w-full text-left rounded-2xl px-4 py-3 border ${active ? 'border-sky-500 bg-sky-500/10' : 'border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5'} hover:bg-slate-50 dark:hover:bg-white/10 transition`;
      btn.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="font-extrabold tracking-wide">${escapeHtml(s.unit)}</div>
          <div class=\"text-xs text-slate-500 mt-0.5\">${escapeHtml(String(s.region||'')||'Tanpa Region')}</div>
          <div class="text-xs ${active ? 'text-sky-700 dark:text-sky-200' : 'text-slate-600 dark:text-white/60'}">${s.count} data</div>
        </div>
        <div class="mt-1 text-xs text-slate-500 dark:text-white/60">Kapasitas sum: <b>${s.capSum}</b></div>
      `;
      btn.onclick = () => {
        adminSelectedUnit = s.unit;
        renderAdminUnitList();
        renderAdminTable();
      };
      host.appendChild(btn);
    });
  }

  function adminGetGroupsForUnit(unit){
    const u = String(unit||'').trim();
    const set = new Set();
    adminAllData.forEach(r=>{
      if(String(r.Unit||'').trim()===u){
        const g = String(r.Group||'').trim();
        if(g) set.add(g);
      }
    });
    return Array.from(set).sort((a,b)=> a.localeCompare(b));
  }

  async function adminSetGroup(id, unit, group){
    const g = String(group||'').trim();
    const u = String(unit||'').trim();
    try{
      const act = g ? 'vehicle.setGroup' : 'vehicle.clearGroup';
      const res = await apiCall(act, { id, unit: u, group: g });
      if(res && res.success){
        // update local cache
        const row = adminAllData.find(x => x.id === id);
        if(row) row.Group = g;
        toast('Group diperbarui', 'success');
        renderAdminTable();
      }else{
        toast('Gagal set group: ' + (res && res.message ? res.message : 'Unknown'), 'error');
      }
    }catch(err){
      console.error('adminSetGroup error', err);
      toast('Gagal set group', 'error');
    }
  }

  function renderAdminTable(){
    const tbody = document.getElementById('adminTable');
    if(!tbody) return;
    tbody.innerHTML = '';
    const title = document.getElementById('adminUnitTitle');
    const meta = document.getElementById('adminUnitMeta');
    if(title) title.textContent = adminSelectedUnit || '-';

    if(!adminSelectedUnit){
      if(meta) meta.textContent = 'Pilih unit di panel kiri.';
      return;
    }

    const stat = adminUnitStats.find(x => x.unit === adminSelectedUnit);
    if(meta && stat) meta.textContent = `${stat.count} kendaraan • Kapasitas sum: ${stat.capSum}`;

    // build group filter options for this unit
    const gf = document.getElementById('adminGroupFilter');
    const groups = adminGetGroupsForUnit(adminSelectedUnit);
    if(gf){
      const cur = gf.value || 'all';
      gf.innerHTML = `<option value="all">Semua Group</option>` +
        `<option value="">Tanpa Group</option>` +
        groups.map(g=> `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join('');
      // restore selection if possible
      if(cur === 'all' || cur === '' || groups.includes(cur)) gf.value = cur;
      else gf.value = 'all';
    }
    const selectedGroup = gf ? (gf.value || 'all') : 'all';

    const q = (document.getElementById('adminSearch')?.value || '').trim().toLowerCase();
    let rows = adminAllData.filter(r => String(r.Unit||'') === adminSelectedUnit);

    if(selectedGroup !== 'all'){
      rows = rows.filter(r => String(r.Group||'').trim() === String(selectedGroup||'').trim());
    }

    if(q){
      rows = rows.filter(item => {
        const hay = [item.Unit,item.Group,item.Code,item.Type,item.Capacity,item.Driver,item.DriverPhone,item.Catatan]
          .map(v => String(v||'').toLowerCase()).join(' ');
        return hay.includes(q);
      });
    }
    adminLastRows = rows;

    rows.forEach(item => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50';
      const unitGroups = groups; // same unit
      const gval = String(item.Group||'').trim();
      const optHtml =
        `<option value="">- Tanpa -</option>` +
        unitGroups.map(g=> `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join('');

      tr.innerHTML = `
        <td class="px-4 py-3 whitespace-nowrap">
          <div class="font-bold">${escapeHtml(item.Code||'')}</div>
          <div class="text-xs text-slate-500">${escapeHtml(item.DriverPhone||'')}</div>
          ${item.Catatan ? `<div class="text-xs text-slate-500 italic mt-0.5">${escapeHtml(item.Catatan)}</div>` : ''}
        </td>
        <td class="px-4 py-3 whitespace-nowrap">
          <div>${escapeHtml(item.Type||'')}</div>
          <div class="text-xs text-gray-500">Capacity: ${escapeHtml(item.Capacity||'')}</div>
        </td>
        <td class="px-4 py-3 whitespace-nowrap">${escapeHtml(item.Driver||'')}</td>
        <td class="px-4 py-3 whitespace-nowrap">
          <select class="px-2 py-1 rounded-lg border border-slate-200/70 dark:border-white/10 bg-white/90 dark:bg-white/10 text-slate-900 dark:text-white text-sm"
                  data-admin-group="${escapeAttr(item.id)}">
            ${optHtml}
          </select>
          <div class="text-[11px] text-slate-500 dark:text-white/50 mt-1">${escapeHtml(item.Unit||'')}</div>
        </td>
      `;
      tbody.appendChild(tr);

      // set select value + bind change
      const sel = tr.querySelector('[data-admin-group]');
      if(sel){
        sel.value = gval; // '' if none
        sel.addEventListener('change', ()=> adminSetGroup(item.id, item.Unit, sel.value));
      }
    });
  }
function adminOpenUnitAsUser(){
    if(!adminSelectedUnit) return toast('Pilih unit dulu.', 'warn');
    currentUnit = adminSelectedUnit;
    localStorage.setItem('currentUnit', currentUnit);
    document.getElementById('adminContainer')?.classList.add('hidden');
    document.getElementById('mainContainer')?.classList.remove('hidden');
    document.getElementById('currentUnit').textContent = currentUnit;
    toast('Masuk mode unit: ' + currentUnit, 'success');
    loadData();
  }

  // ========= SAVE/UPDATE VIA JSONP (ANTI CORS) =========
  async function saveVehicle() {
    const formData = {
      id: document.getElementById('editId').value,
      unit: currentUnit,
      code: document.getElementById('fullCode').textContent,
      group: (document.getElementById('groupSelect')?.value || '').trim(),
      type: document.getElementById('type').value,
      capacity: document.getElementById('capacity').value,
      driver: document.getElementById('driver').value,
      driverPhone: document.getElementById('driverPhone').value,
      catatan: document.getElementById('catatan').value
    };

    if (!formData.code || !formData.type || !formData.capacity || !formData.driver || !formData.driverPhone) {
      toast('Semua field wajib (kecuali Catatan) harus diisi.', 'warn');
      return;
    }

    let phone = String(formData.driverPhone).trim();
    if (phone.startsWith('0')) phone = '62' + phone.substring(1);
    formData.driverPhone = phone;

    const saveBtn = document.getElementById('saveBtn');
    const spinner = document.getElementById('saveSpinner');
    saveBtn.disabled = true;
    spinner.classList.remove('hidden');

    try {
      const action = isEditing ? 'updateData' : 'addData';
      const result = await apiCall(action, formData);

      if (result && result.success) {
        toast(isEditing ? 'Data berhasil diupdate' : 'Data berhasil disimpan', 'success');
        resetForm();
        await loadData();
      } else {
        toast('Error: ' + (result && result.message ? result.message : 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('saveVehicle error:', error);
      toast('Gagal menyimpan data', 'error');
    } finally {
      saveBtn.disabled = false;
      spinner.classList.add('hidden');
    }
  }

  function editData(id) {
    const item = currentUnitData.find(d => d.id === id);
    if (!item) return;

    isEditing = true;
    document.getElementById('editId').value = id;

    // Code format: SRIEKD-01 (4 + 2 + 1 + 2)
    document.getElementById('kodeJenis').value = String(item.Code || '').substring(4, 6);
    document.getElementById('kodeNumber').textContent = String(item.Code || '').substring(7);
    document.getElementById('fullCode').textContent = item.Code || '';

    const gs = document.getElementById('groupSelect');
    if(gs){ gs.value = (item.Group || ''); }

    document.getElementById('type').value = item.Type || '';
    document.getElementById('capacity').value = item.Capacity || '';
    document.getElementById('driver').value = item.Driver || '';
    document.getElementById('driverPhone').value = item.DriverPhone || '';
    document.getElementById('catatan').value = item.Catatan || '';

    document.getElementById('cancelBtn').classList.remove('hidden');
    document.getElementById('vehicleForm').scrollIntoView({ behavior: 'smooth' });
  }

  function cancelEdit() {
    isEditing = false;
    resetForm();
  }

  async function deleteData(id) {
    const ok = await confirmDialog('Apakah Anda yakin ingin menghapus data ini?', 'Hapus Data');
    if (!ok) return;

    try {
      const result = await apiCall('deleteData', { id });

      if (result && result.success) {
        toast('Data berhasil dihapus', 'success');
        await loadData();
      } else {
        toast('Error: ' + (result && result.message ? result.message : 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('deleteData error:', error);
      toast('Gagal menghapus data', 'error');
    }
  }

  function resetForm() {
    isEditing = false;
    document.getElementById('vehicleForm').reset();
    document.getElementById('editId').value = '';
    document.getElementById('cancelBtn').classList.add('hidden');
    document.getElementById('kodeNumber').textContent = '';
    document.getElementById('fullCode').textContent = '';

    if (document.getElementById('kodeJenis').value) generateNextCode();
  }

  // ========= PRINT =========
  
function ensureQr(targetEl, text, sizePx=900){
    if (!targetEl) return;
    targetEl.innerHTML = '';
    // qrcodejs will append <img> or <canvas>
    new QRCode(targetEl, {
      text: String(text || ''),
      width: sizePx,
      height: sizePx,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  function printQRCode(code) {
    const printContent = document.getElementById('printContent');
    printContent.innerHTML = '';

    const found = currentUnitData.find(x => String(x.Code||'') === String(code||''));
    const cat = found && found.Catatan ? String(found.Catatan) : '';

    const wrap = document.createElement('div');
    wrap.className = 'qr-print qr-sheet page-break';
    wrap.innerHTML = `
      <div class="qr-code-text">${escapeHtml(String(code))}</div>
      <div class="qr-big flex items-center justify-center rounded-2xl bg-white p-3 shadow-lg"></div>
      ${cat ? `<div class="mt-4 text-lg text-slate-700 italic">${escapeHtml(cat)}</div>` : ''}
      <div class="qr-meta text-slate-700">Unit: <b>${escapeHtml(String(currentUnit||''))}</b> • Dicetak: ${new Date().toLocaleString('id-ID')}</div>
    `;
    printContent.appendChild(wrap);

    const qrBox = wrap.querySelector('.qr-big');
    // Render high-res QR, it will scale to A4 via CSS (.qr-big)
    ensureQr(qrBox, code, 1200);

    document.getElementById('printModal').classList.remove('hidden');
  }

  function printAllQRCodes() {
    const printContent = document.getElementById('printContent');
    printContent.innerHTML = '';

    const rows = lastRenderedRows && lastRenderedRows.length ? lastRenderedRows : currentUnitData;
    rows.forEach(item => {
      const code = item.Code;
      const cat = item && item.Catatan ? String(item.Catatan) : '';

      const wrap = document.createElement('div');
      wrap.className = 'qr-print qr-sheet page-break';
      wrap.innerHTML = `
        <div class="qr-code-text">${escapeHtml(String(code))}</div>
        <div class="qr-big flex items-center justify-center rounded-2xl bg-white p-3 shadow-lg"></div>
        ${cat ? `<div class="mt-4 text-lg text-slate-700 italic">${escapeHtml(cat)}</div>` : ''}
        <div class="qr-meta text-slate-700">Unit: <b>${escapeHtml(String(currentUnit||''))}</b></div>
      `;
      printContent.appendChild(wrap);

      const qrBox = wrap.querySelector('.qr-big');
      ensureQr(qrBox, code, 1200);
    });

    document.getElementById('printModal').classList.remove('hidden');
  }


  function closePrintModal() {
    document.getElementById('printModal').classList.add('hidden');
  }

  // =========================
  // GROUP UI (Drag & Drop)
  // =========================

  async function createGroup(){
    if(!currentUnit) return;
    const btn = document.getElementById('btnCreateGroup');
    const sp = document.getElementById('createGroupSpinner');
    if(btn) btn.disabled = true;
    if(sp) sp.classList.remove('hidden');
    try{
      const res = await apiCall('groups.create', { unit: currentUnit });
      if(res && res.success){
        toast('Group dibuat: ' + res.group, 'success');
        await loadGroups();
        await loadData(); // refresh list (jaga-jaga ada perubahan)
        renderGroupModal();
      }else{
        toast('Gagal membuat group: ' + (res && res.message ? res.message : 'Unknown'), 'error');
      }
    }catch(err){
      console.error('createGroup error', err);
      toast('Gagal membuat group', 'error');
    }finally{
      if(btn) btn.disabled = false;
      if(sp) sp.classList.add('hidden');
    }
  }

  // =========================
  // GROUP DELETE
  // =========================
  async function deleteGroup(groupName){
    groupName = String(groupName || '').trim();
    if(!currentUnit || !groupName) return;

    // hitung anggota (client-side) untuk UX cepat
    const members = (currentUnitData||[]).filter(v => String(v.Group||'').trim() === groupName);
    if(members.length > 0){
      toast(`Group "${groupName}" masih dipakai (${members.length} kendaraan). Pindahkan dulu ke Tanpa Group.`, 'warn', 3800);
      return;
    }

    const ok = await confirmDialog(`Hapus group "${groupName}"?`, 'Hapus Group');
    if(!ok) return;

    try{
      // backend tetap cek ulang agar aman
      const res = await apiCall('groups.delete', { unit: currentUnit, group: groupName });

      if(res && res.success){
        toast(`Group dihapus: ${groupName}`, 'success');
        await loadGroups();      // refresh list group
        // tidak wajib loadData karena kendaraan sudah 0 anggota (tidak ada perubahan data kendaraan)
        renderGroupModal();
        syncGroupSelectUI(currentGroups);
      }else{
        const msg = (res && res.message) ? res.message : 'Gagal menghapus group';
        toast(msg, 'error', 4000);
        // jika ternyata backend bilang masih dipakai, refresh data & modal biar konsisten
        await loadData();
        await loadGroups();
        renderGroupModal();
      }
    }catch(err){
      console.error('deleteGroup error', err);
      toast('Gagal menghapus group', 'error');
    }
  }

  function renderGroupModal(){
    const ungroupList = document.getElementById('ungroupList');
    const ungroupCount = document.getElementById('ungroupCount');
    const board = document.getElementById('groupsBoard');
    const ungroupDrop = document.getElementById('ungroupDrop');
    if(!ungroupList || !board || !ungroupDrop) return;

    // drop zone events (clear group)
    wireDropZone(ungroupDrop, '');

    const ungrouped = (currentUnitData||[]).filter(v => !String(v.Group||'').trim());
    if(ungroupCount) ungroupCount.textContent = String(ungrouped.length);

    ungroupList.innerHTML = ungrouped.map(v => renderDraggableVehicleCard(v)).join('');
    wireDraggables(ungroupList);

    board.innerHTML = (currentGroups||[]).length
      ? (currentGroups||[]).map(g => renderGroupColumn(g)).join('')
      : `<div class="text-sm text-slate-500 dark:text-white/60">Belum ada group. Klik <b>+ Buat Group</b> untuk membuat STWE1, STWE2, dst.</div>`;

    // after render, wire droppables and draggables inside columns
    board.querySelectorAll('[data-drop-group]').forEach(el=>{
      wireDropZone(el, el.getAttribute('data-drop-group') || '');
    });
    board.querySelectorAll('[data-drag-list]').forEach(el=>{
      wireDraggables(el);
    });
  }

    function renderGroupColumn(groupName){
    const members = (currentUnitData||[]).filter(v => String(v.Group||'').trim() === groupName);
    const disabled = members.length > 0;

    return `
      <div class="rounded-2xl border border-slate-200/60 dark:border-white/10 bg-slate-50/40 dark:bg-white/5 p-4">
        <div class="flex items-center justify-between mb-2 gap-2">
          <div class="min-w-0">
            <div class="font-extrabold truncate">${escapeHtml(groupName)}</div>
            <div class="text-xs text-slate-500 dark:text-white/60">${members.length} kendaraan</div>
          </div>

          <button type="button"
            class="shrink-0 px-2.5 py-2 rounded-xl font-extrabold border
                  ${disabled
                    ? 'bg-slate-200/70 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-600/30'}"
            title="${disabled ? 'Tidak bisa hapus: group masih dipakai' : 'Hapus group'}"
            ${disabled ? 'disabled' : ''}
            onclick="deleteGroup('${escapeAttr(groupName)}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>

        <div class="group-drop min-h-[120px] rounded-xl border-2 border-dashed border-slate-300/70 dark:border-white/15 p-3"
            data-drop-group="${escapeAttr(groupName)}">
          <div class="text-xs text-slate-500 dark:text-white/60 mb-2">Drop kendaraan ke sini.</div>
          <div class="space-y-2" data-drag-list="1">
            ${members.map(v => renderDraggableVehicleCard(v)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderDraggableVehicleCard(v){
    const code = escapeHtml(v.Code || '');
    const drv = escapeHtml(v.Driver || '');
    const phone = escapeHtml(v.DriverPhone || '');
    return `
      <div class="drag-vehicle rounded-xl border border-slate-200/60 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 shadow-sm"
           draggable="true" data-vehicle-id="${escapeAttr(v.id)}">
        <div class="font-extrabold text-sm">${code}</div>
        <div class="text-xs text-slate-500 dark:text-white/60">${drv} • ${phone}</div>
      </div>
    `;
  }

  function wireDraggables(rootEl){
    rootEl.querySelectorAll('[data-vehicle-id]').forEach(el=>{
      el.addEventListener('dragstart', (ev)=>{
        ev.dataTransfer.setData('text/plain', el.getAttribute('data-vehicle-id') || '');
        ev.dataTransfer.effectAllowed = 'move';
      });
    });
  }

  function wireDropZone(zoneEl, groupName){
    // prevent double bind
    if(zoneEl.__wiredDrop) return;
    zoneEl.__wiredDrop = true;

    zoneEl.addEventListener('dragover', (ev)=>{
      ev.preventDefault();
      zoneEl.classList.add('drag-over');
      ev.dataTransfer.dropEffect = 'move';
    });
    zoneEl.addEventListener('dragleave', ()=>{
      zoneEl.classList.remove('drag-over');
    });
    zoneEl.addEventListener('drop', async (ev)=>{
      ev.preventDefault();
      zoneEl.classList.remove('drag-over');
      const id = ev.dataTransfer.getData('text/plain');
      if(!id) return;

      try{
        const act = groupName ? 'vehicle.setGroup' : 'vehicle.clearGroup';
        const res = await apiCall(act, { id, group: groupName, unit: currentUnit });
        if(res && res.success){
          // update local state without full reload for snappy UX
          const item = currentUnitData.find(v => v.id === id);
          if(item) item.Group = groupName || '';
          renderGroupModal();
        }else{
          toast('Gagal set group: ' + (res && res.message ? res.message : 'Unknown'), 'error');
        }
      }catch(err){
        console.error('drop set group error', err);
        toast('Gagal set group', 'error');
      }
    });
  }

function openGroupModal(){
  if(!currentUnit){ return toast('Pilih unit terlebih dahulu.', 'warn'); }
  groupModalOpen = true;
  document.body.classList.add('overflow-hidden'); // <-- tambah
  const m = document.getElementById('groupModal');
  if(m) m.classList.remove('hidden');
  const u = document.getElementById('groupModalUnit');
  if(u) u.textContent = currentUnit;
  loadGroups().then(()=> renderGroupModal());
}

function closeGroupModal(){
  groupModalOpen = false;
  document.body.classList.remove('overflow-hidden'); // <-- tambah
  const m = document.getElementById('groupModal');
  if(m) m.classList.add('hidden');
}
