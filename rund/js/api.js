// api.js - minimal GAS WebApp client for Rundown Operator
// Request: POST x-www-form-urlencoded (hindari preflight)
window.FGAPI = (function(){
  function url(){
    const u = String(window.AppConfig?.api?.url || '').trim();
    if(!u || u.includes('PASTE_YOUR_GAS_WEBAPP_URL_HERE')){
      throw new Error('API URL belum diisi. Buka config.js lalu isi AppConfig.api.url dengan URL Web App GAS Anda.');
    }
    return u;
  }

  async function post(action, payload = {}, token = ''){
    const body = new URLSearchParams();
    body.set('action', action);
    body.set('payload', JSON.stringify(payload || {}));
    if(token) body.set('token', token);

    const res = await fetch(url(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body.toString()
    });

    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();

    if(!res.ok){
      const msg = (data && data.error) ? data.error : (typeof data === 'string' ? data : 'Request failed');
      throw new Error(msg);
    }
    if(data && data.ok === false) throw new Error(data.error || 'Request failed');
    return data;
  }

  const publicApi = {
    bootstrap: () => post('public.bootstrap', {}),
    getSchedule: () => post('public.getSchedule', {}),
    getCurrentEvent: () => post('public.getCurrentEvent', {})
  };

  const operatorApi = {
    eventsList: (token) => post('operator.eventsList', {}, token),
    setCurrentEvent: (token, eventId) => post('operator.setCurrentEvent', { eventId }, token),
    clearCurrentEvent: (token) => post('operator.clearCurrentEvent', {}, token)
  };

  return { post, public: publicApi, operator: operatorApi };
})();