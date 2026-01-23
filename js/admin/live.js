/* FG2026 - Admin Panel (Modular)
   js/admin/live.js
*/
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};
  const { htmlEsc } = FGAdmin.dom;

  // shared live state object
  const live = FGAdmin.store.live;

// ==========================
// ✅ LIVE MAP TAB
// ==========================


function fmtMsAgo(ms){
  if(!Number.isFinite(ms)) return '-';
  const s = Math.max(0, Math.floor(ms/1000));
  if(s < 60) return `${s}s`;
  const m = Math.floor(s/60);
  if(m < 60) return `${m}m`;
  const h = Math.floor(m/60);
  return `${h}h`;
}

async function renderLiveTab(){
  const box = document.getElementById('tab-live');
  if(!box) return;

  box.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <h3 class="text-xl font-bold text-gray-800">Live Map Peserta</h3>
      </div>

      <div class="flex items-center gap-2">
        <button id="live-refresh" class="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200">
          <i class="fas fa-sync mr-2"></i>Refresh
        </button>
        <div class="text-sm text-gray-500">Auto: <span id="live-auto">ON</span></div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2">
        <div id="live-map" class="w-full rounded-2xl border" style="height:min(60vh,480px);"></div>
      </div>

      <div class="space-y-3">
        <div class="rounded-2xl border p-4">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="text-sm text-gray-500">Filter</div>
              <div class="text-xs text-gray-400">Region/Unit/Status/Lokasi</div>
            </div>
            <button id="live-filter-reset" class="px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-xs font-semibold">
              Reset
            </button>
          </div>

          <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label class="text-xs text-gray-500">
              Region
              <select id="live-filter-region" class="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                <option value="all">Semua</option>
              </select>
            </label>
            <label class="text-xs text-gray-500">
              Unit
              <select id="live-filter-unit" class="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                <option value="all">Semua</option>
              </select>
            </label>
            <label class="text-xs text-gray-500">
              Status
              <select id="live-filter-active" class="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                <option value="all">Aktif + Tidak Aktif</option>
                <option value="active">Aktif</option>
                <option value="inactive">Tidak Aktif</option>
              </select>
            </label>
            <label class="text-xs text-gray-500">
              Lokasi
              <select id="live-filter-geo" class="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                <option value="all">Dalam + Luar</option>
                <option value="in">Dalam radius</option>
                <option value="out">Di luar radius</option>
              </select>
            </label>
          </div>
        </div>

        <div class="rounded-2xl border p-4">
          <div class="text-sm text-gray-500">Rekap</div>
          <div class="mt-2 grid grid-cols-2 gap-2">
          <button id="btn-in" class="text-left rounded-xl bg-green-50 border border-green-100 p-3 hover:opacity-90">
            <div class="text-xs text-green-700">Dalam radius</div>
            <div id="cnt-in" class="text-2xl font-extrabold text-green-800">0</div>
            <div class="text-[11px] text-green-700/70 mt-1">Klik: zoom & filter</div>
          </button>

          <button id="btn-out" class="text-left rounded-xl bg-red-50 border border-red-100 p-3 hover:opacity-90">
            <div class="text-xs text-red-700">Di luar radius</div>
            <div id="cnt-out" class="text-2xl font-extrabold text-red-800">0</div>
            <div class="text-[11px] text-red-700/70 mt-1">Klik: zoom & filter</div>
          </button>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-2">
          <button id="btn-all" class="px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-xs font-semibold">
            Tampilkan Semua
          </button>
          <div class="text-xs text-gray-500">Filter: <span id="live-filter" class="font-semibold">ALL</span></div>
        </div>
          <div class="mt-2 text-xs text-gray-500">Last update: <span id="live-last">-</span></div>
        </div>

        <div class="rounded-2xl border p-4">
          <div class="font-semibold text-gray-800 mb-2">Dalam radius</div>
          <div id="tbl-in" class="text-sm text-gray-700"></div>
        </div>

        <div class="rounded-2xl border p-4">
          <div class="font-semibold text-gray-800 mb-2">Di luar radius</div>
          <div id="tbl-out" class="text-sm text-gray-700"></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('live-refresh')?.addEventListener('click', ()=> liveFetchAndRender(true));

  // filter selects
  const $geo = document.getElementById('live-filter-geo');
  const $reg = document.getElementById('live-filter-region');
  const $unit = document.getElementById('live-filter-unit');
  const $act = document.getElementById('live-filter-active');

  if($geo) $geo.addEventListener('change', ()=> liveSetFilters({ geo: $geo.value }, true));
  if($reg) $reg.addEventListener('change', ()=> liveSetFilters({ region: $reg.value }, true));
  if($unit) $unit.addEventListener('change', ()=> liveSetFilters({ unit: $unit.value }, true));
  if($act) $act.addEventListener('change', ()=> liveSetFilters({ active: $act.value }, true));

  document.getElementById('live-filter-reset')?.addEventListener('click', ()=>{
    liveSetFilters({ geo:'all', region:'all', unit:'all', active:'all' }, true);
  });

  // ✅ filter buttons
    document.getElementById('btn-all')?.addEventListener('click', ()=>{
      liveSetFilters({ geo:'all' }, true);
    });
    document.getElementById('btn-in')?.addEventListener('click', ()=>{
      // klik badge = set filter IN + zoom ke yang IN
      liveSetFilters({ geo:'in' }, true);
      liveZoomToGroup('in');
    });
    document.getElementById('btn-out')?.addEventListener('click', ()=>{
      liveSetFilters({ geo:'out' }, true);
      liveZoomToGroup('out');
    });

  // init map & polling ditangani oleh bindTabs() agar tidak dobel listener
}

