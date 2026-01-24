// utils.js - minimal helper for Rundown Operator
(function(){
  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function $(sel, root=document){ return root.querySelector(sel); }
  function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  window.utils = {
    esc, $, $all,
    // small helper: safely read AppConfig
    getConfig(){ return window.AppConfig || {}; },
    // format "Hari X" label
    dayLabel(day){ const d = Number(day||0); return 'Hari ' + (isFinite(d) && d>=1 ? Math.floor(d) : 1); }
  };
})();