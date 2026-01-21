/* FG2026 - Admin Panel (Modular)
   js/admin/tabs.js
*/
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};
  const { $, $$ } = FGAdmin.dom;

function bindTabs(){
  $$('.tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
    const tab = btn.dataset.tab;

    // ✅ kalau keluar dari Live tab, stop polling
    if(tab !== 'live'){
      // aman kalau modul live belum siap
      try{ FGAdmin.live?.liveStopPolling?.(); }catch{}
    }

    $$('.tab-btn').forEach(b=>b.className = 'tab-btn px-4 py-2 rounded-xl bg-gray-100');
    btn.className = 'tab-btn px-4 py-2 rounded-xl bg-blue-600 text-white';
    $$('.tab').forEach(t=>t.classList.add('hidden'));
    $('#tab-'+tab)?.classList.remove('hidden');

    // ✅ ketika masuk tab live, init map + start polling
    if(tab === 'live'){
      try{
        FGAdmin.live?.liveInitMap?.();
        FGAdmin.live?.liveStartPolling?.();
        FGAdmin.live?.liveFetchAndRender?.(true);
      }catch(e){ console.warn('Live init error', e); }
    }
  });
  });
}

  FGAdmin.tabs = {
    bindTabs
  };
})();