function liveSetFilters(patch, refresh){
  const st = FGAdmin.store.live;
  const p = patch || {};

  if(p.geo !== undefined){
    st.filterGeo = (p.geo === 'in' || p.geo === 'out') ? p.geo : 'all';
    const sel = document.getElementById('live-filter-geo');
    if(sel) sel.value = st.filterGeo;
  }
  if(p.region !== undefined){
    st.filterRegion = String(p.region||'all');
    const sel = document.getElementById('live-filter-region');
    if(sel) sel.value = st.filterRegion;
  }
  if(p.unit !== undefined){
    st.filterUnit = String(p.unit||'all');
    const sel = document.getElementById('live-filter-unit');
    if(sel) sel.value = st.filterUnit;
  }
  if(p.active !== undefined){
    st.filterActive = (p.active === 'active' || p.active === 'inactive') ? p.active : 'all';
    const sel = document.getElementById('live-filter-active');
    if(sel) sel.value = st.filterActive;
  }

  liveLegendUpdateUI();

  // refresh UI dari lastData tanpa fetch ulang (lebih ringan)
  if(refresh) liveRefreshFromLastData();
}

// backward compat (geo filter)
function liveSetFilter(filter, refresh){
  liveSetFilters({ geo: filter }, refresh);
}

function liveRefreshFromLastData(){
  const data = FGAdmin.store.live.lastData;
  if(!data) return;

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  livePopulateFilterOptions(rows);

  const st = FGAdmin.store.live;
  const filtered = rows.filter(r=>{
    const isInside = (r.in_radius === true);
    const isActive = (r.active === true);
    if(st.filterGeo === 'in' && !isInside) return false;
    if(st.filterGeo === 'out' && isInside) return false;
    if(st.filterActive === 'active' && !isActive) return false;
    if(st.filterActive === 'inactive' && isActive) return false;
    if(st.filterRegion !== 'all' && String(r.region||'') !== String(st.filterRegion)) return false;
    if(st.filterUnit !== 'all' && String(r.unit||'') !== String(st.filterUnit)) return false;
    return true;
  });

  const inside = filtered.filter(x=>x.in_radius===true);
  const outside = filtered.filter(x=>x.in_radius!==true);

  document.getElementById('cnt-in').textContent = inside.length;
  document.getElementById('cnt-out').textContent = outside.length;

  // legend counts
  const c = { in_act:0, in_inact:0, out_act:0, out_inact:0 };
  filtered.forEach(r=>{
    const k = (r.in_radius===true ? 'in' : 'out') + '_' + (r.active===true ? 'act' : 'inact');
    if(k === 'in_act') c.in_act++;
    else if(k === 'in_inact') c.in_inact++;
    else if(k === 'out_act') c.out_act++;
    else if(k === 'out_inact') c.out_inact++;
  });
  const setText = (id, val)=>{ const el = document.getElementById(id); if(el) el.textContent = String(val); };
  setText('leg-in-act', c.in_act);
  setText('leg-in-inact', c.in_inact);
  setText('leg-out-act', c.out_act);
  setText('leg-out-inact', c.out_inact);

  const rowHtml = (arr)=>{
    if(!arr.length) return `<div class="text-xs text-gray-500">-</div>`;
    return `
      <div class="overflow-auto max-h-[240px]">
        <table class="min-w-full text-xs">
          <thead>
            <tr class="text-gray-500">
              <th class="text-left py-1 pr-2">NIK</th>
              <th class="text-left py-1 pr-2">Nama</th>
              <th class="text-left py-1 pr-2">Region/Unit</th>
              <th class="text-left py-1 pr-2">Jarak</th>
              <th class="text-left py-1 pr-2">Update</th>
              <th class="text-left py-1 pr-2">Status</th>
            </tr>
          </thead>
          <tbody>
            ${arr.map(r=>`
              <tr class="border-t">
                <td class="py-1 pr-2">${htmlEsc(r.nik||'')}</td>
                <td class="py-1 pr-2">${htmlEsc(r.name||'')}</td>
                <td class="py-1 pr-2">${htmlEsc((r.region||'-'))}/${htmlEsc((r.unit||'-'))}</td>
                <td class="py-1 pr-2">${htmlEsc(r.distance_m!=null ? Math.round(r.distance_m)+'m' : '-')}</td>
                <td class="py-1 pr-2">${htmlEsc(r.updated_ago||'-')}</td>
                <td class="py-1 pr-2">${r.active===true ? 'Aktif' : 'Nonaktif'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  document.getElementById('tbl-in').innerHTML = rowHtml(inside);
  document.getElementById('tbl-out').innerHTML = rowHtml(outside);

  if(FGAdmin.store.live.map){
    liveRenderMarkersFromLastData(false);
  }
}

  function liveRenderMarkersFromLastData(forceFit){
  const data = FGAdmin.store.live.lastData;
  if(!data || !FGAdmin.store.live.map) return;

  const center = data?.center || null;
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  if(!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;

  FGAdmin.store.live.lastCenter = center;

  // circle lokasi event
  if(FGAdmin.store.live.centerCircle) FGAdmin.store.live.centerCircle.remove();
  FGAdmin.store.live.centerCircle = L.circle([center.lat, center.lng], { radius: Number(center.radius||0) }).addTo(FGAdmin.store.live.map);

  // clear clusters
  const clusters = FGAdmin.store.live.clusters;
  if(clusters){
    Object.values(clusters).forEach(g=>{
      try{ g.clearLayers?.(); }catch{}
    });
  }

  const pts = [];
  rows.forEach(r=>{
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    if(!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const isInside = (r.in_radius === true);
    const isActive = (r.active === true);

    // ===== apply smart filters =====
    const st = FGAdmin.store.live;
    if(st.filterGeo === 'in' && !isInside) return;
    if(st.filterGeo === 'out' && isInside) return;
    if(st.filterActive === 'active' && !isActive) return;
    if(st.filterActive === 'inactive' && isActive) return;
    if(st.filterRegion !== 'all' && String(r.region||'') !== String(st.filterRegion)) return;
    if(st.filterUnit !== 'all' && String(r.unit||'') !== String(st.filterUnit)) return;

    pts.push([lat, lng]);

    const txt = `
      <div style="font-weight:700">${htmlEsc(r.name||'')}</div>
      <div>NIK: ${htmlEsc(r.nik||'')}</div>
      <div>Region/Unit: ${htmlEsc((r.region||'-'))} / ${htmlEsc((r.unit||'-'))}</div>
      <div>Jarak: ${htmlEsc(r.distance_m!=null ? Math.round(r.distance_m)+'m' : '-')}</div>
      <div>Update: ${htmlEsc(r.updated_ago||'-')}</div>
      <div>Status: <b>${isInside ? 'DALAM' : 'LUAR'}</b> · <b>${isActive ? 'AKTIF' : 'TIDAK AKTIF'}</b></div>
    `;

    const marker = liveMakeDotMarker(lat, lng, isInside, isActive).bindPopup(txt);
    const key = `${isInside ? 'in' : 'out'}_${isActive ? 'active' : 'inactive'}`;
    if(clusters && clusters[key]) clusters[key].addLayer(marker);
  });

  FGAdmin.store.live.lastPts = pts;

  // fit bounds
  const fitPts = [[center.lat, center.lng], ...pts];
  if(fitPts.length){
    const b = L.latLngBounds(fitPts).pad(0.25);
    if(forceFit){
      FGAdmin.store.live.map.fitBounds(b);
      FGAdmin.store.live.hasFitOnce = true;
    }
  }

  try{ FGAdmin.store.live.map.invalidateSize(false); }catch{}
}

function liveZoomToGroup(group){ // group: 'in' | 'out' | 'all'
  const data = FGAdmin.store.live.lastData;
  if(!data || !FGAdmin.store.live.map) return;

  const center = FGAdmin.store.live.lastCenter || data.center;
  const rows = Array.isArray(data?.rows) ? data.rows : [];

  const pts = [];
  const st = FGAdmin.store.live;
  rows.forEach(r=>{
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    if(!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const isInside = (r.in_radius === true);
    const isActive = (r.active === true);

    // keep other filters
    if(st.filterActive === 'active' && !isActive) return;
    if(st.filterActive === 'inactive' && isActive) return;
    if(st.filterRegion !== 'all' && String(r.region||'') !== String(st.filterRegion)) return;
    if(st.filterUnit !== 'all' && String(r.unit||'') !== String(st.filterUnit)) return;

    // override geo group param
    if(group === 'in' && !isInside) return;
    if(group === 'out' && isInside) return;
    pts.push([lat, lng]);
  });

  // kalau kosong, minimal zoom ke center
  if(!pts.length && center && Number.isFinite(center.lat) && Number.isFinite(center.lng)){
    FGAdmin.store.live.map.setView([center.lat, center.lng], 16);
    return;
  }

  const fitPts = (center && Number.isFinite(center.lat) && Number.isFinite(center.lng))
    ? [[center.lat, center.lng], ...pts]
    : pts;

  const b = L.latLngBounds(fitPts).pad(0.30);
  FGAdmin.store.live.map.fitBounds(b);
}

async function liveInitMap(){
  const el = document.getElementById('live-map');
  if(!el || FGAdmin.store.live.map) return;

  // tunggu loader Leaflet (robust loader di admin.html)
  try{
    if(window.__FG_LEAFLET_READY__) await window.__FG_LEAFLET_READY__;
  }catch(e){}
  if(!window.L){ el.innerHTML = '<div class="p-4 text-red-600">Leaflet tidak ter-load. Periksa koneksi / CDN / path libs.</div>'; return; }

  FGAdmin.store.live.map = L.map(el, { zoomControl:true });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(FGAdmin.store.live.map);

  // ✅ 4 Cluster group: in/out x active/inactive
  // Agar di legenda & cluster bisa dibedakan status aktif/tidak aktif.
  const mkCluster = (cls)=>{
    if(window.L.MarkerClusterGroup){
      return L.markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 18,
        maxClusterRadius: 60,
        iconCreateFunction: (cluster)=>{
          const count = cluster.getChildCount();
          return L.divIcon({
            html: `<div class="live-cluster ${cls}"><span>${count}</span></div>`,
            className: '',
            iconSize: [34,34]
          });
        }
      }).addTo(FGAdmin.store.live.map);
    }
    // fallback
    return L.layerGroup().addTo(FGAdmin.store.live.map);
  };

  FGAdmin.store.live.clusters = {
    in_active: mkCluster('in active'),
    in_inactive: mkCluster('in inactive'),
    out_active: mkCluster('out active'),
    out_inactive: mkCluster('out inactive'),
  };

  FGAdmin.store.live.map.setView([0,0], 2);
  liveEnsureLegend();
}

function liveStartPolling(){
  liveStopPolling();
  FGAdmin.store.live.polling = setInterval(()=> liveFetchAndRender(false), 10000);
  const el = document.getElementById('live-auto');
  if(el) el.textContent = 'ON';
}
function liveStopPolling(){
  if(FGAdmin.store.live.polling) clearInterval(FGAdmin.store.live.polling);
  FGAdmin.store.live.polling = null;
  const el = document.getElementById('live-auto');
  if(el) el.textContent = 'OFF';
}

function liveMakeDotMarker(lat, lng, isInside, isActive){
  const cls = `${isInside ? 'in' : 'out'} ${isActive ? 'active' : 'inactive'}`;
  const icon = L.divIcon({
    className: '', // kosong supaya tidak ada style default
    html: `<div class="live-dot ${cls}"></div>`,
    iconSize: [12,12],
    iconAnchor: [6,6]
  });
  return L.marker([lat, lng], { icon });
}

function liveEnsureLegend(){
const mapEl = document.getElementById('live-map');
if(!mapEl) return;
if(mapEl.querySelector('.live-legend')) return;

// pastikan parent bisa jadi anchor absolute
mapEl.style.position = mapEl.style.position || 'relative';

const div = document.createElement('div');
div.className = 'live-legend';
div.innerHTML = `
  <div class="hdr">
    <div class="ttl"><i class="fas fa-location-dot"></i> Live</div>
    <button type="button" class="toggle" data-toggle title="Tampilkan/Sembunyikan">
      <i class="fas fa-sliders"></i>
    </button>
  </div>
  <div class="body">
    <div class="muted">Ringkasan (sesuai filter)</div>

    <div class="row" style="flex-wrap:wrap">
      <span class="pill" title="Dalam radius & aktif"><span class="live-dot in active"></span> Dalam · Aktif: <b id="leg-in-act">0</b></span>
      <span class="pill" title="Dalam radius & tidak aktif"><span class="live-dot in inactive"></span> Dalam · Nonaktif: <b id="leg-in-inact">0</b></span>
      <span class="pill" title="Luar radius & aktif"><span class="live-dot out active"></span> Luar · Aktif: <b id="leg-out-act">0</b></span>
      <span class="pill" title="Luar radius & tidak aktif"><span class="live-dot out inactive"></span> Luar · Nonaktif: <b id="leg-out-inact">0</b></span>
    </div>

    <div class="row" style="margin-top:10px; flex-wrap:wrap">
      <button type="button" data-f="all">Semua Lokasi</button>
      <button type="button" data-f="in">Dalam</button>
      <button type="button" data-f="out">Luar</button>
    </div>
    <div class="row" style="margin-top:6px; flex-wrap:wrap">
      <button type="button" data-a="all">Aktif+Nonaktif</button>
      <button type="button" data-a="active">Aktif</button>
      <button type="button" data-a="inactive">Nonaktif</button>
    </div>
  </div>
`;

// bind click
div.querySelectorAll('button[data-f]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const f = btn.getAttribute('data-f') || 'all';
    liveSetFilter(f, true);
  });
});

div.querySelectorAll('button[data-a]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const a = btn.getAttribute('data-a') || 'all';
    liveSetFilters({ active: a }, true);
  });
});

