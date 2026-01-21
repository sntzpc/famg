/* FG2026 - Admin Panel (Modular)
   js/admin/init.js
*/
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};
  const { $ } = FGAdmin.dom;

async function loadAll(){
  await Promise.all([FGAdmin.branding.adminApplyBranding(), FGAdmin.participants.loadParticipants(), FGAdmin.events.loadEvents(), FGAdmin.prizes.loadPrizes(), FGAdmin.users.loadUsers(), FGAdmin.control.renderControl(), FGAdmin.settings.renderSettingsTab(), FGAdmin.live.renderLiveTab()]);
}

  async function boot(){
    FGAdmin.tabs.bindTabs();

    $('#btn-login')?.addEventListener('click', FGAdmin.auth.doLogin);
    $('#password')?.addEventListener('keypress', (e)=>{ if(e.key==='Enter') FGAdmin.auth.doLogin(); });
    $('#btn-logout')?.addEventListener('click', FGAdmin.auth.doLogout);

    const ok = await FGAdmin.auth.ensureMe();
    if(ok && ok.role==='ADMIN'){
      FGAdmin.auth.showApp();
      await loadAll();
    }else{
      FGAdmin.auth.showLogin();
    }
  }

  FGAdmin.init = {
    loadAll,
    boot
  };
})();
