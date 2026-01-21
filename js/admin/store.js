/* FG2026 - Admin Panel (Modular)
   js/admin/store.js
   Shared state: token, me, cache, live, KEY
*/
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};

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