div.querySelector('[data-toggle]')?.addEventListener('click', ()=>{
  div.classList.toggle('is-collapsed');
});

mapEl.appendChild(div);
liveLegendUpdateUI();
}

function liveLegendUpdateUI(){
  const mapEl = document.getElementById('live-map');
  const legend = mapEl?.querySelector('.live-legend');
  if(!legend) return;

  const st = FGAdmin.store.live;

  legend.querySelectorAll('button[data-f]').forEach(btn=>{
    const f = btn.getAttribute('data-f');
    btn.classList.toggle('active', f === st.filterGeo);
  });

  legend.querySelectorAll('button[data-a]').forEach(btn=>{
    const a = btn.getAttribute('data-a');
    btn.classList.toggle('active', a === st.filterActive);
  });

  const lab = document.getElementById('live-filter');
  if(lab){
    const geo = st.filterGeo;
    const a = st.filterActive;
    const geoText = (geo === 'in') ? 'DALAM' : (geo === 'out') ? 'LUAR' : 'ALL';
    const actText = (a === 'active') ? 'AKTIF' : (a === 'inactive') ? 'NONAKTIF' : 'ALL';
    lab.textContent = `${geoText} · ${actText}`;
  }
}

function livePopulateFilterOptions(rows){
  const regSel = document.getElementById('live-filter-region');
  const unitSel = document.getElementById('live-filter-unit');
  if(!regSel || !unitSel) return;

  const st = FGAdmin.store.live;

  const uniq = (arr)=> Array.from(new Set(arr.map(x=>String(x||'').trim()).filter(x=>x && x !== 'undefined' && x !== 'null')));
  const regions = uniq(rows.map(r=>r.region)).sort((a,b)=> a.localeCompare(b, 'id'));
  const units = uniq(rows.map(r=>r.unit)).sort((a,b)=> a.localeCompare(b, 'id'));

  // preserve selection
  const curR = st.filterRegion || regSel.value || 'all';
  const curU = st.filterUnit || unitSel.value || 'all';

  const fill = (sel, items, curVal, labelAll)=>{
    const opts = [`<option value="all">${labelAll}</option>`].concat(items.map(v=>`<option value="${htmlEsc(v)}">${htmlEsc(v)}</option>`));
    sel.innerHTML = opts.join('');
    const keep = (curVal !== 'all' && items.includes(curVal)) ? curVal : 'all';
    sel.value = keep;
  };

  fill(regSel, regions, curR, 'Semua');
  fill(unitSel, units, curU, 'Semua');

  // sync state
  st.filterRegion = regSel.value;
  st.filterUnit = unitSel.value;
}

