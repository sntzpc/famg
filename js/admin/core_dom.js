/* FG2026 - Admin Panel (Modular)
   js/admin/core_dom.js
*/
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};
  const dom = FGAdmin.dom = FGAdmin.dom || {};

  dom.$ = (s,r=document)=>r.querySelector(s);
  dom.$$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

function htmlEsc(s){
  return String(s??'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function renderTable(container, cols, rows, actions){
  const head = cols.map(c=>`<th class="text-left p-2 text-xs uppercase tracking-wider text-gray-500">${htmlEsc(c.label)}</th>`).join('');
  const body = (rows||[]).map(r=>{
    const tds = cols.map(c=>`<td class="p-2 text-sm text-gray-700 whitespace-nowrap">${htmlEsc(r[c.key])}</td>`).join('');
    const act = actions ? `<td class="p-2 text-sm whitespace-nowrap">${actions(r)}</td>` : '';
    return `<tr class="border-t">${tds}${act}</tr>`;
  }).join('');
  container.innerHTML = `
    <div class="overflow-auto">
      <table class="min-w-full">
        <thead><tr>${head}${actions?'<th class="p-2"></th>':''}</tr></thead>
        <tbody>${body||''}</tbody>
      </table>
    </div>
  `;
}

function getRows(data){
  if(!data) return [];
  if(Array.isArray(data.rows)) return data.rows;
  if(Array.isArray(data.items)) return data.items; // fallback backend lama
  return [];
}

function openModal({ title='Form', bodyHtml='', onSave=async()=>{}, saveText='Simpan' }){
const overlay = document.createElement('div');
overlay.className = 'fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4';

overlay.innerHTML = `
  <div class="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden">
    <div class="px-5 py-4 bg-gradient-to-r from-blue-600 to-teal-500 text-white flex items-center justify-between">
      <div class="font-bold text-lg">${htmlEsc(title)}</div>
      <button class="modal-x w-9 h-9 rounded-lg hover:bg-white/15 grid place-items-center">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <div class="p-5 max-h-[75vh] overflow-auto">
      ${bodyHtml}
    </div>

    <div class="px-5 py-4 bg-gray-50 flex items-center justify-end gap-2">
      <button class="modal-cancel px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300">Batal</button>
      <button class="modal-save px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-teal-500 text-white font-semibold hover:opacity-90">
        ${htmlEsc(saveText)}
      </button>
    </div>
  </div>
`;

const close = ()=> overlay.remove();
overlay.querySelector('.modal-x')?.addEventListener('click', close);
overlay.querySelector('.modal-cancel')?.addEventListener('click', close);
overlay.addEventListener('click', (e)=>{ if(e.target === overlay) close(); });

overlay.querySelector('.modal-save')?.addEventListener('click', async ()=>{
  const btn = overlay.querySelector('.modal-save');
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...`;
  try{
    await onSave({ root: overlay, close });
  }finally{
    btn.disabled = false;
    btn.innerHTML = htmlEsc(saveText);
  }
});

document.body.appendChild(overlay);
return overlay;
}

function readFileAsDataURL(file){
return new Promise((resolve,reject)=>{
  const fr = new FileReader();
  fr.onload = ()=> resolve(String(fr.result||''));
  fr.onerror = ()=> reject(new Error('Gagal membaca file'));
  fr.readAsDataURL(file);
});
}

function dataUrlToBase64(dataUrl){
// "data:image/png;base64,AAAA..."
const i = dataUrl.indexOf('base64,');
if(i < 0) return '';
return dataUrl.slice(i + 'base64,'.length);
}

function familyRowTemplate(idx){
return `
  <div class="fam-row grid grid-cols-12 gap-2 items-center" data-idx="${idx}">
    <div class="col-span-4">
      <select class="fam-rel w-full p-3 border rounded-xl">
        <option value="Istri">Istri</option>
        <option value="Suami">Suami</option>
        <option value="Anak">Anak</option>
        <option value="Orang Tua">Orang Tua</option>
        <option value="Saudara">Saudara</option>
        <option value="Lainnya">Lainnya</option>
      </select>
    </div>
    <div class="col-span-7">
      <input class="fam-name w-full p-3 border rounded-xl" placeholder="Nama anggota keluarga" />
    </div>
    <div class="col-span-1 flex justify-end">
      <button class="fam-del w-10 h-10 rounded-xl bg-red-50 text-red-600 hover:bg-red-100" title="Hapus">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  </div>
`;
}

function collectFamily(root){
// hasil: ["Sari Dewi (Istri)", "Rizky (Anak)"]
const rows = Array.from(root.querySelectorAll('.fam-row'));
const out = [];
rows.forEach(r=>{
  const rel = r.querySelector('.fam-rel')?.value?.trim() || 'Lainnya';
  const name = r.querySelector('.fam-name')?.value?.trim() || '';
  if(!name) return;
  out.push(`${name} (${rel})`);
});
return out;
}

function setFamilyFromArray(root, arr){
const wrap = root.querySelector('#fam-wrap');
wrap.innerHTML = '';
(arr||[]).forEach((s, i)=>{
  wrap.insertAdjacentHTML('beforeend', familyRowTemplate(i));
  const row = wrap.lastElementChild;
  // parse "Nama (Rel)" jika formatnya demikian
  const m = String(s).match(/^(.*)\s+\((.*)\)\s*$/);
  const name = m ? m[1].trim() : String(s).trim();
  const rel  = m ? m[2].trim() : 'Lainnya';
  row.querySelector('.fam-name').value = name;
  row.querySelector('.fam-rel').value = rel;
});
bindFamilyRowActions(root);
}

function bindFamilyRowActions(root){
root.querySelectorAll('.fam-del').forEach(btn=>{
  btn.onclick = ()=> btn.closest('.fam-row')?.remove();
});
}

  // =========================
  // Helpers: Modal Field Utils (shared)
  // =========================
  function getVal(root, sel){ return root.querySelector(sel)?.value?.trim() || ''; }
  function getNum(root, sel, def=0){
    const v = root.querySelector(sel)?.value;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }
  function getChecked(root, sel){ return !!root.querySelector(sel)?.checked; }

  dom.htmlEsc = htmlEsc;
  dom.renderTable = renderTable;
  dom.getRows = getRows;
  dom.openModal = openModal;
  dom.readFileAsDataURL = readFileAsDataURL;
  dom.dataUrlToBase64 = dataUrlToBase64;
  dom.familyRowTemplate = familyRowTemplate;
  dom.collectFamily = collectFamily;
  dom.setFamilyFromArray = setFamilyFromArray;
  dom.bindFamilyRowActions = bindFamilyRowActions;
  dom.getVal = getVal;
  dom.getNum = getNum;
  dom.getChecked = getChecked;
})();
