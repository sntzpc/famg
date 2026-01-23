/* FG2026 - Admin Panel (Modular)
   js/admin/settings.js
*/
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};
  const { htmlEsc } = FGAdmin.dom;

  // ==========================
  // Utils helper (notif, dll)
  // NOTE: file js/utils.js hanya mendefinisikan class `Utils`.
  // Instance global `window.utils` tidak selalu dibuat di admin.
  // Jika modul ini memanggil `utils.*` tanpa inisialisasi,
  // akan muncul: ReferenceError: utils is not defined.
  // ==========================
  const utils = (function(){
    try{
      if(window.utils) return window.utils;
      if(typeof window.Utils === 'function'){
        window.utils = new window.Utils();
        return window.utils;
      }
    }catch{}
    // fallback minimal (agar UI tetap jalan)
    return {
      showNotification: (msg)=>{ try{ alert(String(msg||'')); }catch{} }
    };
  })();

// ==========================
// ✅ SETTINGS TAB (Branding + Config Override)
// ==========================
async function renderSettingsTab(){
  const box = document.getElementById('tab-settings');
  if(!box) return;

  box.innerHTML = `
    <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h3 class="text-xl font-bold text-gray-800">Pengaturan Aplikasi</h3>
      </div>

      <div class="flex gap-2">
        <button id="settings-reload" class="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200">
          <i class="fas fa-sync mr-2"></i>Reload
        </button>
        <button id="settings-reset" class="px-4 py-2 rounded-xl bg-white border hover:bg-gray-50">
          <i class="fas fa-undo mr-2"></i>Reset
        </button>
        <button id="settings-save" class="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-teal-500 text-white font-semibold hover:opacity-90">
          <i class="fas fa-save mr-2"></i>Simpan
        </button>
      </div>
    </div>

    <div class="p-4 rounded-2xl bg-yellow-50 border border-yellow-200 text-yellow-900 mb-6">
      <div class="font-bold"><i class="fas fa-info-circle mr-2"></i>Cara kerja</div>
      <div class="text-sm mt-1">
        Yang tersimpan adalah <b>override/patch</b>. Default tetap ada di <code>config.js</code>
      </div>
    </div>

    <div id="settings-form" class="space-y-6"></div>
  `;

  const btnReload = document.getElementById('settings-reload');
  const btnSave = document.getElementById('settings-save');
  const btnReset = document.getElementById('settings-reset');

  btnReload?.addEventListener('click', ()=> settingsLoadIntoForm());
  btnReset?.addEventListener('click', async ()=>{
    if(!confirm('Reset override config di server? (kembali ke default)')) return;
    await FGAPI.admin.configSet(FGAdmin.store.token, {});
    utils.showNotification('Override config direset', 'success');
    await settingsLoadIntoForm();
  });
  btnSave?.addEventListener('click', async ()=>{
    btnSave.disabled = true;
    const old = btnSave.innerHTML;
    btnSave.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...';
    try{
      const patch = settingsCollectPatch();
      await FGAPI.admin.configSet(FGAdmin.store.token, patch);
      utils.showNotification('Config tersimpan di server', 'success');
      // refresh form with latest
      await settingsLoadIntoForm();
    }catch(e){
      utils.showNotification('Gagal menyimpan: ' + String(e.message||e), 'error');
    }finally{
      btnSave.disabled = false;
      btnSave.innerHTML = old;
    }
  });

  await settingsLoadIntoForm();
}