function liveRefreshFromLastData(forceFit){
  const data = FGAdmin.store.live.lastData;
  if(!data) return;
  const rows = Array.isArray(data?.rows) ? data.rows : [];

  // build filter options (region/unit) from ALL rows
  livePopulateFilterOptions(rows);

  // apply smart filters
  const st = FGAdmin.store.live;
  const filtered = rows.filter(r=>{
    const isInside = (r.in_radius === true);
    const isActive = (r.active === true);
    if(st.filterGeo === 'in' && !isInside) return false;
    if(st.filterGeo === 'out' && isInside) return false;
    if(st.filterActive === 'active' && !isActive) return false;
    if(st.filterActive === 'inactive' && isActive) return false;
    if(st.filterRegion !== 'all' && String(r.region||'') !== String(st.filterRegion)) return false;
    if(st.filterUnit !== 'all' && String(r.unit||'') !== String(st.filterUnit)) return false;
    return true;
  });

  const inside = filtered.filter(x=>x.in_radius===true);
  const outside = filtered.filter(x=>x.in_radius!==true);

  // counters
  const $in = document.getElementById('cnt-in');
  const $out = document.getElementById('cnt-out');
  if($in) $in.textContent = String(inside.length);
  if($out) $out.textContent = String(outside.length);
  const $last = document.getElementById('live-last');
  if($last) $last.textContent = new Date().toLocaleTimeString('id-ID');

  // legend category counts
  const c = { in_act:0, in_inact:0, out_act:0, out_inact:0 };
  filtered.forEach(r=>{
    const k = (r.in_radius===true ? 'in' : 'out') + '_' + (r.active===true ? 'act' : 'inact');
    if(k === 'in_act') c.in_act++;
    else if(k === 'in_inact') c.in_inact++;
    else if(k === 'out_act') c.out_act++;
    else if(k === 'out_inact') c.out_inact++;
  });
  const setText = (id, val)=>{ const el = document.getElementById(id); if(el) el.textContent = String(val); };
  setText('leg-in-act', c.in_act);
  setText('leg-in-inact', c.in_inact);
  setText('leg-out-act', c.out_act);
  setText('leg-out-inact', c.out_inact);

  // tables
  const rowHtml = (arr)=>{
    if(!arr.length) return `<div class="text-xs text-gray-500">-</div>`;
    return `
      <div class="overflow-auto max-h-[240px]">
        <table class="min-w-full text-xs">
          <thead>
            <tr class="text-gray-500">
              <th class="text-left py-1 pr-2">NIK</th>
              <th class="text-left py-1 pr-2">Nama</th>
              <th class="text-left py-1 pr-2">Region/Unit</th>
              <th class="text-left py-1 pr-2">Jarak</th>
              <th class="text-left py-1 pr-2">Update</th>
              <th class="text-left py-1 pr-2">Status</th>
            </tr>
          </thead>
          <tbody>
            ${arr.map(r=>`
              <tr class="border-t">
                <td class="py-1 pr-2">${htmlEsc(r.nik||'')}</td>
                <td class="py-1 pr-2">${htmlEsc(r.name||'')}</td>
                <td class="py-1 pr-2">${htmlEsc((r.region||'-'))}/${htmlEsc((r.unit||'-'))}</td>
                <td class="py-1 pr-2">${htmlEsc(r.distance_m!=null ? Math.round(r.distance_m)+'m' : '-')}</td>
                <td class="py-1 pr-2">${htmlEsc(r.updated_ago||'-')}</td>
                <td class="py-1 pr-2">${r.active===true ? 'Aktif' : 'Nonaktif'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  };
  const $tblIn = document.getElementById('tbl-in');
  const $tblOut = document.getElementById('tbl-out');
  if($tblIn) $tblIn.innerHTML = rowHtml(inside);
  if($tblOut) $tblOut.innerHTML = rowHtml(outside);

  // map markers
  if(FGAdmin.store.live.map){
    liveRenderMarkersFromLastData(!!forceFit);
  }
}

async function liveFetchAndRender(force){
  try{
    const data = await FGAPI.admin.liveLocations(FGAdmin.store.token);
    FGAdmin.store.live.lastData = data;
    liveRefreshFromLastData(!!force);

  }catch(e){
    console.warn('liveFetchAndRender error', e);
  }
}

  // expose
  FGAdmin.live = {
    renderLiveTab,
    liveStartPolling,
    liveStopPolling,
    liveFetchAndRender,
    liveInitMap,
    liveSetFilter,
    liveZoomToGroup,
  };
})();
