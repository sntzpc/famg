/* FG2026 - Admin Panel (Modular)
   js/admin/events.js
*/
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};
  // Ensure global utils instance available in this module
  const utils = window.utils || (window.utils = new Utils());

  const { $, $$, htmlEsc, renderTable, getRows, openModal, getVal, getNum } = FGAdmin.dom;

async function loadEvents(){
const data = await FGAPI.admin.eventsList(FGAdmin.store.token);
FGAdmin.store.cache.events = getRows(data);

const RUNDOWN_TEMPLATE_URL = 'asset/Template_Rundown.xlsx';
const box = $('#tab-events');
box.innerHTML = `
  <div class="flex items-start justify-between gap-3 mb-4 flex-wrap">
    <div class="min-w-0">
      <h3 class="text-xl font-bold text-gray-800">Rundown</h3>
      <p class="text-xs text-gray-500 mt-1">
        Import Excel: kolom minimal <b>day</b>, <b>time</b>, <b>title</b>. Kolom lain opsional.
      </p>
    </div>
    <div class="flex gap-2 flex-wrap justify-end">
    <!-- ✅ NEW: Download Template -->
    <a id="e-template"
       href="${RUNDOWN_TEMPLATE_URL}"
       download="Template_Rundown.xlsx"
       class="bg-white border px-4 py-2 rounded-xl hover:bg-gray-50 inline-flex items-center">
      <i class="fas fa-download mr-2 text-blue-700"></i>Template
    </a>
    <div class="flex gap-2">
      <button id="e-import" class="bg-white border px-4 py-2 rounded-xl hover:bg-gray-50">
        <i class="fas fa-file-excel mr-2 text-green-700"></i>Import XLSX
      </button>
      <button id="e-add" class="bg-gradient-to-r from-blue-600 to-teal-500 text-white px-4 py-2 rounded-xl">
        <i class="fas fa-plus mr-2"></i>Tambah
      </button>
    </div>
  </div>
`;

// table
const tableWrap = document.createElement('div');
box.appendChild(tableWrap);

const curData = await FGAPI.public.getCurrentEvent().catch(()=>({event:null}));
const curId = curData?.event?.id || '';

renderTable(tableWrap,
  [
    {key:'id',label:'ID'},
    {key:'day',label:'Hari'},
    {key:'time',label:'Waktu'},
    {key:'title',label:'Judul'},
  ],
  FGAdmin.store.cache.events
    .slice()
    .sort((a,b)=>Number(a.sort||0)-Number(b.sort||0))
    .map(x=>({
      id:x.id,
      day:x.day,
      time:x.time,
      title:x.title + (String(x.id)===String(curId) ? '  (AKTIF)' : '')
    })),
  (r)=>`<button class="e-set text-green-700" data-id="${htmlEsc(r.id)}" title="Set sebagai aktif"><i class="fas fa-bolt"></i></button>
        <button class="e-edit text-blue-700 ml-2" data-id="${htmlEsc(r.id)}" title="Edit"><i class="fas fa-pen"></i></button>
        <button class="e-del text-red-600 ml-2" data-id="${htmlEsc(r.id)}" title="Hapus"><i class="fas fa-trash"></i></button>`
);

function openEventForm(cur){
  const isEdit = !!cur;
  const overlay = openModal({
    title: isEdit ? `Edit Rundown (${cur.id})` : 'Tambah Rundown',
    saveText: isEdit ? 'Simpan Perubahan' : 'Simpan',
    bodyHtml: `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">ID</label>
          <input id="e_id" class="w-full p-3 border rounded-xl" placeholder="kosongkan agar otomatis" ${isEdit?'disabled':''}/>
          <div class="text-xs text-gray-500 mt-1">Boleh kosong, backend akan buat ID otomatis.</div>
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Urutan (sort)</label>
          <input id="e_sort" type="number" class="w-full p-3 border rounded-xl" placeholder="1" />
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Hari</label>
          <select id="e_day" class="w-full p-3 border rounded-xl">
            <option value="1">Hari 1</option>
            <option value="2">Hari 2</option>
            <option value="3">Hari 3</option>
            <option value="4">Hari 4</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Tanggal (opsional)</label>
          <input id="e_date" class="w-full p-3 border rounded-xl" placeholder="Minggu, 18 Januari 2026" />
        </div>

        <div class="md:col-span-2">
          <label class="block text-sm font-semibold text-gray-700 mb-1">Waktu</label>
          <input id="e_time" class="w-full p-3 border rounded-xl" placeholder="19:30 - 21:00" />
        </div>

        <div class="md:col-span-2">
          <label class="block text-sm font-semibold text-gray-700 mb-1">Judul</label>
          <input id="e_title" class="w-full p-3 border rounded-xl" placeholder="Pengundian Doorprize" />
        </div>

        <div class="md:col-span-2">
          <label class="block text-sm font-semibold text-gray-700 mb-1">Deskripsi</label>
          <textarea id="e_desc" class="w-full p-3 border rounded-xl" rows="3" placeholder="Deskripsi kegiatan"></textarea>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Lokasi</label>
          <input id="e_loc" class="w-full p-3 border rounded-xl" placeholder="Grand Ballroom" />
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Icon (FontAwesome)</label>
          <input id="e_icon" class="w-full p-3 border rounded-xl" placeholder="fa-calendar" />
          <div class="text-xs text-gray-500 mt-1">Contoh: fa-gift, fa-utensils, fa-microphone</div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Warna</label>
          <select id="e_color" class="w-full p-3 border rounded-xl">
            <option value="blue">Blue</option>
            <option value="green">Green</option>
            <option value="purple">Purple</option>
            <option value="orange">Orange</option>
          </select>
        </div>

        <div class="md:col-span-2 p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-teal-50 border">
          <div class="text-sm text-gray-700 font-semibold mb-1">Tips:</div>
          <div class="text-sm text-gray-600">
            Urutan (sort) menentukan urutan tampil di User App. Untuk Hari yang sama, sort 1..n.
          </div>
        </div>
      </div>
    `,
    onSave: async ({ root, close })=>{
      const item = {
        id: getVal(root,'#e_id') || (isEdit ? String(cur.id) : ''),
        day: getNum(root,'#e_day', 1),
        date: getVal(root,'#e_date'),
        time: getVal(root,'#e_time'),
        title: getVal(root,'#e_title'),
        description: getVal(root,'#e_desc'),
        location: getVal(root,'#e_loc'),
        icon: getVal(root,'#e_icon') || 'fa-calendar',
        color: getVal(root,'#e_color') || 'blue',
        sort: getNum(root,'#e_sort', 0),
      };

      // Auto-ID kecil kalau add dan ID kosong (biar manusiawi)
      if(!isEdit && !item.id){
        item.id = uniqEventIdLike(item.day, item.sort);
      }

      const err = validateEventItem(item);
      if(err){ utils.showNotification(err,'warning'); return; }

      await FGAPI.admin.eventsUpsert(FGAdmin.store.token, item);
      utils.showNotification('Rundown tersimpan','success');
      close();
      await loadEvents();
    }
  });

  // init values
  overlay.querySelector('#e_id').value = isEdit ? (cur.id||'') : '';
  overlay.querySelector('#e_day').value = String(isEdit ? (cur.day||1) : 3);
  overlay.querySelector('#e_date').value = isEdit ? (cur.date||'') : '';
  overlay.querySelector('#e_time').value = isEdit ? (cur.time||'') : '';
  overlay.querySelector('#e_title').value = isEdit ? (cur.title||'') : '';
  overlay.querySelector('#e_desc').value = isEdit ? (cur.description||'') : '';
  overlay.querySelector('#e_loc').value = isEdit ? (cur.location||'') : '';
  overlay.querySelector('#e_icon').value = isEdit ? (cur.icon||'fa-calendar') : 'fa-calendar';
  overlay.querySelector('#e_color').value = isEdit ? (cur.color||'blue') : 'blue';
  overlay.querySelector('#e_sort').value = String(isEdit ? (cur.sort||0) : 1);
}

// Tambah event
$('#e-add').onclick = ()=> openEventForm(null);

// Set current event
$$('.e-set', box).forEach(btn=>btn.onclick = async ()=>{
  await FGAPI.admin.setCurrentEvent(FGAdmin.store.token, btn.dataset.id);
  utils.showNotification('Current event diubah','success');
  await FGAdmin.control.renderControl();
  await loadEvents();
});

// Edit
$$('.e-edit', box).forEach(btn=>btn.onclick = ()=>{
  const id = btn.dataset.id;
  const cur = FGAdmin.store.cache.events.find(x=>String(x.id)===String(id));
  if(cur) openEventForm(cur);
});

// Delete
$$('.e-del', box).forEach(btn=>btn.onclick = async ()=>{
  const id = btn.dataset.id;
  if(!confirm('Hapus event '+id+'?')) return;
  await FGAPI.admin.eventsDelete(FGAdmin.store.token, id);
  utils.showNotification('Terhapus','info');
  await loadEvents();
});

// =========================
// Import XLSX (Modal)
// =========================
$('#e-import').onclick = ()=>{
  const overlay = openModal({
    title: 'Import Rundown dari Excel (.xlsx)',
    saveText: 'Import Sekarang',
    bodyHtml: `
      <div class="space-y-4">
        <div class="p-4 rounded-2xl bg-yellow-50 border border-yellow-200 text-yellow-900">
          <div class="font-bold mb-1"><i class="fas fa-info-circle mr-2"></i>Format Excel</div>
          <div class="text-sm">
            Header fleksibel. Minimal: <b>day</b>, <b>time</b>, <b>title</b>.<br/>
            Kolom opsional: id, date, description, location, icon, color, sort.
          </div>
        </div>

        <label class="px-4 py-3 rounded-xl bg-white border hover:bg-gray-50 cursor-pointer inline-flex items-center gap-2">
          <i class="fas fa-file-upload"></i> Pilih File XLSX
          <input id="x_file" type="file" accept=".xlsx" class="hidden" />
        </label>

        <div id="x_stat" class="text-sm text-gray-600"></div>

        <div class="border rounded-2xl overflow-hidden">
          <div class="px-4 py-2 bg-gray-50 text-sm font-semibold text-gray-700">Preview (maks 20 baris)</div>
          <div class="p-4 overflow-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="text-gray-500">
                  <th class="text-left p-2">day</th>
                  <th class="text-left p-2">time</th>
                  <th class="text-left p-2">title</th>
                  <th class="text-left p-2">sort</th>
                </tr>
              </thead>
              <tbody id="x_prev"></tbody>
            </table>
          </div>
        </div>

        <div class="text-xs text-gray-500">
          Import akan melakukan <b>upsert</b> berdasarkan ID (jika ada). Jika ID kosong, akan dibuat ID otomatis.
        </div>
      </div>
    `,
    onSave: async ({ root, close })=>{
      const file = root.querySelector('#x_file')?.files?.[0];
      if(!file){ utils.showNotification('Pilih file XLSX dulu','warning'); return; }

      root.querySelector('#x_stat').innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Membaca file...`;

      const raw = await readXlsxToJson(file);
      const mapped = (raw||[]).map(mapXlsxRowToEvent).filter(x=>x.title || x.time || x.day);

      // validasi minimal
      const invalid = mapped
        .map((it,idx)=>({idx,err:validateEventItem(it)}))
        .filter(x=>x.err);

      if(invalid.length){
        utils.showNotification(`Ada ${invalid.length} baris invalid. Periksa minimal day/time/title.`, 'error');
        root.querySelector('#x_stat').textContent = `Invalid rows: ${invalid.slice(0,5).map(x=>x.idx+2).join(', ')} (baris excel, asumsi header di baris 1)`;
        return;
      }

      root.querySelector('#x_stat').innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Import ${mapped.length} baris...`;

      // upsert satu per satu (aman & sederhana)
      for(let i=0;i<mapped.length;i++){
        const it = mapped[i];
        if(!it.id) it.id = uniqEventIdLike(it.day, it.sort);
        await FGAPI.admin.eventsUpsert(FGAdmin.store.token, it);
      }

      utils.showNotification(`Import selesai: ${mapped.length} rundown`, 'success');
      close();
      await loadEvents();
    }
  });

  // bind file change -> preview
  const stat = overlay.querySelector('#x_stat');
  const prev = overlay.querySelector('#x_prev');
  overlay.querySelector('#x_file')?.addEventListener('change', async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    stat.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Memuat preview...`;
    prev.innerHTML = '';
    try{
      const raw = await readXlsxToJson(file);
      const mapped = (raw||[]).map(mapXlsxRowToEvent).filter(x=>x.title || x.time || x.day);
      stat.textContent = `Terbaca ${mapped.length} baris dari sheet pertama.`;

      mapped.slice(0,20).forEach(it=>{
        const tr = document.createElement('tr');
        tr.className = 'border-t';
        tr.innerHTML = `
          <td class="p-2">${htmlEsc(it.day)}</td>
          <td class="p-2">${htmlEsc(it.time)}</td>
          <td class="p-2">${htmlEsc(it.title)}</td>
          <td class="p-2">${htmlEsc(it.sort)}</td>
        `;
        prev.appendChild(tr);
      });
    }catch(err){
      console.warn(err);
      stat.textContent = 'Gagal membaca XLSX: ' + String(err.message||err);
    }
  });
};
}

function uniqEventIdLike(day, sort){
const d = String(day||1);
const s = String(sort||0);
return `event-${d}-${s}-${Date.now().toString(36)}`;
}

// =========================
// XLSX Import (Rundown)
// =========================

async function readXlsxToJson(file){
if(!window.XLSX) throw new Error('Library XLSX belum dimuat. Pastikan admin.html sudah tambah xlsx.full.min.js');
const buf = await file.arrayBuffer();
const wb = XLSX.read(buf, { type:'array' });
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];
// header: pakai baris pertama
const rows = XLSX.utils.sheet_to_json(ws, { defval:'', raw:false });
return rows; // array of objects by header
}

/**
 * Normalisasi header excel -> field event
 * Dukungan header fleksibel:
 * id, day/hari, date/tanggal, time/waktu, title/judul, description/deskripsi, location/lokasi, icon, color/warna, sort/urutan
 */
function mapXlsxRowToEvent(obj){
const pick = (keys)=> {
for(const k of keys){
  const v = obj[k];
  if(v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
}
return '';
};

const id = pick(['id','ID','Id','event_id','EventID']);
const dayRaw = pick(['day','Day','hari','Hari','HARI']);
const date = pick(['date','Date','tanggal','Tanggal','TANGGAL']);
const time = pick(['time','Time','waktu','Waktu','WAKTU']);
const title = pick(['title','Title','judul','Judul','JUDUL']);
const description = pick(['description','Description','deskripsi','Deskripsi']);
const location = pick(['location','Location','lokasi','Lokasi']);
const icon = pick(['icon','Icon']) || 'fa-calendar';
const color = pick(['color','Color','warna','Warna']) || 'blue';
const sortRaw = pick(['sort','Sort','urutan','Urutan']) || '0';

const day = Number(dayRaw || 0) || 1;
const sort = Number(sortRaw || 0) || 0;

return {
id: id || '',                 // boleh kosong -> backend bikin UUID
day,
date,
time,
title,
description,
location,
icon,
color,
sort
};
}

function validateEventItem(it){
if(!it) return 'Item kosong';
if(!it.title) return 'Judul wajib';
if(!it.time) return 'Waktu wajib';
if(!it.day || it.day < 1) return 'Hari wajib (>=1)';
return '';
}

  FGAdmin.events = {
    loadEvents
  };
})();