function settingsFormHtml_(){
  return `
    <!-- MODE -->
    <div class="p-5 rounded-2xl border bg-white">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="font-bold text-gray-800"><i class="fas fa-layer-group mr-2 text-slate-600"></i>Mode Pengaturan</div>
          <div class="text-xs text-gray-500 mt-1">
            <b>Simple</b> dan 
            <b>Advanced</b>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span id="cfg-mode-badge" class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Simple</span>
          <div class="flex items-center gap-2 p-2 rounded-xl bg-gray-50 border">
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <input id="cfg_mode_simple" name="cfg_mode" type="radio" value="simple" class="w-4 h-4" checked />
              <span class="text-sm font-semibold text-gray-800">Simple</span>
            </label>
            <div class="w-px h-6 bg-gray-200"></div>
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <input id="cfg_mode_advanced" name="cfg_mode" type="radio" value="advanced" class="w-4 h-4" />
              <span class="text-sm font-semibold text-gray-800">Advanced</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- BRANDING (CORE) -->
    <div class="p-5 rounded-2xl border bg-white">
      <div class="font-bold text-gray-800 mb-3"><i class="fas fa-id-badge mr-2 text-indigo-600"></i>Identitas (Nilai Inti)</div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <label class="block text-sm font-semibold text-gray-700 mb-1">Nama Aplikasi (untuk judul halaman)</label>
          <input id="cfg_brand_appName" class="w-full p-3 border rounded-xl" placeholder="Mis: Presensi Gala Dinner" />
          <div class="text-xs text-gray-500 mt-1">Dipakai untuk <code>document.title</code> dan beberapa header.</div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Header Title (User App)</label>
          <input id="cfg_brand_headerTitle" class="w-full p-3 border rounded-xl" placeholder="Mis: Family Gathering KMP1" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Header Subtitle (User App)</label>
          <input id="cfg_brand_headerSubtitle" class="w-full p-3 border rounded-xl" placeholder="Mis: Seriang Training, 16-19 Januari 2026" />
        </div>

        <div class="md:col-span-2">
          <label class="block text-sm font-semibold text-gray-700 mb-1">Nama Acara (Event Name)</label>
          <input id="cfg_event_name" class="w-full p-3 border rounded-xl" placeholder="Mis: Family Gathering KMP1 Tahun 2026" />
          <div class="text-xs text-gray-500 mt-1">Token utama: <b>{eventName}</b>. Dipakai di banyak teks default.</div>
        </div>

        <!-- Advanced-only (Brand extras) -->
        <div class="md:col-span-2" id="cfg-advanced-brand-note">
          <div class="text-xs text-gray-500">Tambahan detail (Short name, subtitle admin, dll) muncul di mode <b>Advanced</b>.</div>
        </div>
      </div>
    </div>

    <div id="cfg-advanced-only" class="space-y-6 hidden">

    <!-- BRANDING (ADVANCED) -->
    <div class="p-5 rounded-2xl border bg-white">
      <div class="font-bold text-gray-800 mb-3"><i class="fas fa-tags mr-2 text-indigo-600"></i>Identitas (Detail)</div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Short Name</label>
          <input id="cfg_brand_shortName" class="w-full p-3 border rounded-xl" placeholder="Mis: Presensi" />
          <div class="text-xs text-gray-500 mt-1">Token: <b>{shortName}</b></div>
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Subtitle Admin</label>
          <input id="cfg_brand_adminSubtitle" class="w-full p-3 border rounded-xl" placeholder="Mis: Family Gathering 2026" />
        </div>
      </div>
    </div>


    <!-- PAGE TEXTS -->
    <div class="p-5 rounded-2xl border bg-white">
      <div class="font-bold text-gray-800 mb-3"><i class="fas fa-font mr-2 text-emerald-600"></i>Teks Halaman (Multi-Event)</div>
      <div class="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
        <div class="font-bold mb-1">Template FGAdmin.store.token (boleh dipakai di semua field)</div>
        <div class="leading-relaxed">
          {eventName} {headerSubtitle} {headerTitle} {appName} {shortName} {year} {locationName} {locationAddress}<br/>
          Bonus (opsional): {eventStartDate} {eventEndDate} {galaStart} {galaEnd}<br/>
          Anda juga bisa pakai versi nested: {event.name} / {brand.headerSubtitle}, dll.
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <div class="text-sm font-extrabold text-gray-800 mb-2">Halaman Peserta (index.html)</div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Judul Presensi</label>
          <input id="cfg_idx_presenceTitle" class="w-full p-3 border rounded-xl" placeholder="Mis: Presensi Gala Dinner" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Subjudul Presensi</label>
          <input id="cfg_idx_presenceSubtitle" class="w-full p-3 border rounded-xl" placeholder="Mis: Seriang Training | 18 Januari 2026 | 16:00 WIB" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Catatan Lokasi</label>
          <input id="cfg_idx_presenceLocationNote" class="w-full p-3 border rounded-xl" placeholder="Mis: Wajib berada di lokasi acara" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Pesan Jika Sudah Absen</label>
          <input id="cfg_idx_alreadyAttendedMsg" class="w-full p-3 border rounded-xl" placeholder="Mis: Terima kasih telah menghadiri acara ini" />
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Header App Title (setelah masuk)</label>
          <input id="cfg_idx_appHeaderTitle" class="w-full p-3 border rounded-xl" placeholder="Mis: Family Gathering 2026" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Header App Subtitle</label>
          <input id="cfg_idx_appHeaderSubtitle" class="w-full p-3 border rounded-xl" placeholder="Mis: Seriang Training, 16-19 Januari 2026" />
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Judul Kartu Current Event</label>
          <input id="cfg_idx_currentEventCardTitle" class="w-full p-3 border rounded-xl" placeholder="Acara Sedang Berlangsung" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Judul Kartu Jadwal</label>
          <input id="cfg_idx_scheduleTitle" class="w-full p-3 border rounded-xl" placeholder="Rundown Acara" />
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Judul Kartu Doorprize</label>
          <input id="cfg_idx_doorprizeCardTitle" class="w-full p-3 border rounded-xl" placeholder="Pemenang Doorprize" />
        </div>
        <div></div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Footer - Nama Organisasi</label>
          <input id="cfg_idx_footerOrg" class="w-full p-3 border rounded-xl" placeholder="Mis: Karyamas Plantation 1" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Footer - Nama Event</label>
          <input id="cfg_idx_footerEvent" class="w-full p-3 border rounded-xl" placeholder="Mis: Family Gathering 2026" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Footer - Lokasi/Tanggal</label>
          <input id="cfg_idx_footerDate" class="w-full p-3 border rounded-xl" placeholder="Mis: Seriang Training, 18 Januari 2026" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Footer - Copyright</label>
          <input id="cfg_idx_footerCopy" class="w-full p-3 border rounded-xl" placeholder="Mis: © 2026 ..." />
        </div>

        <div class="md:col-span-2 mt-2">
          <div class="h-px bg-gray-200"></div>
        </div>

        <div class="md:col-span-2">
          <div class="text-sm font-extrabold text-gray-800 mb-2">Halaman Operator Doorprize (doorprize.html)</div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Judul Tab (document.title)</label>
          <input id="cfg_dp_docTitle" class="w-full p-3 border rounded-xl" placeholder="Doorprize - Operator" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Header Title</label>
          <input id="cfg_dp_headerTitle" class="w-full p-3 border rounded-xl" placeholder="Doorprize" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Header Subtitle</label>
          <input id="cfg_dp_headerSubtitle" class="w-full p-3 border rounded-xl" placeholder="Operator / Admin" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Judul Mesin (Event Name)</label>
          <input id="cfg_dp_machineEventName" class="w-full p-3 border rounded-xl" placeholder="{eventName}" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Label Stage</label>
          <input id="cfg_dp_stageLabel" class="w-full p-3 border rounded-xl" placeholder="Doorprize" />
        </div>
        <div></div>

        <div class="md:col-span-2 mt-2">
          <div class="h-px bg-gray-200"></div>
        </div>

        <div class="md:col-span-2">
          <div class="text-sm font-extrabold text-gray-800 mb-2">Halaman Operator Rundown (rundown.html)</div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Judul Tab (document.title)</label>
          <input id="cfg_rd_docTitle" class="w-full p-3 border rounded-xl" placeholder="Rundown - Operator" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Header Title</label>
          <input id="cfg_rd_headerTitle" class="w-full p-3 border rounded-xl" placeholder="Rundown Operator" />
        </div>
        <div class="md:col-span-2">
          <label class="block text-sm font-semibold text-gray-700 mb-1">Header Subtitle</label>
          <input id="cfg_rd_headerSubtitle" class="w-full p-3 border rounded-xl" placeholder="Pilih acara yang sedang tampil di aplikasi peserta" />
        </div>
      </div>
    </div>
    <!-- EVENT -->
    <div class="p-5 rounded-2xl border bg-white">
      <div class="font-bold text-gray-800 mb-3"><i class="fas fa-calendar-alt mr-2 text-blue-600"></i>Jadwal Event (ISO)</div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Event Start</label>
          <input id="cfg_event_start" class="w-full p-3 border rounded-xl" placeholder="2026-01-16T00:00:00+07:00" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Event End</label>
          <input id="cfg_event_end" class="w-full p-3 border rounded-xl" placeholder="2026-01-19T23:59:59+07:00" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Gala Dinner Start</label>
          <input id="cfg_gala_start" class="w-full p-3 border rounded-xl" placeholder="2026-01-19T07:00:00+07:00" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Gala Dinner End</label>
          <input id="cfg_gala_end" class="w-full p-3 border rounded-xl" placeholder="2026-01-19T23:50:00+07:00" />
        </div>
      </div>
    </div>

    <!-- LOCATION -->
    <div class="p-5 rounded-2xl border bg-white">
      <div class="font-bold text-gray-800 mb-3"><i class="fas fa-map-marker-alt mr-2 text-teal-600"></i>Lokasi & Geofence</div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Nama Lokasi</label>
          <input id="cfg_loc_name" class="w-full p-3 border rounded-xl" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Alamat</label>
          <input id="cfg_loc_addr" class="w-full p-3 border rounded-xl" />
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Latitude</label>
          <input id="cfg_lat" type="number" step="any" class="w-full p-3 border rounded-xl" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Longitude</label>
          <input id="cfg_lng" type="number" step="any" class="w-full p-3 border rounded-xl" />
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Accuracy (m)</label>
          <input id="cfg_acc" type="number" class="w-full p-3 border rounded-xl" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Geofence Radius (m)</label>
          <input id="cfg_radius" type="number" class="w-full p-3 border rounded-xl" />
        </div>
      </div>
    </div>

    <!-- APP -->
    <div class="p-5 rounded-2xl border bg-white">
      <div class="font-bold text-gray-800 mb-3"><i class="fas fa-cogs mr-2 text-purple-600"></i>Parameter Aplikasi</div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Doorprize Confirm Timeout (ms)</label>
          <input id="cfg_dp_timeout" type="number" class="w-full p-3 border rounded-xl" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Notification Timeout (ms)</label>
          <input id="cfg_notif_timeout" type="number" class="w-full p-3 border rounded-xl" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Location Update Interval (ms)</label>
          <input id="cfg_loc_interval" type="number" class="w-full p-3 border rounded-xl" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Event Switch Interval (ms)</label>
          <input id="cfg_event_switch" type="number" class="w-full p-3 border rounded-xl" />
        </div>
      </div>
    </div>

    <!-- SECURITY -->
    <div class="p-5 rounded-2xl border bg-white">
      <div class="font-bold text-gray-800 mb-3"><i class="fas fa-shield-alt mr-2 text-orange-600"></i>Security</div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">NIK Min Length</label>
          <input id="cfg_nik_len" type="number" class="w-full p-3 border rounded-xl" />
        </div>

        <label class="inline-flex items-center gap-2 p-3 border rounded-xl bg-gray-50 cursor-pointer">
          <input id="cfg_enable_date" type="checkbox" class="w-4 h-4" />
          <span class="font-semibold text-gray-800">Enable Date Validation</span>
        </label>

        <label class="inline-flex items-center gap-2 p-3 border rounded-xl bg-gray-50 cursor-pointer">
          <input id="cfg_enable_geo" type="checkbox" class="w-4 h-4" />
          <span class="font-semibold text-gray-800">Enable Geofencing</span>
        </label>

        <label class="inline-flex items-center gap-2 p-3 border rounded-xl bg-gray-50 cursor-pointer md:col-span-3">
          <input id="cfg_debug" type="checkbox" class="w-4 h-4" />
          <span class="font-semibold text-gray-800">Debug Mode</span>
        </label>
      </div>
    </div>

    </div>

  `;
}



