/* ==========================
   FG2026 - Admin Panel (Loader)
   NOTE: This file keeps backward compatibility.
   It dynamically loads modular scripts in js/admin/ then boots the app.
   ========================== */
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};
  const SCRIPT_URL = (document.currentScript && document.currentScript.src) ? document.currentScript.src : '';
  const SCRIPT_DIR = SCRIPT_URL ? SCRIPT_URL.slice(0, SCRIPT_URL.lastIndexOf('/')+1) : '';
  // admin_panel.js berada di folder js/, maka modul ada di js/admin/
  const BASE = SCRIPT_DIR ? (SCRIPT_DIR + 'admin/') : 'admin/';

  const files = [
    'store.js',
    'core_dom.js',
    'core_drive.js',
    'auth.js',
    'tabs.js',
    'branding.js',
    'participants.js',
    'events.js',
    'prizes.js',
    'users.js',
    'control.js',
    'settings.js',
    'live.js',
    'init.js'
  ];

  function loadScript(src){
    return new Promise((resolve,reject)=>{
      // already loaded?
      const existing = Array.from(document.scripts).find(s=> (s.getAttribute('src')||'').includes(src));
      if(existing){ resolve(); return; }

      const s = document.createElement('script');
      s.src = src;
      s.async = false; // keep order
      s.onload = ()=> resolve();
      s.onerror = ()=> reject(new Error('Gagal load: ' + src));
      document.head.appendChild(s);
    });
  }

  async function boot(){
    try{
      for(const f of files){
        await loadScript(BASE + f);
      }
      if(FGAdmin.init && typeof FGAdmin.init.boot === 'function'){
        await FGAdmin.init.boot();
      }else{
        console.error('FGAdmin.init.boot tidak ditemukan');
      }
    }catch(err){
      console.error(err);
      alert('Admin Panel gagal dimuat: ' + (err.message||err));
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }else{
    boot();
  }
})();