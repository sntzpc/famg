/* FG2026 - Admin Panel (Modular)
   js/admin/auth.js
*/
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};
  // Ensure global utils instance available in this module
  const utils = window.utils || (window.utils = new Utils());

  const { $ } = FGAdmin.dom;

function setBusy(on){
  const b = $('#btn-login');
  if(b) b.disabled = !!on;
}

async function ensureMe(){
  if(!FGAdmin.store.token) return null;
  try{
    const r = await FGAPI.auth.me(FGAdmin.store.token);
    FGAdmin.store.me = r.user;
    return FGAdmin.store.me;
  }catch(e){
    FGAdmin.store.token='';
    localStorage.removeItem(FGAdmin.store.KEY);
    return null;
  }
}

function showLogin(){
  $('#login')?.classList.remove('hidden');
  $('#panel')?.classList.add('hidden');
  $('#btn-logout')?.classList.add('hidden');
}
function showApp(){
  $('#login')?.classList.add('hidden');
  $('#panel')?.classList.remove('hidden');
  $('#btn-logout')?.classList.remove('hidden');
}

async function doLogin(){
  const u = $('#username').value.trim();
  const p = $('#password').value;
  if(!u||!p){ utils.showNotification('Isi username & password','warning'); return; }
  setBusy(true);
  try{
    const data = await FGAPI.auth.login(u,p);
    FGAdmin.store.token = data.token;
    localStorage.setItem(FGAdmin.store.KEY, FGAdmin.store.token);
    FGAdmin.store.me = data.user;
    if(FGAdmin.store.me.role !== 'ADMIN'){
      utils.showNotification('Akun ini bukan ADMIN','error');
      await FGAPI.auth.logout(FGAdmin.store.token).catch(()=>{});
      FGAdmin.store.token=''; localStorage.removeItem(FGAdmin.store.KEY);
      showLogin();
      return;
    }
    utils.showNotification('Login berhasil','success');
    showApp();
    await FGAdmin.init.loadAll();
  }catch(e){
    utils.showNotification(String(e.message||e),'error');
  }finally{ setBusy(false); }
}

async function doLogout(){
  if(FGAdmin.store.token) await FGAPI.auth.logout(FGAdmin.store.token).catch(()=>{});
  FGAdmin.store.token=''; FGAdmin.store.me=null; localStorage.removeItem(FGAdmin.store.KEY);
  showLogin();
  utils.showNotification('Logout','info');
}

  FGAdmin.auth = {
    setBusy,
    ensureMe,
    doLogin,
    doLogout,
    showLogin,
    showApp,
  };
})();
