// Utility Functions
class Utils {
  constructor() {
    // Jangan simpan snapshot config yang bisa ketinggalan.
    // Selalu baca window.AppConfig saat dibutuhkan.
    const cfg = this.getConfig();
    if (cfg?.security?.debugMode) {
      console.log('Utils initialized with AppConfig:', cfg);
    }

    this._liveLoc = null;

    // Flush antrian lokasi saat jaringan kembali online
    try {
      window.addEventListener('online', () => this.flushLiveLocationQueue());
    } catch {}
  }

  // helper agar ringkas
  getConfig() {
    return window.AppConfig || {};
  }

  // Escape HTML untuk mencegah XSS saat render string ke innerHTML
  htmlEsc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  // ===============================
  // Live Location Queue (offline-first)
  // ===============================
  _liveLocQueueKey(){ return 'fg_live_loc_queue_v1'; }

  _readLiveLocQueue(){
    try{
      const raw = localStorage.getItem(this._liveLocQueueKey());
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    }catch{ return []; }
  }

  _writeLiveLocQueue(arr){
    try{
      // batasi agar localStorage tidak bengkak
      const max = 2000;
      const safe = Array.isArray(arr) ? arr.slice(-max) : [];
      localStorage.setItem(this._liveLocQueueKey(), JSON.stringify(safe));
    }catch{}
  }

  queueLiveLocation(nik, loc){
    try{
      if(!nik || !loc) return;
      const q = this._readLiveLocQueue();
      q.push({ nik, loc });
      this._writeLiveLocQueue(q);
    }catch{}
  }

  async flushLiveLocationQueue(limit=100){
    try{
      if(!navigator.onLine) return;
      if(!window.FGAPI?.public?.pushLiveLocation) return;

      const q = this._readLiveLocQueue();
      if(!q.length) return;

      const remaining = [];
      let sent = 0;

      for (let i=0; i<q.length; i++){
        const item = q[i];
        try{
          await window.FGAPI.public.pushLiveLocation(item.nik, item.loc);
          sent++;
          if(sent >= limit){
            remaining.push(...q.slice(i+1));
            break;
          }
        }catch(e){
          remaining.push(...q.slice(i));
          break;
        }
      }
      this._writeLiveLocQueue(remaining);
    }catch{}
  }