// ==========================
// ✅ SETTINGS MODE (Simple / Advanced)
// ==========================
const SETTINGS_MODE_KEY = 'fg.settings.mode';

function settingsGetMode_(){
  try{
    const v = (localStorage.getItem(SETTINGS_MODE_KEY) || '').toLowerCase();
    return (v === 'advanced') ? 'advanced' : 'simple';
  }catch{ return 'simple'; }
}

function settingsSetMode_(mode){
  try{ localStorage.setItem(SETTINGS_MODE_KEY, mode === 'advanced' ? 'advanced' : 'simple'); }catch{}
}

function settingsApplyModeUI_(){
  const mode = settingsGetMode_();
  const advWrap = document.getElementById('cfg-advanced-only');
  if(advWrap) advWrap.classList.toggle('hidden', mode !== 'advanced');

  const rSimple = document.getElementById('cfg_mode_simple');
  const rAdv = document.getElementById('cfg_mode_advanced');
  if(rSimple) rSimple.checked = (mode !== 'advanced');
  if(rAdv) rAdv.checked = (mode === 'advanced');

  const badge = document.getElementById('cfg-mode-badge');
  if(badge){
    badge.textContent = (mode === 'advanced') ? 'Advanced' : 'Simple';
    badge.className = (mode === 'advanced')
      ? 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 border border-indigo-200'
      : 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200';
  }
}

