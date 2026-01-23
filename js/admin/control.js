/* FG2026 - Admin Panel (Modular)
   js/admin/control.js
*/
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};
  // Ensure global utils instance available in this module
  const utils = window.utils || (window.utils = new Utils());

  const { $ , htmlEsc } = FGAdmin.dom;
  const { openModal } = FGAdmin.dom;

async function renderControl(){
  const box = $('#tab-control');
  let cur = null;
  try{ cur = await FGAPI.public.getCurrentEvent(); }catch{}
  const curTitle = cur?.event?.title || '-';
  const curId = cur?.event?.id || '';

  box.innerHTML = `
    <h3 class="text-xl font-bold text-gray-800 mb-2">Kontrol Cepat</h3>

    <div class="p-4 bg-gradient-to-r from-blue-50 to-teal-50 rounded-2xl mb-6">
      <div class="text-gray-700">Current Event:</div>
      <div class="text-lg font-bold text-gray-900">${htmlEsc(curTitle)}</div>
      <div class="text-sm text-gray-500">${htmlEsc(curId)}</div>
      <div class="mt-4 flex flex-wrap gap-3">
        <a href="doorprize.html" class="bg-gradient-to-r from-purple-600 to-pink-500 text-white px-4 py-2 rounded-xl">
          <i class="fas fa-gift mr-2"></i>Doorprize
        </a>
        <a href="rundown.html" class="bg-gradient-to-r from-blue-600 to-teal-500 text-white px-4 py-2 rounded-xl">
          <i class="fas fa-calendar mr-2"></i>Rundown
        </a>
      </div>
    </div>

    <!-- ✅ Pengaturan Aplikasi -->
    <div class="bg-white rounded-2xl border p-5">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="min-w-0">
          <div class="text-lg font-bold text-gray-800">Pengaturan Aplikasi</div>
        </div>
        <div class="flex gap-2">
          <button id="cfg-open-settings" class="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-teal-500 text-white">
            <i class="fas fa-sliders-h mr-2"></i>Pengaturan
          </button>
          <button id="cfg-reset" class="px-4 py-2 rounded-xl bg-white border hover:bg-gray-50">
            <i class="fas fa-undo mr-2"></i>Reset
          </button>
        </div>
      </div>
    </div>
  `;

  $('#cfg-open-settings')?.addEventListener('click', ()=>{
    // arahkan ke tab Pengaturan
    document.querySelector('.tab-btn[data-tab="settings"]')?.click();
  });
  $('#cfg-reset')?.addEventListener('click', openConfigResetModal);
}

function openConfigResetModal(){
  const overlay = openModal({
    title: 'Reset Override Config',
    saveText: 'Reset Sekarang',
    bodyHtml: `
      <div class="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800">
        <div class="font-bold mb-1"><i class="fas fa-exclamation-triangle mr-2"></i>Peringatan</div>
        <div class="text-sm">
          Ini akan menghapus override config di server (kembali ke default config.js / default backend).
          User app akan ikut kembali setelah FGAdmin.store.cache lewat (beberapa menit) atau setelah refresh.
        </div>
      </div>
    `,
    onSave: async ({ close })=>{
      await FGAPI.admin.configSet(FGAdmin.store.token, {}); // simpan patch kosong
      utils.showNotification('Override config direset', 'success');
      close();
    }
  });
}

  FGAdmin.control = {
    renderControl,
    openConfigResetModal
  };
})();
