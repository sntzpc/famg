// app.js - Rundown Operator (tanpa login UI)
// Catatan: aksi set/clear membutuhkan token OPERATOR/ADMIN yang sudah ada di localStorage (mis. dari panel admin).
(function(){
  const { $, esc, dayLabel } = window.utils;

  const KEY_CANDIDATES = [
    'fg_operator_token_v1',
    'fg_admin_token_v1',
    'fg_token_v1',
    'fg_token'
  ];

  function getToken(){
    for(const k of KEY_CANDIDATES){
      const t = (localStorage.getItem(k) || '').trim();
      if(t) return t;
    }
    return '';
  }

  // ==========================
  // State & cache (biar terasa instan)
  // ==========================
  const CACHE_KEY = 'fg_rundown_cache_v1';
  const CACHE_TTL_MS = 30 * 1000; // 30 detik (perceived instant, tetap segar)
  const state = { events: [], current: null };

  function loadCache(){
    try{
      const raw = localStorage.getItem(CACHE_KEY);
      if(!raw) return null;
      const obj = JSON.parse(raw);
      if(!obj || !obj.ts || !obj.data) return null;
      if((Date.now() - obj.ts) > CACHE_TTL_MS) return null;
      return obj.data;
    }catch{ return null; }
  }

  function saveCache(data){
    try{ localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); }catch{}
  }

  function renderAll(data){
    const cur = data?.current || null;
    const events = Array.isArray(data?.events) ? data.events : [];
    state.current = cur;
    state.events = events;
    setCurrentUI(cur);
    renderEvents(events, cur?.id || '');
  }

  function setCurrentUI(ev){
    const elTitle = $('#cur-title');
    if(elTitle) elTitle.textContent = ev?.title || '-';

    const elId = $('#cur-id');
    if(elId) elId.textContent = ev?.id ? ('ID: ' + ev.id) : '-';

    const elTime = $('#cur-time');
    if(elTime){
        elTime.textContent = ev
        ? `${dayLabel(ev.day)} • ${ev.time || ''}`.trim()
        : '-';
    }

    const elDesc = $('#cur-desc');
    if(elDesc) elDesc.textContent = ev?.description || '-';
    }

  function renderEvents(list, activeId){
    const box = $('#events');
    if(!box) return;
    box.innerHTML = '';
    if(!list || !list.length){
      box.innerHTML = '<div class="text-sm text-gray-500">Belum ada data event.</div>';
      return;
    }

    list.forEach(r=>{
      const active = String(r.id) === String(activeId||'');
      const card = document.createElement('div');
      card.className = 'flex items-start justify-between gap-3 p-3 border rounded-xl mb-2 bg-white fg-animate-in';
      card.innerHTML = `
        <div class="min-w-0">
          <div class="font-bold text-gray-800 truncate">${esc(r.title||'-')}</div>
          <div class="text-sm text-gray-600">${esc(r.time||'')} | ${esc(dayLabel(r.day))}</div>
          <div class="text-xs text-gray-500 mt-1">${esc(r.description||'')}</div>
        </div>
        <div class="flex flex-col gap-2 shrink-0">
          <button class="btn-set px-3 py-2 rounded-lg ${active ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}" data-id="${esc(r.id)}">
            <i class="fas fa-bolt mr-1"></i>${active ? 'Aktif' : 'Set Aktif'}
          </button>
        </div>
      `;
      box.appendChild(card);
    });

    box.querySelectorAll('.btn-set').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
  const token = getToken();
  if(!token){
    alert('Token operator/admin tidak ditemukan di browser ini. Silakan login di panel operator agar token tersimpan, lalu buka halaman Rundown lagi.');
    return;
  }

  const id = btn.dataset.id;
  // cari event di state untuk update UI instan
  const ev = (state.events || []).find(x => String(x.id)===String(id)) || null;

  // optimistic UI
  if(ev){
    state.current = { ...ev, active:true };
    setCurrentUI(state.current);
    renderEvents(state.events, id);
    saveCache({ events: state.events, current: state.current });
  }

  // loading state
  btn.classList.add('is-loading');
  btn.disabled = true;

  try{
    await FGAPI.operator.setCurrentEvent(token, id);
    // tidak perlu re-fetch full; UI sudah update
  }catch(e){
    alert(e?.message || String(e));
    // restore by force refresh
    await refresh(true);
  }finally{
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
});
    });
  }

  async function refresh(force){
  // 0) tampilkan cache dulu (instan)
  if(!force){
    const cached = loadCache();
    if(cached) renderAll(cached);
  }

  // 1) ambil dari server (1 request kalau backend sudah support bootstrap)
  try{
    let data = null;
    try{
      const boot = await FGAPI.public.bootstrap();
      data = { events: boot?.events || [], current: boot?.current || boot?.event || null };
    }catch(e){
      // fallback untuk backend lama
      const [curRes, sch] = await Promise.allSettled([
        FGAPI.public.getCurrentEvent(),
        FGAPI.public.getSchedule()
      ]);
      const cur = (curRes.status === 'fulfilled') ? (curRes.value?.event || null) : null;
      const events = (sch.status === 'fulfilled') ? (Array.isArray(sch.value?.events) ? sch.value.events : []) : [];
      data = { events, current: cur };
    }
    renderAll(data);
    saveCache(data);
  }catch(e){
    console.error(e);
    const box = $('#events');
    if(box && (!state.events || !state.events.length)){
      box.innerHTML = `<div class="text-sm text-red-600">Gagal memuat event: ${esc(e?.message || String(e))}</div>`;
    }
  }
}

  async function clearCurrent(){
    const token = getToken();
    if(!token){
      alert('Token operator/admin tidak ditemukan di browser ini.\n\nSilakan login sekali dari panel Admin/Operator agar token tersimpan, lalu buka halaman Rundown lagi.');
      return;
    }
    try{
      const btn = $('#btn-clear');
      btn.disabled = true;
      await FGAPI.operator.clearCurrentEvent(token);
      await refresh(false);
    }catch(e){
      alert(e?.message || String(e));
    }finally{
      const btn = $('#btn-clear');
      btn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    $('#btn-refresh')?.addEventListener('click', ()=>refresh(true));
    $('#btn-clear')?.addEventListener('click', clearCurrent);
    refresh(false);
  });
})();