function settingsInitModeToggle_(){
  const rSimple = document.getElementById('cfg_mode_simple');
  const rAdv = document.getElementById('cfg_mode_advanced');
  const onChange = ()=>{
    const mode = rAdv?.checked ? 'advanced' : 'simple';
    settingsSetMode_(mode);
    settingsApplyModeUI_();
  };
  rSimple?.addEventListener('change', onChange);
  rAdv?.addEventListener('change', onChange);
  settingsApplyModeUI_();
}

// ==========================
// ✅ ADVANCED UI: Collapsible sections (Accordion-like)
// ==========================
function settingsEnhanceAdvancedCollapsible_(){
  const advWrap = document.getElementById('cfg-advanced-only');
  if(!advWrap) return;
  if(advWrap.dataset.collapsibleReady === '1') return;
  advWrap.dataset.collapsibleReady = '1';

  // target: kartu advanced yang saat ini berbentuk "card" biasa
  const cards = Array.from(advWrap.children).filter(el=>{
    if(!(el instanceof HTMLElement)) return false;
    // aman: hanya yang benar-benar card advanced
    const cls = el.className || '';
    return cls.includes('p-5') && cls.includes('rounded-2xl') && cls.includes('border') && cls.includes('bg-white');
  });

  if(!cards.length) return;

  cards.forEach((card, idx)=>{
    const titleEl = card.querySelector(':scope > .font-bold');
    if(!titleEl) return; // skip jika struktur tak sesuai

    // build <details>
    const details = document.createElement('details');
    details.className = 'cfg-acc rounded-2xl border bg-white overflow-hidden';
    if(idx === 0) details.open = true; // buka section pertama agar terasa "on"

    const summary = document.createElement('summary');
    summary.className = 'list-none cursor-pointer select-none px-5 py-4 flex items-center justify-between gap-3 bg-white hover:bg-gray-50';

    const left = document.createElement('div');
    left.className = 'font-bold text-gray-800';
    // ambil isi judul + icon yang sudah ada
    left.innerHTML = titleEl.innerHTML;

    const right = document.createElement('div');
    right.className = 'flex items-center gap-2 text-xs text-gray-500';
    right.innerHTML = `<span class="hidden sm:inline">Klik untuk buka/tutup</span><i class="fas fa-chevron-down cfg-chevron"></i>`;

    summary.appendChild(left);
    summary.appendChild(right);

    const body = document.createElement('div');
    body.className = 'px-5 pb-5';

    // pindahkan semua child kecuali title
    Array.from(card.children).forEach(ch=>{
      if(ch === titleEl) return;
      body.appendChild(ch);
    });

    // rapikan margin sisa di elemen pertama body jika ada
    const first = body.firstElementChild;
    if(first && first.classList.contains('mb-3')) first.classList.remove('mb-3');

    details.appendChild(summary);
    details.appendChild(body);

    card.replaceWith(details);
  });
}

