/* =========================================================
   FG2026 - Live Map Standalone (tanpa login)
   - Sumber data: Google Apps Script WebApp (AppConfig.api.url)
   - Endpoint: public.liveLocations (ditambahkan di backend/Code.gs)
   ========================================================= */

(function(){
  const $ = (s,r=document)=>r.querySelector(s);

  // ---------- tiny utils ----------
  const esc = (s)=>String(s??'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmtDist = (m)=>{
    if(m==null || !isFinite(m)) return '-';
    if(m < 1000) return Math.round(m)+' m';
    return (m/1000).toFixed(2)+' km';
  };
  const fmtTs = (iso)=>{
    const t = Date.parse(iso||'');
    if(!isFinite(t)) return '-';
    const d = new Date(t);
    const pad=(n)=>String(n).padStart(2,'0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  // ---------- API ----------
  function apiUrl(){
    const url = String(window.AppConfig?.api?.url || '').trim();
    if(!url) throw new Error('AppConfig.api.url belum diisi');
    return url;
  }

  async function post(action, payload){
    const url = apiUrl();
    const body = new URLSearchParams();
    body.set('action', action);
    body.set('payload', JSON.stringify(payload||{}));
    const res = await fetch(url, {
      method:'POST',
      headers: {'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body
    });
    const txt = await res.text();
    let data;
    try{ data = JSON.parse(txt); }catch(e){
      throw new Error('Respon bukan JSON: ' + txt.slice(0,200));
    }
    if(!data || data.ok !== true){
      throw new Error(data?.error || 'Request gagal');
    }
    return data.data;
  }

  // ---------- state ----------
  const state = {
    map: null,
    cluster: null,
    circle: null,
    centerMarker: null,
    markerByNik: new Map(),
    last: null,
    timer: null,
    intervalSec: 5,
    idleMin: 10,
    filter: { q:'', scope:'all', active:'all', region:'all', unit:'all' },
    remoteConfig: null
  };

  // ---------- remote config / branding ----------
  function tokens_(cfg){
    const c = cfg || {};
    const brand = c.app && c.app.brand ? c.app.brand : {};
    const ev = c.event || {};
    const loc = (ev.location||{});
    const year = new Date().getFullYear();
    return {
      appName: brand.appName || 'Live Map',
      shortName: brand.shortName || 'Live Map',
      headerTitle: brand.headerTitle || brand.appName || 'Live Map',
      headerSubtitle: brand.headerSubtitle || '',
      eventName: ev.name || '',
      locationName: loc.name || '',
      year: String(year)
    };
  }

  function fmtTpl_(s, t){
    return String(s||'').replace(/\{(appName|shortName|headerTitle|headerSubtitle|eventName|year|locationName)\}/g, (_,k)=> (t[k]??''));
  }

  function applyBranding_(){
    const localBrand = window.AppConfig?.app?.brand || {};
    const cfg = state.remoteConfig || { app:{ brand: localBrand } };
    const t = tokens_(cfg);

    const title = fmtTpl_(cfg?.app?.pages?.livemap?.docTitle || '{headerTitle} - Live Map', t) || (t.headerTitle + ' - Live Map');
    document.title = title;
    const elTitle = $('#app-title');
    if(elTitle) elTitle.textContent = fmtTpl_(cfg?.app?.pages?.livemap?.headerTitle || '{headerTitle} - Live Map', t) || (t.headerTitle + ' - Live Map');
    const elSub = $('#app-subtitle');
    if(elSub) elSub.textContent = fmtTpl_(cfg?.app?.pages?.livemap?.headerSubtitle || 'Memantau posisi peserta', t) || 'Memantau posisi peserta';
  }

  async function loadRemoteConfig_(){
    try{
      const res = await post('public.getConfig', {});
      const cfg = res && res.config ? res.config : null;
      if(cfg) state.remoteConfig = cfg;
    }catch(_e){
      // silent fallback ke local
    }
    applyBranding_();
  }

  function calcActive(row){
    const t = Date.parse(row.updated_at||'');
    if(!isFinite(t)) return false;
    const ageMs = Date.now()-t;
    return ageMs <= state.idleMin*60*1000;
  }

  function rowPass(row){
    const q = state.filter.q.trim().toLowerCase();
    if(q){
      const hay = (String(row.nik||'')+' '+String(row.name||'')).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(state.filter.scope==='in' && row.in_radius!==true) return false;
    if(state.filter.scope==='out' && row.in_radius===true) return false;

    const act = calcActive(row);
    if(state.filter.active==='active' && !act) return false;
    if(state.filter.active==='inactive' && act) return false;

    const reg = String(row.region||'').trim();
    const uni = String(row.unit||'').trim();
    if(state.filter.region!=='all' && state.filter.region!==reg) return false;
    if(state.filter.unit!=='all' && state.filter.unit!==uni) return false;
    return true;
  }

  function ensureMap(center){
    if(state.map) return;

    state.map = L.map('map', { zoomControl:true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.map);

    state.cluster = L.markerClusterGroup({ chunkedLoading:true });
    state.map.addLayer(state.cluster);

    // initial view
    if(center && isFinite(center.lat) && isFinite(center.lng)){
      state.map.setView([center.lat, center.lng], 15);
      state.centerMarker = L.marker([center.lat, center.lng], {
      title: center.name || 'Center',
      icon: centerIcon_(),
      interactive: false,
      zIndexOffset: -1000
    }).addTo(state.map);
      const r = Number(center.radius||0);
      if(isFinite(r) && r>0){
        state.circle = L.circle([center.lat, center.lng], { radius: r }).addTo(state.map);
      }
    }else{
      state.map.setView([-2.5, 117], 5);
    }
  }

  function ensureCenterOverlay(center){
    if(!state.map) return;
    if(!center || !isFinite(center.lat) || !isFinite(center.lng)) return;

    const latlng = [center.lat, center.lng];

    // marker center
    if(!state.centerMarker){
        state.centerMarker = L.marker(latlng, {
          title: center.name || 'Center',
          icon: centerIcon_(),
          interactive: false,
          zIndexOffset: -1000
        }).addTo(state.map);
      }else{
        state.centerMarker.setLatLng(latlng);
      
      state.centerMarker.setLatLng(latlng);
    }

    // circle radius
    const r = Number(center.radius || 0);
    if(isFinite(r) && r > 0){
      if(!state.circle){
        state.circle = L.circle(latlng, { radius: r }).addTo(state.map);
      }else{
        state.circle.setLatLng(latlng);
        state.circle.setRadius(r);
      }
    }else{
      // kalau radius kosong/0, hapus circle lama biar tidak “nyangkut”
      if(state.circle){
        state.map.removeLayer(state.circle);
        state.circle = null;
      }
    }
  }

  function centerIcon_(){
    // titik kecil (center) supaya tidak menutupi marker peserta
    return L.divIcon({
      className: 'lm-center-wrap',
      html: `<div class="lm-center-dot"></div>`,
      iconSize: [10,10],
      iconAnchor: [5,5]
    });
  }

  function markerIcon(row, active){
    // gunakan divIcon agar warna mudah diubah
    const cls = row.in_radius===true ? (active ? 'bg-emerald-600' : 'bg-emerald-300')
                                    : (active ? 'bg-rose-600' : 'bg-rose-300');
    const html = `<div class="lm-pin ${cls}"><div class="lm-pin-inner"></div></div>`;
    return L.divIcon({ className:'lm-marker', html, iconSize:[16,16], iconAnchor:[8,8] });
  }

  function upsertMarkers(rows){
    const seen = new Set();
    for(const r of rows){
      const nik = String(r.nik||'');
      if(!nik) continue;
      seen.add(nik);

      const lat = r.lat, lng = r.lng;
      if(lat==null || lng==null || !isFinite(lat) || !isFinite(lng)) continue;

      const active = calcActive(r);

      let mk = state.markerByNik.get(nik);
      if(!mk){
        mk = L.marker([lat,lng], { icon: markerIcon(r, active), title: nik });
        mk.on('click', ()=> showPopup(mk, r));
        state.markerByNik.set(nik, mk);
        state.cluster.addLayer(mk);
      }else{
        mk.setLatLng([lat,lng]);
        mk.setIcon(markerIcon(r, active));
      }
      mk.__row = r;
      mk.__active = active;
    }

    // cleanup removed
    for(const [nik,mk] of Array.from(state.markerByNik.entries())){
      if(!seen.has(nik)){
        state.cluster.removeLayer(mk);
        state.markerByNik.delete(nik);
      }
    }
  }

  function showPopup(marker, row){
    const active = calcActive(row);
    const status = row.in_radius===true ? 'Dalam radius' : 'Di luar radius';
    const actTxt = active ? 'Aktif' : 'Tidak aktif';
    const region = String(row.region||'-');
    const unit = String(row.unit||'-');
    const html = `
      <div class="text-sm">
        <div class="font-bold">${esc(row.name||'-')}</div>
        <div class="lm-muted">${esc(row.nik||'-')}</div>
        <div class="mt-1 text-xs"><span class="lm-muted">Region</span> <b>${esc(region)}</b> · <span class="lm-muted">Unit</span> <b>${esc(unit)}</b></div>
        <div class="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div><span class="lm-muted">Status</span><div class="font-semibold">${status}</div></div>
          <div><span class="lm-muted">Aktivitas</span><div class="font-semibold">${actTxt}</div></div>
          <div><span class="lm-muted">Jarak</span><div class="font-semibold">${fmtDist(row.distance_m)}</div></div>
          <div><span class="lm-muted">Update</span><div class="font-semibold">${fmtTs(row.updated_at)} (${esc(row.updated_ago||'-')})</div></div>
        </div>
      </div>`;
    marker.bindPopup(html, { maxWidth: 260 }).openPopup();
  }

  function setSelectOptions_(sel, values, labelAll){
    if(!sel) return;
    const cur = sel.value || 'all';
    const uniq = Array.from(new Set(values.filter(v=>String(v||'').trim()!=='').map(v=>String(v).trim()))).sort((a,b)=>a.localeCompare(b));
    const opts = [`<option value="all">${esc(labelAll||'Semua')}</option>`].concat(uniq.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`));
    sel.innerHTML = opts.join('');
    // restore if possible
    if(uniq.includes(cur)) sel.value = cur; else sel.value = 'all';
  }

  function refreshRegionUnitOptions_(rows){
    const filteredForRegion = rows.filter(r=>{
      // region options mengikuti filter dasar (q, scope, active) tapi mengabaikan region/unit agar tidak "mengunci"
      const qBak = state.filter.region; const uBak = state.filter.unit;
      state.filter.region = 'all'; state.filter.unit = 'all';
      const ok = rowPass(r);
      state.filter.region = qBak; state.filter.unit = uBak;
      return ok;
    });
    setSelectOptions_($('#sel-region'), filteredForRegion.map(r=>r.region), 'Semua region');

    // unit options mengikuti region yang dipilih
    const regionSel = state.filter.region;
    const rowsForUnit = filteredForRegion.filter(r=> regionSel==='all' ? true : String(r.region||'').trim()===regionSel);
    setSelectOptions_($('#sel-unit'), rowsForUnit.map(r=>r.unit), 'Semua unit');
  }

  function groupRows_(rows){
    const groups = new Map(); // region -> Map(unit -> rows)
    for(const r of rows){
      const reg = String(r.region||'Tanpa Region').trim() || 'Tanpa Region';
      const uni = String(r.unit||'Tanpa Unit').trim() || 'Tanpa Unit';
      if(!groups.has(reg)) groups.set(reg, new Map());
      const um = groups.get(reg);
      if(!um.has(uni)) um.set(uni, []);
      um.get(uni).push(r);
    }
    // sort entries
    const out = Array.from(groups.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([reg, um])=>{
      const units = Array.from(um.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([uni, arr])=>{
        // newest update first
        arr.sort((a,b)=>(Date.parse(b.updated_at||'')||0)-(Date.parse(a.updated_at||'')||0));
        return { unit: uni, rows: arr };
      });
      return { region: reg, units };
    });
    return out;
  }

  function renderList(rows){
    const el = $('#list');
    if(!el) return;

    const filtered = rows.filter(rowPass);
    if(!filtered.length){
      el.innerHTML = `<div class="text-sm text-slate-500 p-2">Tidak ada data.</div>`;
      return;
    }

    const groups = groupRows_(filtered);
    el.innerHTML = groups.map(g=>{
      const total = g.units.reduce((a,u)=>a+u.rows.length,0);
      return `
      <details class="mb-2" open>
        <summary class="cursor-pointer select-none rounded-2xl border px-3 py-2 bg-white hover:bg-slate-50 flex items-center justify-between">
          <div class="font-bold truncate">${esc(g.region)}</div>
          <div class="text-xs text-slate-500">${total}</div>
        </summary>
        <div class="mt-2 pl-2">
          ${g.units.map(u=>{
            return `
            <details class="mb-2" open>
              <summary class="cursor-pointer select-none rounded-2xl border px-3 py-2 bg-white hover:bg-slate-50 flex items-center justify-between">
                <div class="font-semibold truncate">${esc(u.unit)}</div>
                <div class="text-xs text-slate-500">${u.rows.length}</div>
              </summary>
              <div class="mt-2">
                ${u.rows.map(r=>{
      const active = calcActive(r);
      const dot = r.in_radius===true ? (active?'bg-emerald-600':'bg-emerald-300')
                                     : (active?'bg-rose-600':'bg-rose-300');
      const badge = r.in_radius===true ? 'Dalam radius' : 'Di luar radius';
      const act = active ? 'Aktif' : 'Tidak aktif';
      return `
      <button class="w-full text-left rounded-2xl p-3 lm-row mb-2" data-nik="${esc(r.nik||'')}">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-semibold truncate">${esc(r.name||'-')}</div>
            <div class="text-xs lm-muted truncate">${esc(r.nik||'-')} · ${esc(r.region||'-')} / ${esc(r.unit||'-')}</div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="lm-dot ${dot}"></span>
            <span class="lm-badge">${badge}</span>
          </div>
        </div>
        <div class="mt-2 text-xs lm-muted flex flex-wrap gap-x-3 gap-y-1">
          <span>${act}</span>
          <span>Jarak: <b class="text-slate-700">${fmtDist(r.distance_m)}</b></span>
          <span>Update: <b class="text-slate-700">${fmtTs(r.updated_at)}</b> (${esc(r.updated_ago||'-')})</span>
        </div>
      </button>`;
                }).join('')}
              </div>
            </details>`;
          }).join('')}
        </div>
      </details>`;
    }).join('');

    el.querySelectorAll('button[data-nik]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const nik = btn.getAttribute('data-nik');
        const mk = state.markerByNik.get(nik);
        if(mk){
          state.map.setView(mk.getLatLng(), Math.max(state.map.getZoom(), 16), { animate:true });
          showPopup(mk, mk.__row || {});
        }
      });
    });
  }

  function renderSummary(rows){
    const inRows = rows.filter(r=>r.in_radius===true);
    const outRows = rows.filter(r=>r.in_radius!==true);

    const inA = inRows.filter(r=>calcActive(r)).length;
    const inI = inRows.length - inA;
    const outA = outRows.filter(r=>calcActive(r)).length;
    const outI = outRows.length - outA;

    $('#cnt-in').textContent = String(inRows.length);
    $('#cnt-out').textContent = String(outRows.length);
    $('#cnt-in-a').textContent = String(inA);
    $('#cnt-in-i').textContent = String(inI);
    $('#cnt-out-a').textContent = String(outA);
    $('#cnt-out-i').textContent = String(outI);
  }

  function setError(msg){
    const el = $('#err');
    if(!el) return;
    if(!msg){
      el.classList.add('hidden');
      el.textContent = '';
    }else{
      el.classList.remove('hidden');
      el.textContent = msg;
    }
  }

  async function fetchAndRender(){
    try{
      setError('');
      const data = await post('public.liveLocations', {});
      state.last = data;

      applyBranding_();

      // init map if needed
      ensureMap(data?.center);

      // update center/radius if changed
      ensureCenterOverlay(data?.center);

      // recenter sekali saat pertama kali center valid
      if(data?.center && isFinite(data.center.lat) && isFinite(data.center.lng)){
        if(!state.__centeredOnce){
          state.__centeredOnce = true;
          state.map.setView([data.center.lat, data.center.lng], 15);
          setTimeout(()=>{ try{ state.map.invalidateSize(true); }catch{} }, 50);
        }
      }

      // event loc text
      const c = data?.center || {};
      $('#event-loc').textContent = (c.name || 'Lokasi') + (c.radius?` • radius ${Math.round(c.radius)}m`:'') + (c.address?` • ${c.address}`:'');

      const rows = Array.isArray(data?.rows)? data.rows : [];
      upsertMarkers(rows);
      renderSummary(rows);
      refreshRegionUnitOptions_(rows);
      renderList(rows);

      const now = new Date();
      const pad=(n)=>String(n).padStart(2,'0');
      $('#last-upd').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }catch(err){
      setError(String(err?.message || err));
    }
  }

  function setIntervalSec(sec){
    state.intervalSec = sec;
    if(state.timer) clearInterval(state.timer);
    state.timer = setInterval(fetchAndRender, sec*1000);
  }

  function bindUI(){
    $('#btn-refresh').addEventListener('click', fetchAndRender);

    // mobile panel toggle
    const btnToggle = $('#btn-toggle');
    btnToggle.addEventListener('click', ()=>{
      const panel = $('#panel');
      panel.classList.toggle('hidden');
      // Leaflet perlu invalidateSize saat layout berubah
      try{ if(state.map) setTimeout(()=>state.map.invalidateSize(true), 50); }catch{}
    });
    const btnClose = $('#btn-close-panel');
    if(btnClose){
      btnClose.addEventListener('click', ()=> $('#panel').classList.add('hidden'));
    }
    // click backdrop to close (mobile)
    $('#panel').addEventListener('click', (e)=>{
      if(e.target && e.target.id==='panel'){
        $('#panel').classList.add('hidden');
      }
    });

    $('#sel-interval').addEventListener('change', (e)=>{
      setIntervalSec(Number(e.target.value||5));
    });

    $('#sel-idle').addEventListener('change', (e)=>{
      state.idleMin = Number(e.target.value||10);
      // re-render to update active status
      if(state.last) {
        const rows = Array.isArray(state.last.rows)? state.last.rows : [];
        renderSummary(rows);
        renderList(rows);
        // update marker icons
        upsertMarkers(rows);
      }
    });

    $('#q').addEventListener('input', (e)=>{
      state.filter.q = e.target.value||'';
      if(state.last) renderList(state.last.rows||[]);
    });
    $('#sel-scope').addEventListener('change', (e)=>{
      state.filter.scope = e.target.value||'all';
      if(state.last) renderList(state.last.rows||[]);
    });
    $('#sel-active').addEventListener('change', (e)=>{
      state.filter.active = e.target.value||'all';
      if(state.last){
        refreshRegionUnitOptions_(state.last.rows||[]);
        renderList(state.last.rows||[]);
      }
    });

    $('#sel-region').addEventListener('change', (e)=>{
      state.filter.region = e.target.value||'all';
      if(state.last){
        refreshRegionUnitOptions_(state.last.rows||[]);
        // jika unit jadi invalid, reset
        if($('#sel-unit').value==='all') state.filter.unit = 'all';
        renderList(state.last.rows||[]);
      }
    });

    $('#sel-unit').addEventListener('change', (e)=>{
      state.filter.unit = e.target.value||'all';
      if(state.last) renderList(state.last.rows||[]);
    });

    // quick filter buttons
    $('#btn-in').addEventListener('click', ()=>{
      state.filter.scope = 'in';
      $('#sel-scope').value = 'in';
      if(state.last) renderList(state.last.rows||[]);
    });
    $('#btn-out').addEventListener('click', ()=>{
      state.filter.scope = 'out';
      $('#sel-scope').value = 'out';
      if(state.last) renderList(state.last.rows||[]);
    });

    // show panel by default on desktop
    const panel = $('#panel');
    if(window.innerWidth >= 1024) panel.classList.remove('hidden');
  }

  // ---------- init ----------
  document.addEventListener('DOMContentLoaded', ()=>{
    bindUI();
    // Init map lebih awal agar tidak blank saat fetch gagal
    try{ ensureMap(null); setTimeout(()=>{ try{ state.map && state.map.invalidateSize(true); }catch{} }, 80); }catch(e){ console.warn('Map init failed:', e); }
    setIntervalSec(Number($('#sel-interval').value||5));
    loadRemoteConfig_();
    fetchAndRender();
  });
})();