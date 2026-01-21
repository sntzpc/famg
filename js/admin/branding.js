/* FG2026 - Admin Panel (Modular)
   js/admin/branding.js
*/
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};

async function adminApplyBranding(){
  try{
    const res = await FGAPI.admin.configGet(FGAdmin.store.token);
    const cfg = res?.config || {};
    const brand = cfg?.app?.brand || {};

    const subtitle = String(brand.adminSubtitle || cfg?.event?.name || '').trim();
    const appName = String(brand.appName || 'Admin Panel').trim();

    const el = document.getElementById('admin-subtitle');
    if(el && subtitle) el.textContent = subtitle;
    if(appName) document.title = `Admin Panel - ${appName}`;
  }catch(e){
    // no-op
  }
}

  FGAdmin.branding = {
    adminApplyBranding
  };
})();