async function settingsLoadIntoForm(){
  const wrap = document.getElementById('settings-form');
  if(!wrap) return;
  wrap.innerHTML = settingsFormHtml_();
  settingsEnhanceAdvancedCollapsible_();
  settingsInitModeToggle_();

  let cfg = {};
  try{
    const res = await FGAPI.admin.configGet(FGAdmin.store.token);
    cfg = res?.config || {};
  }catch(e){
    utils.showNotification('Gagal memuat config: ' + String(e.message||e), 'error');
    return;
  }

  const g = (path, def='')=>{
    try{ return path.split('.').reduce((a,k)=>a?.[k], cfg) ?? def; }catch{ return def; }
  };

  // BRAND
  document.getElementById('cfg_brand_appName').value = g('app.brand.appName','');
  document.getElementById('cfg_brand_shortName').value = g('app.brand.shortName','');
  document.getElementById('cfg_brand_headerTitle').value = g('app.brand.headerTitle','');
  document.getElementById('cfg_brand_headerSubtitle').value = g('app.brand.headerSubtitle','');
  document.getElementById('cfg_brand_adminSubtitle').value = g('app.brand.adminSubtitle','');

  // PAGE TEXTS
  document.getElementById('cfg_idx_presenceTitle').value = g('app.pages.index.presenceTitle','');
  document.getElementById('cfg_idx_presenceSubtitle').value = g('app.pages.index.presenceSubtitle','');
  document.getElementById('cfg_idx_presenceLocationNote').value = g('app.pages.index.presenceLocationNote','');
  document.getElementById('cfg_idx_alreadyAttendedMsg').value = g('app.pages.index.alreadyAttendedMsg','');
  document.getElementById('cfg_idx_appHeaderTitle').value = g('app.pages.index.appHeaderTitle','');
  document.getElementById('cfg_idx_appHeaderSubtitle').value = g('app.pages.index.appHeaderSubtitle','');
  document.getElementById('cfg_idx_currentEventCardTitle').value = g('app.pages.index.currentEventCardTitle','');
  document.getElementById('cfg_idx_scheduleTitle').value = g('app.pages.index.scheduleTitle','');
  document.getElementById('cfg_idx_doorprizeCardTitle').value = g('app.pages.index.doorprizeCardTitle','');
  document.getElementById('cfg_idx_footerOrg').value = g('app.pages.index.footerOrg','');
  document.getElementById('cfg_idx_footerEvent').value = g('app.pages.index.footerEvent','');
  document.getElementById('cfg_idx_footerDate').value = g('app.pages.index.footerDate','');
  document.getElementById('cfg_idx_footerCopy').value = g('app.pages.index.footerCopy','');

  document.getElementById('cfg_dp_docTitle').value = g('app.pages.doorprize.docTitle','');
  document.getElementById('cfg_dp_headerTitle').value = g('app.pages.doorprize.headerTitle','');
  document.getElementById('cfg_dp_headerSubtitle').value = g('app.pages.doorprize.headerSubtitle','');
  document.getElementById('cfg_dp_machineEventName').value = g('app.pages.doorprize.machineEventName','');
  document.getElementById('cfg_dp_stageLabel').value = g('app.pages.doorprize.stageLabel','');

  document.getElementById('cfg_rd_docTitle').value = g('app.pages.rundown.docTitle','');
  document.getElementById('cfg_rd_headerTitle').value = g('app.pages.rundown.headerTitle','');
  document.getElementById('cfg_rd_headerSubtitle').value = g('app.pages.rundown.headerSubtitle','');

  // EVENT
  document.getElementById('cfg_event_name').value = g('event.name','');
  document.getElementById('cfg_event_start').value = g('event.eventStartDate','');
  document.getElementById('cfg_event_end').value = g('event.eventEndDate','');
  document.getElementById('cfg_gala_start').value = g('event.galaDinnerDate','');
  document.getElementById('cfg_gala_end').value = g('event.galaDinnerEndTime','');

  // LOCATION
  document.getElementById('cfg_loc_name').value = g('event.location.name','');
  document.getElementById('cfg_loc_addr').value = g('event.location.address','');
  document.getElementById('cfg_lat').value = g('event.location.coordinates.latitude','');
  document.getElementById('cfg_lng').value = g('event.location.coordinates.longitude','');
  document.getElementById('cfg_acc').value = g('event.location.coordinates.accuracy', 50);
  document.getElementById('cfg_radius').value = g('event.location.geofencingRadius', 2500);

  // APP
  document.getElementById('cfg_dp_timeout').value = g('app.doorprizeConfirmTimeout', 60000);
  document.getElementById('cfg_notif_timeout').value = g('app.notificationTimeout', 5000);
  document.getElementById('cfg_loc_interval').value = g('app.locationUpdateInterval', 30000);
  document.getElementById('cfg_event_switch').value = g('app.eventSwitchInterval', 180000);

  // SECURITY
  document.getElementById('cfg_nik_len').value = g('security.nikMinLength', 8);
  document.getElementById('cfg_enable_date').checked = !!g('security.enableDateValidation', true);
  document.getElementById('cfg_enable_geo').checked = !!g('security.enableGeofencing', true);
  document.getElementById('cfg_debug').checked = !!g('security.debugMode', false);
}

