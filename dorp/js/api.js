// ===============================
// FG2026 - Doorprize API Client (GAS WebApp)
// - POST x-www-form-urlencoded (hindari preflight / OPTIONS)
// ===============================

window.FGAPI = (function(){
  function getURL(){
    return String(window.AppConfig?.api?.url || '').trim();
  }

  function ensureUrl(){
    const URL = getURL();
    if(!URL){
      throw new Error('API URL belum diisi. Isi di config.js -> window.AppConfig.api.url');
    }
    if(URL.includes('PASTE_YOUR_GAS_WEBAPP_URL')){
      throw new Error('API URL masih placeholder. Isi URL Web App GAS yang benar.');
    }
    return URL;
  }

  async function post(action, payload = {}, token = ''){
    const URL = ensureUrl();
    const params = new URLSearchParams();
    params.set('action', action);
    params.set('payload', JSON.stringify(payload || {}));
    if(token && String(token).trim()) params.set('token', String(token).trim());

    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: params.toString()
    });

    const text = await res.text();
    let json;
    try{ json = JSON.parse(text); }catch{
      throw new Error('Respon server bukan JSON. Pastikan URL benar dan Web App sudah Deploy (Access: Anyone).');
    }

    if(!json || json.ok !== true){
      const msg = (json && json.error) ? String(json.error) : 'Gagal memanggil API';
      throw new Error(msg);
    }
    return json.data;
  }

  const auth = {
    login: (username, password) => post('auth.login', { username, password }),
    me: (token) => post('auth.me', {}, token),
    logout: (token) => post('auth.logout', {}, token)
  };

  const operator = {
    prizesList: (token) => post('operator.prizesList', {}, token),
    participantsEligible: (token, onlyStaff = true) => post('operator.participantsEligible', { onlyStaff }, token),
    drawDoorprize: (token, prizeId, count) => post('operator.drawDoorprize', { prizeId, count }, token),
    doorprizeListByPrize: (token, prizeId) => post('operator.doorprizeListByPrize', { prizeId }, token),
    doorprizeRemoveAndRedraw: (token, drawId) => post('operator.doorprizeRemoveAndRedraw', { drawId }, token),
    confirmStage: (token, prizeId) => post('operator.confirmStage', { prizeId }, token)
  };

  const publicApi = {
    getConfig: () => post('public.getConfig', {}),
    getPrizeImageDataUrl: (fileIdOrUrl) => post('public.getPrizeImageDataUrl', { fileId: fileIdOrUrl })
  };

  return { post, auth, operator, public: publicApi };
})();
