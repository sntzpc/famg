/* FG2026 - Admin Panel (Modular)
   js/admin/store.js
   Shared state: token, me, cache, live, KEY
*/
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};
  // Ensure global utils instance available in this module
  const utils = window.utils || (window.utils = new Utils());


  // ==========================
  // ✅ Ensure global `utils` exists for admin modules
  // Many admin modules call `utils.showNotification(...)`.
  // File js/utils.js defines class `Utils`, but does not always create
  // an instance named `window.utils`. If missing, it causes:
  //   ReferenceError: utils is not defined
  // We create it here because store.js is loaded first by admin_panel.js.
  // ==========================
  (function ensureGlobalUtils(){
    try{
      if(window.utils) { FGAdmin.utils = window.utils; return; }
      if(typeof window.Utils === 'function'){
        window.utils = new window.Utils();
        FGAdmin.utils = window.utils;
        return;
      }
    }catch{}
    // Minimal fallback (keeps UI usable even if Utils class is missing)
    window.utils = window.utils || {
      showNotification: (msg)=>{ try{ alert(String(msg||'')); }catch{} }
    };
    FGAdmin.utils = window.utils;
  })();

  const KEY = 'fg_admin_token_v1';
  let token = '';
  try{ token = localStorage.getItem(KEY) || ''; }catch{ token = ''; }

  FGAdmin.store = {
    KEY,
    get token(){ return token; },
    set token(v){ 
      token = String(v||'');
      try{
        if(token) localStorage.setItem(KEY, token);
        else localStorage.removeItem(KEY);
      }catch{}
    },
    me: null,
    cache: { participants:[], events:[], prizes:[], users:[], live:[] },
    live: {
      map: null,
      // 4 cluster group: in/out x active/inactive
      clusters: null,
      centerCircle: null,
      polling: null,
      lastData: null,
      hasFitOnce: false,

      // ===== filters =====
      filterGeo: 'all',     // 'all' | 'in' | 'out'
      filterRegion: 'all',  // 'all' | <region>
      filterUnit: 'all',    // 'all' | <unit>
      filterActive: 'all',  // 'all' | 'active' | 'inactive'

      lastCenter: null,
      lastPts: []
    },
  };
})();
