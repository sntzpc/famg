/* FG2026 - Gala Dinner Dashboard (Standalone)
   - No login, realtime polling from Apps Script
   - Card cycles: KMP1 total -> random Region -> random Unit -> repeat
*/

(function(){
  const $ = (s,r=document)=>r.querySelector(s);

  // ✅ Hardcode URL backend (GAS Web App)
  // Catatan: gunakan URL script.googleusercontent.com jika tersedia (lebih aman dari CORS).
  const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbxLGbYXrCUHEgOq_9qQMP-cglwO47jQH-wF1i-Zaev2Wu21o0ZTsuSSxnYt2KXYYWOc/exec';

  const STORAGE_KEY = 'fg_gala_dash_settings_v1';

  const DEFAULTS = {
    eventId: 'GALA_2026',
    galaDateTimeLocal: '',          // ISO local string 'YYYY-MM-DDTHH:mm'
    refreshSec: 5,
    cycleSec: 8
  };

  const state = {
    settings: loadSettings(),
    summary: null,
    viewMode: 'KMP1',
    lastPick: { region: null, unit: null },
    cycleTimer: null,
    refreshTimer: null,
    countdownTimer: null
  };

  // -------- Settings ----------
  function loadSettings(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      // backendUrl sengaja tidak disimpan di frontend (hardcode)
      const { backendUrl, ...rest } = obj || {};
      return { ...DEFAULTS, ...rest };
    }catch{
      return { ...DEFAULTS };
    }
  }
  function saveSettings(patch){
    state.settings = { ...state.settings, ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  }
  function resetSettings(){
    localStorage.removeItem(STORAGE_KEY);
    state.settings = { ...DEFAULTS };
  }

  // -------- Utils ----------
  function fmtInt(n){ return (Number(n)||0).toLocaleString('id-ID'); }

  function parseLocalDateTime(value){
    // value: 'YYYY-MM-DDTHH:mm' -> Date in local tz
    if(!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function pad2(n){ return String(n).padStart(2,'0'); }

  function fmtCountdown(ms){
    if(ms <= 0) return '00:00:00';
    const totalSec = Math.floor(ms/1000);
    const hh = Math.floor(totalSec/3600);
    const mm = Math.floor((totalSec%3600)/60);
    const ss = totalSec%60;

    // If > 99 hours, show HHH:MM:SS (no cap)
    return `${hh}:${pad2(mm)}:${pad2(ss)}`;
  }

  function htmlEsc(s){
    return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function pickRandom(arr, last){
    if(!Array.isArray(arr) || arr.length===0) return null;
    if(arr.length===1) return arr[0];
    let x = null;
    for(let i=0;i<10;i++){
      x = arr[Math.floor(Math.random()*arr.length)];
      if(!last || (x && (x.region||x.unit||x.name) !== (last.region||last.unit||last.name))) break;
    }
    return x || arr[0];
  }

  function nowWIB(){
    // display only; uses local time anyway (user in WIB)
    return new Date();
  }

  function fmtTime(d){
    if(!d) return '-';
    const yyyy = d.getFullYear();
    const MM = pad2(d.getMonth()+1);
    const dd = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    const ss = pad2(d.getSeconds());
    return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}`;
  }

  // -------- API ----------
  async function fetchSummary(){
    const { eventId } = state.settings;
    const url = BACKEND_URL.replace(/\/+$/,'') + `?action=public.getSummary&event_id=${encodeURIComponent(eventId)}&_=${Date.now()}`;
    const res = await fetch(url, { method:'GET' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if(!data || data.ok !== true) throw new Error(data?.error || 'Respon tidak valid');
    state.summary = data;
    $('#last-update').textContent = fmtTime(new Date());
    $('#live-status').textContent = 'Live';
    return data;
  }

  // -------- Rendering ----------
  function renderCard(){
    const host = $('#card-host');
    const s = state.summary;
    if(!host) return;

    if(!s){
      host.innerHTML = `
        <div class="p-8 sm:p-10">
          <div class="text-center">
            <div class="text-2xl font-semibold text-slate-800">Menunggu data…</div>
            <div class="mt-2 text-slate-500">Sedang menghubungkan ke server & memuat ringkasan kehadiran…</div>
          </div>
        </div>`;
      return;
    }

    const totals = s.totals || {};
    let title = 'KMP1 - Ringkasan Kehadiran';
    let badge = 'KMP1';
    let stat = totals;

    if(state.viewMode === 'REGION'){
      const pick = pickRandom(s.regions, state.lastPick.region);
      if(pick){
        state.lastPick.region = pick;
        title = `${htmlEsc(pick.region)} - Ringkasan Region`;
        badge = 'REGION';
        stat = pick;
      }else{
        state.viewMode = 'KMP1';
      }
    }else if(state.viewMode === 'UNIT'){
      const pick = pickRandom(s.units, state.lastPick.unit);
      if(pick){
        state.lastPick.unit = pick;
        title = `${htmlEsc(pick.unit)} • ${htmlEsc(pick.region)} - Ringkasan Unit`;
        badge = 'UNIT';
        stat = pick;
      }else{
        state.viewMode = 'KMP1';
      }
    }

    const totalAll = Number(stat.total || 0);

    host.innerHTML = `
      <div class="bg-gradient-to-r from-sky-600 to-blue-800 text-white px-5 sm:px-7 py-4 flex items-center justify-between">
        <div class="font-semibold">${title}</div>
        <div class="text-xs px-3 py-1 rounded-full bg-white/15 border border-white/20 tracking-widest">${badge}</div>
      </div>

      <div class="px-5 sm:px-7 py-8 sm:py-10">
        <div class="text-center">
          <div class="tabular text-6xl sm:text-7xl lg:text-8xl font-extrabold text-sky-600">${fmtInt(totalAll)}</div>
          <div class="mt-2 text-xl sm:text-2xl font-semibold text-slate-800">Total Peserta</div>
        </div>

        <div class="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          ${miniStat('Staff', stat.staff)}
          ${miniStat('Pasangan', stat.pasangan)}
          ${miniStat('Anak', stat.anak)}
          ${miniStat('Keluarga', stat.keluarga)}
        </div>
      </div>
    `;

    $('#hint-mode').textContent = `Mode: ${badge}`;
  }

  function miniStat(label, value){
    return `
      <div class="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-4 text-center shadow-sm">
        <div class="tabular text-3xl sm:text-4xl font-extrabold text-sky-600">${fmtInt(value)}</div>
        <div class="mt-1 text-xs sm:text-sm font-semibold text-slate-600 tracking-wide uppercase">${label}</div>
      </div>
    `;
  }

  // -------- Cycle / Timers ----------
  function stepMode(){
    // KMP1 -> REGION -> UNIT -> repeat
    state.viewMode = (state.viewMode === 'KMP1') ? 'REGION' :
                     (state.viewMode === 'REGION') ? 'UNIT' : 'KMP1';
    renderCard();
  }

  function startCycle(){
    stopCycle();
    const sec = Math.max(3, Number(state.settings.cycleSec)||8);
    $('#hint-cycle').textContent = `Siklus: ${sec}s`;
    state.cycleTimer = setInterval(stepMode, sec*1000);
  }

  function stopCycle(){
    if(state.cycleTimer){ clearInterval(state.cycleTimer); state.cycleTimer=null; }
  }

  function startRefresh(){
    stopRefresh();
    const sec = Math.max(2, Number(state.settings.refreshSec)||5);
    state.refreshTimer = setInterval(async ()=>{
      try{
        await fetchSummary();
        renderCard();
      }catch(err){
        $('#live-status').textContent = 'Offline';
      }
    }, sec*1000);
  }

  function stopRefresh(){
    if(state.refreshTimer){ clearInterval(state.refreshTimer); state.refreshTimer=null; }
  }

  function startCountdown(){
    stopCountdown();
    state.countdownTimer = setInterval(()=>{
      const dt = parseLocalDateTime(state.settings.galaDateTimeLocal);
      if(!dt){
        $('#countdown').textContent = '--:--:--';
        return;
      }
      const ms = dt.getTime() - Date.now();
      $('#countdown').textContent = fmtCountdown(ms);
    }, 250);
  }
  function stopCountdown(){
    if(state.countdownTimer){ clearInterval(state.countdownTimer); state.countdownTimer=null; }
  }

  // -------- Modal ----------
  function openModal(){
    const m = $('#modal');
    m.classList.remove('hidden');
    m.classList.add('flex');

    $('#in-event').value = state.settings.eventId || '';
    $('#in-gala').value = state.settings.galaDateTimeLocal || '';
    $('#in-refresh').value = state.settings.refreshSec || 5;
    $('#in-cycle').value = state.settings.cycleSec || 8;
  }
  function closeModal(){
    const m = $('#modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
  }

  function applyBranding(){
    // optional: could be extended from backend config
    $('#year').textContent = String(new Date().getFullYear());
  }

  // -------- Boot ----------
  function bind(){
    $('#btn-settings').addEventListener('click', openModal);
    $('#btn-close').addEventListener('click', closeModal);
    $('#btn-refresh').addEventListener('click', async ()=>{
      try{
        await fetchSummary();
        renderCard();
      }catch{}
    });

    $('#modal').addEventListener('click', (e)=>{
      if(e.target === $('#modal').firstElementChild) closeModal();
    });

    $('#btn-reset').addEventListener('click', ()=>{
      resetSettings();
      state.summary = null;
      closeModal();
      init();
    });

    $('#settings-form').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const eventId = ($('#in-event').value||'').trim() || 'GALA_2026';
      const gala = ($('#in-gala').value||'').trim();
      const refreshSec = Math.max(2, Number($('#in-refresh').value)||5);
      const cycleSec = Math.max(3, Number($('#in-cycle').value)||8);

      saveSettings({ eventId, galaDateTimeLocal: gala, refreshSec, cycleSec });
      closeModal();
      init();
    });
  }

  async function init(){
    applyBranding();
    startCountdown();
    startCycle();
    startRefresh();

    // initial render
    renderCard();

    // one immediate fetch
    try{
      await fetchSummary();
      renderCard();
    }catch{
      $('#live-status').textContent = 'Offline';
    }
  }

  bind();
  init();
})();