  // ===============================
  // Date / Time helpers
  // ===============================
  formatDateTime(date) {
    const options = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta'
    };
    return date.toLocaleDateString('id-ID', options);
  }

  // ===============================
  // Geofence helpers
  // ===============================
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // meter
    const φ1 = (Number(lat1) || 0) * Math.PI / 180;
    const φ2 = (Number(lat2) || 0) * Math.PI / 180;
    const Δφ = ((Number(lat2) || 0) - (Number(lat1) || 0)) * Math.PI / 180;
    const Δλ = ((Number(lon2) || 0) - (Number(lon1) || 0)) * Math.PI / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async getCurrentLocation() {
    const getPos = (opts) => new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation tidak didukung oleh browser'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        }),
        (error) => reject(error),
        opts
      );
    });

    try {
      return await getPos({
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 60000
      });
    } catch (_) {
      return await getPos({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      });
    }
  }

  async checkLocation() {
    const cfg = this.getConfig();

    if (!cfg?.security?.enableGeofencing) return true;

    if (cfg?.security?.debugMode) {
      console.log('[DEBUG] Geofencing check: simulated TRUE');
      return true;
    }

    try {
      const location = (typeof cfg.getEventLocation === 'function')
        ? cfg.getEventLocation()
        : { lat: NaN, lng: NaN, radius: 0, name: '', address: '' };

      if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng) || !Number.isFinite(location.radius)) {
        console.warn('Geofence config invalid:', location);
        return true;
      }

      const userLocation = await this.getCurrentLocation();
      const distance = this.calculateDistance(
        userLocation.lat, userLocation.lng,
        location.lat, location.lng
      );

      const inRadius = distance <= Number(location.radius || 0);

      if (cfg?.security?.debugMode) {
        console.log(`[DEBUG] Distance: ${distance.toFixed(2)}m, In radius: ${inRadius}`);
      }

      return inRadius;
    } catch (error) {
      console.error('Error in checkLocation:', error);
      this.showNotification('Lokasi gagal dideteksi. Aktifkan GPS & izin lokasi, lalu refresh.', 'warning');
      return false;
    }
  }

  // ===============================
  // LIVE LOCATION TRACKING (Peserta -> Server)
  // ===============================
  startLiveLocationTracking(nik, opts = {}) {
    if (!nik) return;

    const enable = (opts.enable !== undefined) ? !!opts.enable : true;
    if (!enable) return;

    if (!navigator.geolocation) {
      console.warn('Geolocation tidak didukung');
      return;
    }

    this.stopLiveLocationTracking();

    const sendMinMs = Number(opts.sendMinMs || 30000);
    const hiAcc = (opts.highAccuracy !== undefined) ? !!opts.highAccuracy : true;
    const movedMinMs = Number(opts.movedMinMs || 3000);

    this._liveLoc = {
      nik: String(nik),
      watchId: null,
      lastSentAt: 0,
      lastPayloadKey: '',
      sampleTimer: null,
      onVis: null
    };

    const shouldSend = (pos) => {
      const now = Date.now();

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy || 0;

      const key = `${lat.toFixed(6)}|${lng.toFixed(6)}|${Math.round(acc)}`;

      if (key !== this._liveLoc.lastPayloadKey) {
        if (now - this._liveLoc.lastSentAt >= movedMinMs) {
          this._liveLoc.lastPayloadKey = key;
          return true;
        }
      }

      if (now - this._liveLoc.lastSentAt >= sendMinMs) {
        this._liveLoc.lastPayloadKey = key;
        return true;
      }

      return false;
    };

    const send = async (pos, reason='') => {
      if (!window.FGAPI?.public?.pushLiveLocation) return;

      const loc = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy || null,
        speed: pos.coords.speed || null,
        heading: pos.coords.heading || null,
        ts: new Date(pos.timestamp || Date.now()).toISOString(),
        reason: reason || null
      };

      if (navigator.onLine === false) {
        this.queueLiveLocation(this._liveLoc.nik, loc);
        return;
      }

      try { await this.flushLiveLocationQueue(50); } catch {}

      try {
        await window.FGAPI.public.pushLiveLocation(this._liveLoc.nik, loc);
        this._liveLoc.lastSentAt = Date.now();
      } catch (e) {
        this.queueLiveLocation(this._liveLoc.nik, loc);
        console.warn('pushLiveLocation error:', e?.message || e);
      }
    };

    const onPos = (pos) => {
      if (!this._liveLoc) return;
      if (shouldSend(pos)) send(pos);
    };

    const onErr = (err) => {
      console.warn('watchPosition error:', err);
    };

    this._liveLoc.watchId = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: hiAcc,
      maximumAge: 10000,
      timeout: 20000
    });

    // Periodic sampling (lebih stabil di mobile saat watchPosition ditunda OS)
    const sampleEveryMs = Number(opts.sampleEveryMs || (10*60*1000)); // default 10 menit
    const sampleOnce = () => {
      try{
        navigator.geolocation.getCurrentPosition(
          (p)=>{ if(this._liveLoc && shouldSend(p)) send(p,'sample'); },
          (_e)=>{},
          { enableHighAccuracy: hiAcc, maximumAge: 0, timeout: 20000 }
        );
      }catch{}
    };

    try{ sampleOnce(); }catch{}
    this._liveLoc.sampleTimer = setInterval(sampleOnce, sampleEveryMs);

    const onVis = () => {
      if (document.visibilityState === 'visible') sampleOnce();
    };
    document.addEventListener('visibilitychange', onVis);
    this._liveLoc.onVis = onVis;

    window.addEventListener('beforeunload', () => this.stopLiveLocationTracking(), { once: true });
  }

  stopLiveLocationTracking() {
    try {
      if (this._liveLoc?.watchId != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(this._liveLoc.watchId);
      }
    } catch {}

    try{
      if (this._liveLoc?.sampleTimer) clearInterval(this._liveLoc.sampleTimer);
    }catch{}

    try{
      if (this._liveLoc?.onVis) document.removeEventListener('visibilitychange', this._liveLoc.onVis);
    }catch{}

    this._liveLoc = null;
  }

  // ===============================
  // Validation
  // ===============================
  validateNIK(nik) {
    if (!nik || typeof nik !== 'string') {
      return { valid: false, message: 'NIK tidak valid' };
    }

    const cfg = this.getConfig();
    const minLength = cfg?.security?.nikMinLength || 8;

    if (nik.length < minLength) {
      return { valid: false, message: `NIK minimal ${minLength} karakter` };
    }

    if (!/^\d+$/.test(nik)) {
      return { valid: false, message: 'NIK harus berupa angka' };
    }

    return { valid: true, message: 'NIK valid' };
  }

  // ===============================
  // Notifications
  // ===============================
  showNotification(message, type = 'info') {
    // Modern toast notification (Tailwind-friendly)
    const msg = String(message ?? '').trim();
    if (!msg) return;

    // Create (or reuse) stack container
    let stack = document.getElementById('fg-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'fg-toast-stack';
      stack.className = 'fixed top-4 right-4 z-[99999] flex flex-col gap-3 max-w-[92vw] sm:max-w-sm';
      document.body.appendChild(stack);
    }

    // Theme
    const theme = {
      success: { ring: 'ring-1 ring-emerald-200', bg: 'bg-white/90', bar: 'bg-emerald-500', icon: 'fa-circle-check', ic: 'text-emerald-600' },
      warning: { ring: 'ring-1 ring-amber-200', bg: 'bg-white/90', bar: 'bg-amber-500', icon: 'fa-triangle-exclamation', ic: 'text-amber-600' },
      error:   { ring: 'ring-1 ring-rose-200', bg: 'bg-white/90', bar: 'bg-rose-500', icon: 'fa-circle-xmark', ic: 'text-rose-600' },
      info:    { ring: 'ring-1 ring-sky-200', bg: 'bg-white/90', bar: 'bg-sky-500', icon: 'fa-circle-info', ic: 'text-sky-600' },
    }[type] || { ring: 'ring-1 ring-gray-200', bg: 'bg-white/90', bar: 'bg-gray-500', icon: 'fa-circle-info', ic: 'text-gray-600' };

    const toast = document.createElement('div');
    toast.className = [
      'relative overflow-hidden rounded-2xl shadow-xl backdrop-blur',
      theme.bg, theme.ring,
      'translate-y-2 opacity-0 transition-all duration-200 ease-out'
    ].join(' ');

    toast.innerHTML = `
      <div class="flex items-start gap-3 p-4">
        <div class="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50">
          <i class="fas ${theme.icon} ${theme.ic}"></i>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-gray-900">${this.htmlEsc(msg)}</p>
        </div>
        <button type="button" class="ml-2 text-gray-400 hover:text-gray-700 transition" aria-label="Tutup">
          <i class="fas fa-xmark"></i>
        </button>
      </div>
      <div class="h-1 w-full bg-gray-100">
        <div class="fg-toast-bar h-1 ${theme.bar} w-full origin-left scale-x-100"></div>
      </div>
    `;

    const btn = toast.querySelector('button');
    const remove = () => {
      toast.classList.remove('translate-y-0', 'opacity-100');
      toast.classList.add('translate-y-2', 'opacity-0');
      setTimeout(() => { try { toast.remove(); } catch {} }, 220);
    };
    btn.addEventListener('click', remove);

    // Add to top
    stack.prepend(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    });

    // Auto-dismiss with progress bar
    const ttl = (type === 'error') ? 6000 : (type === 'warning') ? 5000 : 3800;
    const bar = toast.querySelector('.fg-toast-bar');
    if (bar) {
      bar.style.transition = `transform ${ttl}ms linear`;
      requestAnimationFrame(() => { bar.style.transform = 'scaleX(0)'; });
    }
    setTimeout(remove, ttl);

    // Cap stack size
    const MAX = 4;
    const items = Array.from(stack.children);
    if (items.length > MAX) {
      for (let i = MAX; i < items.length; i++) {
        try { items[i].remove(); } catch {}
      }
    }
  }

  getNotificationColor(type) {
    const colors = {
      success: `bg-green-100 text-green-800 border border-green-200`,
      error: `bg-red-100 text-red-800 border border-red-200`,
      warning: `bg-yellow-100 text-yellow-800 border border-yellow-200`,
      info: `bg-blue-100 text-blue-800 border border-blue-200`
    };
    return colors[type] || colors.info;
  }

  getNotificationIcon(type) {
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };
    return icons[type] || icons.info;
  }

  // ===============================
  // WIB-SAFE TIME HELPERS
  // ===============================
  parseIsoMs(iso) {
    const s = String(iso || '').trim();
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : NaN;
  }

  nowMs() {
    return Date.now();
  }

  getEventWindowMs() {
    const cfg = this.getConfig();
    const ev = cfg?.event || {};
    const startMs = this.parseIsoMs(ev.eventStartDate);
    const endMs = this.parseIsoMs(ev.eventEndDate);
    const galaStartMs = this.parseIsoMs(ev.galaDinnerDate);
    const galaEndMs = this.parseIsoMs(ev.galaDinnerEndTime);
    return { startMs, endMs, galaStartMs, galaEndMs };
  }

  isWithin(ms, startMs, endMs) {
    if (!Number.isFinite(ms) || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return true;
    return ms >= startMs && ms <= endMs;
  }

  isEventDate() {
    const cfg = this.getConfig();
    if (!cfg?.security?.enableDateValidation) return true;
    const { startMs, endMs } = this.getEventWindowMs();
    return this.isWithin(this.nowMs(), startMs, endMs);
  }

  isGalaDinnerTime() {
    const cfg = this.getConfig();
    if (!cfg?.security?.enableDateValidation) return true;
    const { galaStartMs, galaEndMs } = this.getEventWindowMs();
    return this.isWithin(this.nowMs(), galaStartMs, galaEndMs);
  }

  formatCountdown(msLeft) {
    let s = Math.max(0, Math.floor(msLeft / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;

    const pad2 = (n) => String(n).padStart(2, '0');
    if (d > 0) return `${d} hari ${pad2(h)}:${pad2(m)}:${pad2(s)}`;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  formatWibDateTime(iso) {
    try {
      const d = new Date(String(iso || ''));
      return d.toLocaleString('id-ID', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'Asia/Jakarta'
      }) + ' WIB';
    } catch {
      return String(iso || '');
    }
  }

  getTimezoneWarning() {
    const off = new Date().getTimezoneOffset(); // WIB => -420
    if (off !== -420) {
      return `Zona waktu perangkat Anda bukan WIB (UTC+7). Aplikasi tetap aman karena memakai waktu server/ISO.`;
    }
    return '';
  }
}
