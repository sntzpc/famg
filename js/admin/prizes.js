/* FG2026 - Admin Panel (Modular)
   js/admin/prizes.js
*/
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};
  // Ensure global utils instance available in this module
  const utils = window.utils || (window.utils = new Utils());

  const { $, $$, htmlEsc, getRows, openModal, readFileAsDataURL, dataUrlToBase64 } = FGAdmin.dom;
  const { driveIdFromAny, driveImgSrc, bindImgFallback, loadPrizeImgToEl } = FGAdmin.drive;

async function loadPrizes(){
const data = await FGAPI.admin.prizesList(FGAdmin.store.token);
FGAdmin.store.cache.prizes = getRows(data);

const box = $('#tab-prizes');
box.innerHTML = `
  <div class="flex items-center justify-between gap-3 mb-4">
    <div>
      <h3 class="text-xl font-bold text-gray-800">Doorprize</h3>
    </div>
    <button id="d-add" class="bg-gradient-to-r from-purple-600 to-pink-500 text-white px-4 py-2 rounded-xl">
      <i class="fas fa-plus mr-2"></i>Tambah Doorprize
    </button>
  </div>
`;

// render sebagai cards + table (lebih visual)
const list = document.createElement('div');
list.className = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4';
box.appendChild(list);

(FGAdmin.store.cache.prizes||[]).forEach(p=>{
  const active = (p.active===true || String(p.active||'').toUpperCase()==='TRUE');
  const imgIdOrUrl = (p.image_url || '').trim();
const img = imgIdOrUrl
  ? `
    <div class="w-full h-40 rounded-xl border bg-white overflow-hidden relative">
      <div class="absolute inset-0 grid place-items-center text-gray-300" data-ph="1">
        <i class="fas fa-image text-3xl"></i>
      </div>
      <img data-prize-img="1" data-src="${htmlEsc(imgIdOrUrl)}"
          src="" class="w-full h-40 object-cover opacity-0 transition-opacity duration-300" />
    </div>`
  : `<div class="w-full h-40 rounded-xl border bg-gray-50 grid place-items-center text-gray-400"><i class="fas fa-image text-3xl"></i></div>`;

  const card = document.createElement('div');
  card.className = 'bg-white rounded-2xl shadow-lg p-4';
  card.innerHTML = `
    ${img}
    <div class="mt-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="font-bold text-gray-800 truncate">${htmlEsc(p.name||'-')}</div>
          <div class="text-xs text-gray-500">ID: ${htmlEsc(p.id||'-')}</div>
        </div>
        <span class="text-xs px-2 py-1 rounded-full ${active?'bg-green-100 text-green-800':'bg-gray-100 text-gray-600'}">
          ${active?'AKTIF':'NONAKTIF'}
        </span>
      </div>

      <div class="mt-2 text-sm text-gray-700">
        Total: <b>${Number(p.qty_total||0)}</b> &nbsp; | &nbsp; Sisa: <b>${Number(p.qty_remaining||0)}</b>
      </div>

      <div class="mt-3 flex gap-2">
        <button class="d-edit flex-1 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100" data-id="${htmlEsc(p.id)}">
          <i class="fas fa-pen mr-2"></i>Edit
        </button>
        <button class="d-del px-3 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100" data-id="${htmlEsc(p.id)}" title="Hapus">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `;
  list.appendChild(card);
  const imgEl = card.querySelector('img[data-prize-img="1"]');
  if(imgEl){
    const srcVal = imgEl.getAttribute('data-src') || '';
    // ketika dataUrl siap, tampilkan
    imgEl.onload = ()=>{
      imgEl.classList.remove('opacity-0');
      const ph = card.querySelector('[data-ph="1"]');
      if(ph) ph.remove();
    };
    loadPrizeImgToEl(imgEl, srcVal);
  }
});

function openPrizeForm(cur){
const isEdit = !!cur;

// ✅ helper lokal (hindari ORB) – ubah URL drive uc -> googleusercontent
function normalizeDriveImgUrl(url){
  // simpan sebagai ID saja (paling stabil buat backend ambil blob)
  const id = driveIdFromAny(url);
  return id || String(url||'').trim();
}

openModal({
  title: isEdit ? `Edit Doorprize (${cur.id})` : 'Tambah Doorprize',
  saveText: isEdit ? 'Simpan Perubahan' : 'Simpan',
  bodyHtml: `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1">ID</label>
        <input id="d_id" class="w-full p-3 border rounded-xl" placeholder="mis: prize-4" ${isEdit?'disabled':''} />
        ${isEdit?'<div class="text-xs text-gray-500 mt-1">ID tidak bisa diubah</div>':''}
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1">Nama Doorprize</label>
        <input id="d_name" class="w-full p-3 border rounded-xl" placeholder='mis: Smart TV 55"' />
      </div>

      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1">Qty Total</label>
        <input id="d_total" type="number" class="w-full p-3 border rounded-xl" />
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1">Qty Sisa</label>
        <input id="d_remain" type="number" class="w-full p-3 border rounded-xl" />
        <div class="text-xs text-gray-500 mt-1">Jika kosong, akan disamakan dengan Total.</div>
      </div>

      <div class="md:col-span-2">
        <label class="inline-flex items-center gap-2 p-3 border rounded-xl bg-gray-50 cursor-pointer">
          <input id="d_active" type="checkbox" class="w-4 h-4" />
          <span class="font-semibold text-gray-800">Aktif</span>
        </label>
      </div>
    </div>

    <div class="mt-6 p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 border">
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="font-bold text-gray-800">Gambar Doorprize</div>
          <div class="text-sm text-gray-600">Pilih file dari HP/Laptop, lalu upload. URL otomatis tersimpan.</div>
        </div>
        <label class="px-4 py-2 rounded-xl bg-white border hover:bg-gray-50 cursor-pointer">
          <i class="fas fa-upload mr-2"></i>Pilih File
          <input id="d_file" type="file" accept="image/*" class="hidden" />
        </label>
      </div>

      <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div>
          <div class="text-xs text-gray-500 mb-1">Preview</div>
          <div id="d_preview" class="w-full h-44 rounded-xl border bg-white overflow-hidden grid place-items-center text-gray-400">
            <i class="fas fa-image text-3xl"></i>
          </div>
          <div id="d_up_status" class="mt-2 text-sm text-gray-600"></div>
        </div>

        <div>
          <div class="text-xs text-gray-500 mb-1">Image URL (otomatis)</div>
          <input id="d_img_url" class="w-full p-3 border rounded-xl" placeholder="akan terisi setelah upload" />
          <div class="mt-2 text-xs text-gray-500">
            Jika Anda sudah punya URL, boleh paste manual. Namun disarankan upload agar konsisten.
          </div>
        </div>
      </div>
    </div>
  `,
  onSave: async ({ root, close })=>{
    const id = root.querySelector('#d_id')?.value?.trim() || (cur?.id||'');
    const name = root.querySelector('#d_name')?.value?.trim() || '';
    const qty_total = Number(root.querySelector('#d_total')?.value || 0);
    const qty_remain_raw = root.querySelector('#d_remain')?.value;
    const qty_remaining = (qty_remain_raw === '' || qty_remain_raw == null) ? undefined : Number(qty_remain_raw);
    const active = !!root.querySelector('#d_active')?.checked;

    // ✅ normalisasi URL supaya anti ORB
    const image_url = normalizeDriveImgUrl(root.querySelector('#d_img_url')?.value?.trim() || '');

    if(!id){ utils.showNotification('ID wajib diisi','warning'); return; }
    if(!name){ utils.showNotification('Nama doorprize wajib diisi','warning'); return; }
    if(!qty_total || qty_total < 1){ utils.showNotification('Qty total minimal 1','warning'); return; }

    await FGAPI.admin.prizesUpsert(FGAdmin.store.token, {
      id, name, qty_total,
      qty_remaining: (qty_remaining===undefined ? qty_total : qty_remaining),
      image_url,
      active
    });

    utils.showNotification('Doorprize tersimpan','success');
    close();
    await loadPrizes();
  }
});



// init
const overlay = document.querySelector('.fixed.inset-0.z-\\[9999\\]');
const idEl = overlay.querySelector('#d_id');
const nameEl = overlay.querySelector('#d_name');
const totalEl = overlay.querySelector('#d_total');
const remEl = overlay.querySelector('#d_remain');
const activeEl = overlay.querySelector('#d_active');
const urlEl = overlay.querySelector('#d_img_url');
const preview = overlay.querySelector('#d_preview');
const status = overlay.querySelector('#d_up_status');

if(cur){
  idEl.value = cur.id || '';
  nameEl.value = cur.name || '';
  totalEl.value = Number(cur.qty_total||0);
  remEl.value = Number(cur.qty_remaining||0);
  activeEl.checked = (cur.active===true || String(cur.active||'').toUpperCase()==='TRUE');

  // ✅ normalisasi url lama (uc/file/d) -> googleusercontent
  const safeUrl = normalizeDriveImgUrl(cur.image_url || '');
  urlEl.value = safeUrl;

  if(safeUrl){
    const src = driveImgSrc(safeUrl, 900);
    preview.innerHTML = `<img id="d_prev_img" src="${htmlEsc(src)}" class="w-full h-full object-cover" />`;
    const imgEl = overlay.querySelector('#d_prev_img');
    bindImgFallback(imgEl, safeUrl);
  }
}else{
  // default
  activeEl.checked = true;
  totalEl.value = 1;
  remEl.value = 1;
}

// upload handler
overlay.querySelector('#d_file')?.addEventListener('change', async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;

  status.textContent = 'Membaca file...';
  const dataUrl = await readFileAsDataURL(file);

  // preview tetap pakai dataURL lokal (pasti tampil)
  preview.innerHTML = `<img src="${dataUrl}" class="w-full h-full object-cover" />`;

  status.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Upload ke Google Drive...`;

  try{
    const b64 = dataUrlToBase64(dataUrl);
    const up = await FGAPI.admin.uploadPrizeImage(FGAdmin.store.token, file.name, file.type || 'image/jpeg', b64);

    // ✅ utamakan direct_url (anti ORB), fallback ke view_url lalu normalisasi kalau perlu
    const chosen =
      (up && (up.direct_url || up.directUrl)) ||
      (up && (up.view_url || up.viewUrl)) ||
      '';

    // simpan canonical: kalau ada file_id, simpan sebagai uc?export=view&id=ID (paling kompatibel)
    const fileId = (up && (up.file_id || up.fileId)) ? String(up.file_id || up.fileId) : '';
    let finalUrl = '';
    if(fileId){
      finalUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    }else{
      finalUrl = String(chosen||'').trim();
    }
    urlEl.value = finalUrl;

    // OPTIONAL: tes load remote setelah upload (pakai thumbnail + fallback chain)
    const src = driveImgSrc(finalUrl, 900);
    preview.innerHTML = `<img id="d_prev_img" src="${htmlEsc(src)}" class="w-full h-full object-cover" />`;
    bindImgFallback(overlay.querySelector('#d_prev_img'), finalUrl);


    // (opsional) kalau mau test load remote image, uncomment:
    // preview.innerHTML = safe ? `<img src="${htmlEsc(safe)}" class="w-full h-full object-cover" />` : preview.innerHTML;

    status.innerHTML = `<span class="text-green-700 font-semibold"><i class="fas fa-check-circle mr-2"></i>Upload berhasil</span>`;
  }catch(err){
    console.warn(err);
    status.innerHTML = `<span class="text-red-600 font-semibold"><i class="fas fa-exclamation-circle mr-2"></i>Upload gagal: ${htmlEsc(String(err.message||err))}</span>`;
  }
});
}


// add
$('#d-add').onclick = ()=> openPrizeForm(null);

// edit & delete
$$('.d-edit', box).forEach(btn=>btn.onclick = ()=>{
  const id = btn.dataset.id;
  const cur = FGAdmin.store.cache.prizes.find(x=>String(x.id)===String(id));
  if(cur) openPrizeForm(cur);
});

$$('.d-del', box).forEach(btn=>btn.onclick = async ()=>{
  const id = btn.dataset.id;
  if(!confirm('Hapus doorprize '+id+'?')) return;
  await FGAPI.admin.prizesDelete(FGAdmin.store.token, id);
  utils.showNotification('Doorprize terhapus','info');
  await loadPrizes();
});
}

  FGAdmin.prizes = {
    loadPrizes
  };
})();