function settingsCollectPatch(){
const mode = (typeof settingsGetMode_ === 'function') ? settingsGetMode_() : 'simple';

const valRaw = (id)=> (document.getElementById(id)?.value ?? '');
const val = (id)=> String(valRaw(id)).trim();

const has = (id)=> document.getElementById(id) != null;

// build sparse patch (only override what user sets)
const patch = {};
const set = (path, v)=>{
  const keys = path.split('.');
  let o = patch;
  for(let i=0;i<keys.length-1;i++){
    const k = keys[i];
    if(!o[k] || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  o[keys[keys.length-1]] = v;
};

const setIfStr = (path, id)=>{
  if(!has(id)) return;
  const v = val(id);
  if(v !== '') set(path, v);
};

const setIfNum = (path, id)=>{
  if(!has(id)) return;
  const raw = String(valRaw(id)).trim();
  if(raw === '') return;
  const n = Number(raw);
  if(Number.isFinite(n)) set(path, n);
};

const setIfBool = (path, id)=>{
  if(!has(id)) return;
  set(path, !!document.getElementById(id)?.checked);
};

// ==========================
// SIMPLE MODE: only core identity fields
// ==========================
if(mode !== 'advanced'){
  setIfStr('event.name', 'cfg_event_name');
  setIfStr('app.brand.appName', 'cfg_brand_appName');
  setIfStr('app.brand.headerTitle', 'cfg_brand_headerTitle');
  setIfStr('app.brand.headerSubtitle', 'cfg_brand_headerSubtitle');
  return patch;
}

// ==========================
// ADVANCED MODE: full controls (still sparse)
// ==========================

// Event
setIfStr('event.name', 'cfg_event_name');
setIfStr('event.galaDinnerDate', 'cfg_gala_start');
setIfStr('event.galaDinnerEndTime', 'cfg_gala_end');
setIfStr('event.eventStartDate', 'cfg_event_start');
setIfStr('event.eventEndDate', 'cfg_event_end');

setIfStr('event.location.name', 'cfg_loc_name');
setIfStr('event.location.address', 'cfg_loc_addr');
setIfNum('event.location.coordinates.latitude', 'cfg_lat');
setIfNum('event.location.coordinates.longitude', 'cfg_lng');
setIfNum('event.location.coordinates.accuracy', 'cfg_acc');
setIfNum('event.location.geofencingRadius', 'cfg_radius');

// Brand
setIfStr('app.brand.appName', 'cfg_brand_appName');
setIfStr('app.brand.shortName', 'cfg_brand_shortName');
setIfStr('app.brand.headerTitle', 'cfg_brand_headerTitle');
setIfStr('app.brand.headerSubtitle', 'cfg_brand_headerSubtitle');
setIfStr('app.brand.adminSubtitle', 'cfg_brand_adminSubtitle');

// Page texts (index)
setIfStr('app.pages.index.presenceTitle', 'cfg_idx_presenceTitle');
setIfStr('app.pages.index.presenceSubtitle', 'cfg_idx_presenceSubtitle');
setIfStr('app.pages.index.presenceLocationNote', 'cfg_idx_presenceLocationNote');
setIfStr('app.pages.index.alreadyAttendedMsg', 'cfg_idx_alreadyAttendedMsg');
setIfStr('app.pages.index.appHeaderTitle', 'cfg_idx_appHeaderTitle');
setIfStr('app.pages.index.appHeaderSubtitle', 'cfg_idx_appHeaderSubtitle');
setIfStr('app.pages.index.currentEventCardTitle', 'cfg_idx_currentEventCardTitle');
setIfStr('app.pages.index.scheduleTitle', 'cfg_idx_scheduleTitle');
setIfStr('app.pages.index.doorprizeCardTitle', 'cfg_idx_doorprizeCardTitle');
setIfStr('app.pages.index.footerOrg', 'cfg_idx_footerOrg');
setIfStr('app.pages.index.footerEvent', 'cfg_idx_footerEvent');
setIfStr('app.pages.index.footerDate', 'cfg_idx_footerDate');
setIfStr('app.pages.index.footerCopy', 'cfg_idx_footerCopy');

// Page texts (doorprize)
setIfStr('app.pages.doorprize.docTitle', 'cfg_dp_docTitle');
setIfStr('app.pages.doorprize.headerTitle', 'cfg_dp_headerTitle');
setIfStr('app.pages.doorprize.headerSubtitle', 'cfg_dp_headerSubtitle');
setIfStr('app.pages.doorprize.machineEventName', 'cfg_dp_machineEventName');
setIfStr('app.pages.doorprize.stageLabel', 'cfg_dp_stageLabel');

// Page texts (rundown)
setIfStr('app.pages.rundown.docTitle', 'cfg_rd_docTitle');
setIfStr('app.pages.rundown.headerTitle', 'cfg_rd_headerTitle');
setIfStr('app.pages.rundown.headerSubtitle', 'cfg_rd_headerSubtitle');

// App params
setIfNum('app.doorprizeConfirmTimeout', 'cfg_dp_timeout');
setIfNum('app.notificationTimeout', 'cfg_notif_timeout');
setIfNum('app.locationUpdateInterval', 'cfg_loc_interval');
setIfNum('app.eventSwitchInterval', 'cfg_event_switch');

// Security (explicit)
setIfNum('security.nikMinLength', 'cfg_nik_len');
setIfBool('security.enableDateValidation', 'cfg_enable_date');
setIfBool('security.enableGeofencing', 'cfg_enable_geo');
setIfBool('security.debugMode', 'cfg_debug');

return patch;
}

  FGAdmin.settings = {
    renderSettingsTab
  };
})();
