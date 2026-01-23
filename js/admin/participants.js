/* FG2026 - Admin Panel (Modular)
   js/admin/participants.js
*/
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};
  const utils = window.utils || (window.utils = new Utils());

  const { $, $$, htmlEsc, renderTable, getRows, openModal, familyRowTemplate, collectFamily, setFamilyFromArray, bindFamilyRowActions } = FGAdmin.dom;

async function loadParticipants(){
const data = await FGAPI.admin.participantsList(FGAdmin.store.token);
FGAdmin.store.cache.participants = getRows(data);

const box = $('#tab-participants');
box.innerHTML = `
  <div class="flex items-center justify-between gap-3 mb-4">
    <div>
      <h3 class="text-xl font-bold text-gray-800">Peserta</h3>
    </div>
    <button id="p-add" class="bg-gradient-to-r from-blue-600 to-teal-500 text-white px-4 py-2 rounded-xl">
      <i class="fas fa-plus mr-2"></i>Peserta
    </button>
  </div>
`;

const tableWrap = document.createElement('div');
box.appendChild(tableWrap);

renderTable(tableWrap,
  [
    {key:'nik',label:'NIK'},
    {key:'name',label:'Nama'},
    {key:'region',label:'Region'},
    {key:'unit',label:'Unit'},
    {key:'is_staff',label:'Staff?'},
    {key:'family_count',label:'Anggota Keluarga'}
  ],
  FGAdmin.store.cache.participants.map(x=>({
    nik:x.nik, name:x.name, region:x.region, unit:x.unit,
    is_staff: (x.is_staff===true || String(x.is_staff||'').toUpperCase()==='TRUE') ? 'Y' : 'N',
    family_count:(x.family||[]).length
  })),
  (r)=>`<button class="p-edit text-blue-700" data-nik="${htmlEsc(r.nik)}" title="Edit"><i class="fas fa-pen"></i></button>
        <button class="p-del text-red-600 ml-2" data-nik="${htmlEsc(r.nik)}" title="Hapus"><i class="fas fa-trash"></i></button>`
);

function openParticipantForm(cur){
  const isEdit = !!cur;
  openModal({
    title: isEdit ? `Edit Peserta (${cur.nik})` : 'Tambah Peserta',
    saveText: isEdit ? 'Simpan Perubahan' : 'Simpan',
    bodyHtml: `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">NIK</label>
          <input id="p_nik" class="w-full p-3 border rounded-xl" placeholder="Contoh: 12345678" ${isEdit?'disabled':''} />
          ${isEdit?'<div class="text-xs text-gray-500 mt-1">NIK tidak bisa diubah</div>':''}
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Nama Peserta Utama</label>
          <input id="p_name" class="w-full p-3 border rounded-xl" placeholder="Nama sesuai NIK" />
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Region</label>
          <input id="p_region" class="w-full p-3 border rounded-xl" placeholder="Mis: Badau / Kenepai / Empanang" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Unit</label>
          <input id="p_unit" class="w-full p-3 border rounded-xl" placeholder="Mis: SRIE / STWE / SMWE" />
        </div>

        <div class="md:col-span-2">
          <label class="inline-flex items-center gap-2 p-3 border rounded-xl bg-gray-50 cursor-pointer">
            <input id="p_is_staff" type="checkbox" class="w-4 h-4" />
            <span class="font-semibold text-gray-800">STAFF (untuk doorprize)</span>
          </label>
        </div>
      </div>

      <div class="mt-6 p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-teal-50 border">
        <div class="flex items-center justify-between gap-3 mb-3">
          <div>
            <div class="font-bold text-gray-800">Daftar Keluarga</div>
          </div>
          <button id="fam-add" class="px-4 py-2 rounded-xl bg-white border hover:bg-gray-50">
            <i class="fas fa-plus mr-2"></i>Tambah
          </button>
        </div>

        <div id="fam-wrap" class="space-y-2"></div>

        <div class="mt-3 text-xs text-gray-600">
        </div>
      </div>
    `,
    onSave: async ({ root, close })=>{
      const nik = root.querySelector('#p_nik')?.value?.trim() || (cur?.nik||'');
      const name = root.querySelector('#p_name')?.value?.trim() || '';
      const region = root.querySelector('#p_region')?.value?.trim() || '';
      const unit = root.querySelector('#p_unit')?.value?.trim() || '';
      const is_staff = !!root.querySelector('#p_is_staff')?.checked;

      if(!nik){ utils.showNotification('NIK wajib diisi','warning'); return; }
      if(!name){ utils.showNotification('Nama peserta wajib diisi','warning'); return; }

      // keluarga hanya anggota keluarga (tidak boleh mengandung nama utama)
      let family = collectFamily(root);

      // ✅ buang jika ada yang input peserta utama (dengan atau tanpa "(Peserta Utama)")
      const main1 = String(name).trim().toLowerCase();
      family = family.filter(x => {
        const v = String(x||'').trim().toLowerCase();
        if(!v) return false;
        if(v === main1) return false;
        if(v.startsWith(main1 + ' (')) return false; // "Nama (Istri/Suami/..)" tapi itu bisa salah
        if(v === (main1 + ' (peserta utama)')) return false;
        return true;
      });

      await FGAPI.admin.participantsUpsert(FGAdmin.store.token, { nik, name, region, unit, is_staff, family });
      utils.showNotification('Peserta tersimpan','success');
      close();
      await loadParticipants();
    }
  });

  // init values + bind add family row
  const overlay = document.querySelector('.fixed.inset-0.z-\\[9999\\]'); // modal terakhir
  const nikEl = overlay.querySelector('#p_nik');
  const nameEl = overlay.querySelector('#p_name');
  const regionEl = overlay.querySelector('#p_region');
  const unitEl = overlay.querySelector('#p_unit');
  const staffEl = overlay.querySelector('#p_is_staff');

  if(cur){
    nikEl.value = cur.nik || '';
    nameEl.value = cur.name || '';
    regionEl.value = cur.region || '';
    unitEl.value = cur.unit || '';
    staffEl.checked = (cur.is_staff===true || String(cur.is_staff||'').toUpperCase()==='TRUE');
    setFamilyFromArray(overlay, cur.family||[]);
  }else{
    // default 1 row keluarga agar langsung terlihat
    setFamilyFromArray(overlay, []);
    overlay.querySelector('#fam-wrap')?.insertAdjacentHTML('beforeend', familyRowTemplate(0));
    bindFamilyRowActions(overlay);
  }

  overlay.querySelector('#fam-add')?.addEventListener('click', ()=>{
    const wrap = overlay.querySelector('#fam-wrap');
    const idx = wrap.querySelectorAll('.fam-row').length;
    wrap.insertAdjacentHTML('beforeend', familyRowTemplate(idx));
    bindFamilyRowActions(overlay);
  });
}

$('#p-add').onclick = ()=> openParticipantForm(null);

$$('.p-edit', box).forEach(btn=>btn.onclick = ()=>{
  const nik = btn.dataset.nik;
  const cur = FGAdmin.store.cache.participants.find(x=>String(x.nik)===String(nik));
  if(cur) openParticipantForm(cur);
});

$$('.p-del', box).forEach(btn=>btn.onclick = async ()=>{
  const nik = btn.dataset.nik;
  if(!confirm('Hapus peserta '+nik+'?')) return;
  await FGAPI.admin.participantsDelete(FGAdmin.store.token, nik);
  utils.showNotification('Peserta terhapus','info');
  await loadParticipants();
});
}

  FGAdmin.participants = {
    loadParticipants
  };
})();
