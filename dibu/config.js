/* ===============================
   FG2026 - Doorprize Standalone
   config.js

   - Isi API URL Web App GAS (akhiran /exec)
   - Branding bisa dioverride dari sheet: app_config (public.getConfig)
     Header: key | value_json | updated_at | updated_by

     Contoh isi app_config:
       key: app.brand.appName
       value_json: "Doorprize FG2026"

       key: event.name
       value_json: "Family Gathering KMP-2 2026"

       key: app.pages.doorprize.headerTitle
       value_json: "Doorprize"
   =============================== */

(function(){
  // Deep merge (object-only)
  function deepMerge(target, src){
    if(!src || typeof src !== 'object' || Array.isArray(src)) return target;
    Object.keys(src).forEach((k)=>{
      const sv = src[k];
      const tv = target[k];
      if(sv && typeof sv === 'object' && !Array.isArray(sv)){
        if(!tv || typeof tv !== 'object' || Array.isArray(tv)) target[k] = {};
        deepMerge(target[k], sv);
      }else{
        target[k] = sv;
      }
    });
    return target;
  }

  // Default config (aman untuk kosong)
  const cfg = {
    api: {
      url: "https://script.google.com/macros/s/AKfycbwiGTqi8duOM0159DnLHyF-Aqs3_BEXEx_IVRo0IikQhvFQLVqR7qmUZDp2dwnX3jg2PQ/exec"
    },
    // ✅ Bypass Login (opsional)
    // Jika bypass=true, halaman doorprize langsung login otomatis tanpa input form.
    // Default akun backend (lihat README.txt): operator/operator123 atau admin/admin123
    auth: {
      bypass: true,
      username: "operator",
      password: "operator123"
    },
    app: {
      notificationTimeout: 4500,
      brand: {
        appName: 'Doorprize',
        shortName: 'FG',
        headerTitle: 'Doorprize',
        headerSubtitle: 'Operator / Admin',
        adminSubtitle: ''
      },
      pages: {
        doorprize: {
          docTitle: '{eventName} • Doorprize',
          headerTitle: 'Doorprize',
          headerSubtitle: 'Operator / Admin',
          machineEventName: '{eventName}',
          stageLabel: 'Doorprize'
        }
      }
    },
    event: {
      name: 'Family Gathering',
      eventStartDate: '',
      eventEndDate: '',
      galaDinnerDate: '',
      galaDinnerEndTime: '',
      location: {
        name: '',
        address: ''
      }
    }
  };

  // Dipakai oleh branding.js
  cfg.applyPatch = function(patch, persist){
    try{
      if(!patch || typeof patch !== 'object') return cfg;
      deepMerge(cfg, patch);
      if(persist){
        try{ localStorage.setItem('fg_app_config_patch_v1', JSON.stringify(patch)); }catch(_){/* ignore */}
      }
    }catch(_){/* ignore */}
    return cfg;
  };

  // Apply cached patch (jika pernah sukses load config server)
  try{
    const cached = localStorage.getItem('fg_app_config_patch_v1');
    if(cached){
      const p = JSON.parse(cached);
      if(p && typeof p === 'object') cfg.applyPatch(p, false);
    }
  }catch(_){/* ignore */}

  window.AppConfig = cfg;
})();
