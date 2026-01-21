// Authentication Module
class Auth {
    constructor() {
        this.currentUser = null;
        this.attended = false;
        this.utils = window.utils || new Utils();

        this.initializeElements();

        // ✅ Apply branding cepat dari config.js (local default)
        this.applyBranding();

        // ✅ Countdown & status awal pakai default dulu (cepat)
        this.initRegistrationCountdown();
        this.loadAttendanceStatus();

        // ✅ Dedupe remote config (tidak dobel dengan branding.js)
        this.ensureConfigAndRefresh();
        this.listenConfigReady();

        // ✅ Auto-login 24 jam untuk peserta yang SUDAH presensi sukses
        setTimeout(()=>{ try{ this.tryAutoLoginFromRemember(); }catch{} }, 50);
    }

    // ✅ Tidak fetch sendiri lagi (branding.js yang fetch, FGConfig yang dedupe)
    async ensureConfigAndRefresh(){
        try{
            if(window.FGConfig && typeof window.FGConfig.ensureLoaded === 'function'){
                const res = await window.FGConfig.ensureLoaded();
                // Kalau berubah, refresh UI
                if(res && res.changed){
                    this.applyBranding();
                    // countdown akan auto render tiap detik, tapi kita paksa render ulang agar segera mengikuti config baru
                    this.initRegistrationCountdown();
                    this.updateEventInfo();
                }
            }
        }catch(e){
            // diamkan: pakai default config.js
        }
    }

    // ✅ Jika branding.js broadcast 'fg:config-ready', auth ikut refresh juga
    listenConfigReady(){
        document.addEventListener('fg:config-ready', (ev)=>{
            try{
                const changed = !!(ev && ev.detail && ev.detail.changed);
                if(changed){
                    this.applyBranding();
                    this.initRegistrationCountdown();
                    this.updateEventInfo();
                }
            }catch(e){}
        });
    }

    initializeElements() {
        this.nikInput = document.getElementById('nik-input');
        this.checkNikBtn = document.getElementById('check-nik-btn');
        this.authError = document.getElementById('auth-error');
        this.authSuccess = document.getElementById('auth-success');
        this.alreadyAttended = document.getElementById('already-attended');
        this.familyList = document.getElementById('family-list');
        this.confirmAttendanceBtn = document.getElementById('confirm-attendance-btn');
        this.enterAppBtn = document.getElementById('enter-app-btn');
        this.authSection = document.getElementById('auth-section');
        this.appSection = document.getElementById('app-section');
        this.logoutBtn = document.getElementById('logout-btn');

        this.bindEvents();
    }

    // ===============================
    // ✅ Branding UI dari AppConfig (tanpa hardcode)
    // ===============================
    applyBranding(){
        try{
            const cfg = window.AppConfig || {};
            const brand = cfg.app?.brand || {};

            const appName = (brand.appName || cfg.event?.name || '').trim();
            if(appName) document.title = appName;

            const headerTitle = (brand.headerTitle || cfg.event?.name || '').trim();
            const headerSub = (brand.headerSubtitle || '').trim();

            const h1 = document.getElementById('main-event-title');
            const p  = document.getElementById('main-event-date');
            if(h1 && headerTitle) h1.textContent = headerTitle;
            if(p && headerSub) p.textContent = headerSub;
        }catch(e){
            // no-op
        }
    }

    bindEvents() {
        this.checkNikBtn.addEventListener('click', () => this.checkNIK());
        this.nikInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.checkNIK();
        });
        this.confirmAttendanceBtn.addEventListener('click', () => this.confirmAttendance());
        this.enterAppBtn.addEventListener('click', () => this.enterApp(true));
        this.logoutBtn.addEventListener('click', () => this.logout(true));
    }

    // ===============================
    // ✅ Button Spinner Helper (ringan)
    // ===============================
    _setBtnLoading(btn, on, label){
        try{
            if(!btn) return;

            if(on){
                // backup html terakhir (kalau countdown sudah ubah, tetap aman)
                if(!btn.dataset._origHtml){
                    btn.dataset._origHtml = btn.innerHTML;
                }
                if(btn.dataset._origDisabled == null){
                    btn.dataset._origDisabled = btn.disabled ? '1' : '0';
                }

                const text = label || btn.dataset.loadingText || 'Memproses...';
                btn.disabled = true;
                btn.classList.add('is-loading');

                btn.innerHTML = `
                    <span class="btn-spinner mr-2" aria-hidden="true"></span>
                    <span>${text}</span>
                `;
            }else{
                const orig = btn.dataset._origHtml;
                if(orig != null) btn.innerHTML = orig;

                // balikin disabled seperti semula
                const wasDisabled = btn.dataset._origDisabled === '1';
                btn.disabled = wasDisabled;

                btn.classList.remove('is-loading');
                delete btn.dataset._origHtml;
                delete btn.dataset._origDisabled;
            }
        }catch(e){}
    }

    async _withBtnSpinner(btn, fn, label){
        this._setBtnLoading(btn, true, label);
        try{
            return await fn();
        }finally{
            this._setBtnLoading(btn, false);
        }
    }

    // ===============================
    // ✅ Countdown Registrasi/Absensi + timezone warning
    // ===============================
    initRegistrationCountdown(){
        const box = document.getElementById('reg-countdown');
        if(!box) return;

        const btn = document.getElementById('check-nik-btn');
        const nikInput = document.getElementById('nik-input');

        // simpan label tombol asli (agar icon tetap)
        if(btn && !btn.dataset.baseHtml){
            btn.dataset.baseHtml = btn.innerHTML;
        }

        const setBtn = (enabled, suffix='')=>{
            if(!btn) return;
            btn.disabled = !enabled;

            // shimmer hanya saat dibuka
            btn.classList.toggle('fg-shimmer', !!enabled);

            // tampilkan suffix kecil (contoh: "Dibuka 00:12:10")
            if(suffix){
            btn.innerHTML = `
                <div class="leading-tight text-center">
                <div>${btn.dataset.baseHtml || 'Verifikasi'}</div>
                <div class="text-[11px] opacity-90 mt-1">${suffix}</div>
                </div>
            `;
            }else{
            btn.innerHTML = btn.dataset.baseHtml || btn.innerHTML;
            }
        };

        const setInput = (enabled)=>{
            if(nikInput) nikInput.disabled = !enabled;
        };

        const fmtCD = (msLeft)=>{
            return this.utils?.formatCountdown
            ? this.utils.formatCountdown(msLeft)
            : `${Math.max(0, Math.ceil(msLeft/1000))}s`;
        };

        const render = ()=>{
            const cfg = window.AppConfig || {};
            const ev = cfg.event || {};

            const nowMs = (this.utils?.nowMs ? this.utils.nowMs() : Date.now());
            const startMs = (this.utils?.parseIsoMs ? this.utils.parseIsoMs(ev.galaDinnerDate) : Date.parse(ev.galaDinnerDate));
            const endMs   = (this.utils?.parseIsoMs ? this.utils.parseIsoMs(ev.galaDinnerEndTime) : Date.parse(ev.galaDinnerEndTime));

            const invalidIso = !Number.isFinite(startMs) || !Number.isFinite(endMs);

            const startWib = this.utils?.formatWibDateTime
            ? this.utils.formatWibDateTime(ev.galaDinnerDate)
            : (ev.galaDinnerDate || '');

            const endWib = this.utils?.formatWibDateTime
            ? this.utils.formatWibDateTime(ev.galaDinnerEndTime)
            : (ev.galaDinnerEndTime || '');

            const tzWarn = this.utils?.getTimezoneWarning ? this.utils.getTimezoneWarning() : '';
            const tzPill = tzWarn ? `
            <span class="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-600">
                <i class="fas fa-globe-asia"></i><span>Non-WIB</span>
            </span>
            ` : '';

            // helper UI builder
            const badge = (state, text)=>{
            // warna halus via fg-badge + tailwind classes (transition dibantu CSS)
            let cls = 'fg-badge inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold';
            if(state === 'BEFORE') cls += ' bg-blue-50 text-blue-700 border-blue-100';
            if(state === 'OPEN')   cls += ' bg-green-50 text-green-700 border-green-100';
            if(state === 'AFTER')  cls += ' bg-red-50 text-red-700 border-red-100';
            if(state === 'WARN')   cls += ' bg-yellow-50 text-yellow-800 border-yellow-200';

            const dot = (state === 'OPEN')
                ? `<span class="w-2 h-2 rounded-full bg-green-600 animate-pulse"></span>`
                : `<span class="w-2 h-2 rounded-full bg-current opacity-50"></span>`;

            return `<span class="${cls}">${dot}<span>${text}</span></span>${tzPill}`;
            };

            const progress = (mode, percent)=>{
            // mode: "indeterminate" atau "determinate"
            const ind = (mode === 'indeterminate') ? 'is-indeterminate' : '';
            const w = Math.max(0, Math.min(100, Number(percent)||0));
            return `
                <div class="fg-progress ${ind}">
                <div class="fg-bar" style="${mode==='determinate' ? `width:${w}%;` : ''}"></div>
                </div>
            `;
            };

            // ============ INVALID ISO ============
            if(invalidIso){
            setBtn(true, '');
            setInput(true);

            box.innerHTML = `
                <div class="flex items-center justify-center">
                ${badge('WARN','Waktu absensi belum valid')}
                </div>
                <div class="mt-3">${progress('indeterminate')}</div>
            `;
            return;
            }

            // ============ BEFORE ============
            if(nowMs < startMs){
            const left = startMs - nowMs;
            const cd = fmtCD(left);

            setBtn(false, `Dibuka ${cd}`);
            setInput(false);

            box.innerHTML = `
                <div class="flex items-center justify-center">
                ${badge('BEFORE','Belum dibuka')}
                </div>

                <div class="mt-3">${progress('indeterminate')}</div>

                <div class="mt-2 text-center">
                <div class="text-[11px] text-gray-500">Dibuka dalam</div>
                <div class="text-2xl font-extrabold tracking-wide text-gray-900">${cd}</div>
                <div class="mt-1 text-[11px] text-gray-500">Buka <b>${startWib}</b> • Tutup <b>${endWib}</b></div>
                </div>
            `;
            return;
            }

            // ============ AFTER ============
            if(nowMs > endMs){
            setBtn(false, 'Ditutup');
            setInput(false);

            box.innerHTML = `
                <div class="flex items-center justify-center">
                ${badge('AFTER','Absensi ditutup')}
                </div>
                <div class="mt-3">${progress('determinate', 100)}</div>
                <div class="mt-2 text-center text-[11px] text-gray-500">Ditutup <b>${endWib}</b></div>
            `;
            return;
            }

            // ============ OPEN ============
            const total = Math.max(1, endMs - startMs);
            const elapsed = Math.max(0, nowMs - startMs);
            const pct = (elapsed / total) * 100;

            const left = endMs - nowMs;
            const cd = fmtCD(left);

            setBtn(true, '');
            setInput(true);

            box.innerHTML = `
            <div class="flex items-center justify-center">
                ${badge('OPEN','Dibuka')}
            </div>

            <div class="mt-3">${progress('determinate', pct)}</div>

            <div class="mt-2 text-center">
                <div class="text-[11px] text-gray-500">Tutup dalam</div>
                <div class="text-2xl font-extrabold tracking-wide text-gray-900">${cd}</div>
            </div>
            `;
        };

        render();
        clearInterval(this._regTimer);
        this._regTimer = setInterval(render, 1000);

        window.addEventListener('beforeunload', ()=> {
            try{ clearInterval(this._regTimer); }catch{}
        }, { once:true });
    }


    async checkNIK() {
        const btn = this.checkNikBtn;

        // Pastikan countdown punya baseHtml agar icon tetap
        try{
            if(btn && !btn.dataset.baseHtml){
                btn.dataset.baseHtml = btn.innerHTML;
            }
        }catch{}

        await this._withBtnSpinner(btn, async () => {
            const nik = this.nikInput.value.trim();

            // Validasi NIK menggunakan utils
            const validation = this.utils.validateNIK(nik);
            if (!validation.valid) {
                this.showError('NIK tidak valid', validation.message);
                return;
            }

            // Cek apakah sudah absen (server)
            try {
                const st = await window.FGAPI.public.getAttendanceStatus(nik);
                if (st && st.already === true) {
                    if (st.participant) this.currentUser = st.participant;
                    this.rememberUser24h(nik);
                    this.showAlreadyAttended();
                    return;
                }
            } catch (e) {
                this.showError('Gagal memeriksa status absensi', String(e.message || e));
                return;
            }

            // Cek apakah dalam radius lokasi
            const inLocation = await this.utils.checkLocation();
            if (!inLocation) {
                const locationName = window.AppConfig?.getEventLocation ?
                    window.AppConfig.getEventLocation().name : 'lokasi acara';
                this.showError('Tidak dapat melakukan absensi', `Anda berada di luar radius ${locationName}`);
                return;
            }

            // Cek apakah tanggal dan waktu acara
            if (!this.utils.isEventDate()) {
                this.showError('Tidak dapat melakukan absensi', 'Absensi hanya dapat dilakukan pada tanggal acara');
                return;
            }

            if (!this.utils.isGalaDinnerTime()) {
                const eventTime = window.AppConfig?.event?.galaDinnerDate ?
                    new Date(window.AppConfig.event.galaDinnerDate).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Asia/Jakarta'
                    }) : '16:00';
                this.showError('Tidak dapat melakukan absensi', `Absensi hanya dapat dilakukan mulai pukul ${eventTime} WIB`);
                return;
            }

            // Ambil data peserta dari server
            try {
                const participant = await window.FGAPI.public.getParticipantByNIK(nik);
                if (!participant) {
                    this.showError('NIK tidak ditemukan', 'Pastikan NIK yang dimasukkan sudah benar');
                    return;
                }
                this.currentUser = participant;
                this.showSuccess(participant);
            } catch (e) {
                this.showError('Gagal memuat data peserta', String(e.message || e));
            }
        }, (btn?.dataset?.loadingText || 'Memverifikasi...'));
    }

    showError(message, detail) {
        this.authError.classList.remove('hidden');
        document.getElementById('error-message').textContent = message;
        document.getElementById('error-detail').textContent = detail;
        this.authSuccess.classList.add('hidden');
        this.alreadyAttended.classList.add('hidden');
        
        // Auto hide error after configured time
        const timeout = window.AppConfig?.app?.notificationTimeout || 5000;
        setTimeout(() => {
            this.authError.classList.add('hidden');
        }, timeout);
    }

    showSuccess(participant) {
        this.authError.classList.add('hidden');
        this.authSuccess.classList.remove('hidden');
        this.alreadyAttended.classList.add('hidden');
        
        // Update UI dengan informasi acara dari konfigurasi
        const eventDate = window.AppConfig?.getEventDate ? 
            window.AppConfig.getEventDate() : new Date('2026-02-16T16:00:00+07:00');
        
        const dateString = eventDate.toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const locationName = window.AppConfig?.getEventLocation ? 
            window.AppConfig.getEventLocation().name : 'Novotel Pontianak';
        
        // Update teks informasi di form
        const eventInfoElements = document.querySelectorAll('.event-info');
        eventInfoElements.forEach(element => {
            if (element.id === 'event-date-info') {
                element.textContent = dateString;
            } else if (element.id === 'event-location-info') {
                element.textContent = locationName;
            }
        });
        
        // Tampilkan daftar keluarga
        this.renderFamilyList(this.ensureMainInFamily(participant));
    }

    showAlreadyAttended() {
        this.authError.classList.add('hidden');
        this.authSuccess.classList.add('hidden');
        this.alreadyAttended.classList.remove('hidden');
    }

    ensureMainInFamily(participant){
        const name = String(participant?.name || '').trim();
        const fam = Array.isArray(participant?.family) ? [...participant.family] : [];

        // format label peserta utama (konsisten)
        const mainLabel = name ? `${name} (Peserta Utama)` : '';

        // kalau nama kosong, ya biarkan apa adanya
        if(!mainLabel) return fam;

        // hapus duplikat jika sudah ada
        const lowerMain = mainLabel.toLowerCase();
        const cleaned = fam.filter(x => String(x||'').trim().toLowerCase() !== lowerMain);

        // ✅ peserta utama selalu index 0
        return [mainLabel, ...cleaned];
        }

    renderFamilyList(familyMembers) {
        this.familyList.innerHTML = '';
        
        familyMembers.forEach((member, index) => {
            const memberElement = document.createElement('div');
            memberElement.className = 'flex items-center p-4 bg-gray-50 rounded-xl';
            memberElement.innerHTML = `
                <input type="checkbox" id="member-${index}" class="checkbox-custom" checked>
                <label for="member-${index}" class="ml-3 flex-grow cursor-pointer">
                    <span class="font-medium text-gray-800">${member}</span>
                    ${index === 0 ? '<span class="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Peserta Utama</span>' : ''}
                </label>
            `;
            this.familyList.appendChild(memberElement);
        });
    }

    async confirmAttendance() {
        if (!this.currentUser) return;

        const btn = this.confirmAttendanceBtn;

        await this._withBtnSpinner(btn, async () => {
            // ✅ gunakan family list yang sudah dipastikan ada peserta utama
            const familyForUi = this.ensureMainInFamily(this.currentUser);

            const checkboxes = document.querySelectorAll('#family-list input[type="checkbox"]');
            const attendedMembers = [];

            checkboxes.forEach((checkbox, index) => {
                if (checkbox.checked) attendedMembers.push(familyForUi[index]);
            });

            if (attendedMembers.length === 0) {
                this.utils.showNotification('Pilih minimal 1 orang hadir', 'warning');
                return;
            }

            // Simpan ke server
            try {
                await window.FGAPI.public.submitAttendance(this.currentUser.nik, attendedMembers);
                this.attended = true;

                // ✅ Remember 24 jam setelah presensi sukses
                this.rememberUser24h(this.currentUser.nik);

                this.utils.showNotification('Kehadiran berhasil dikonfirmasi', 'success');
                this.showAlreadyAttended();
            } catch (e) {
                this.utils.showNotification(String(e.message || e), 'error');
            }
        }, (btn?.dataset?.loadingText || 'Menyimpan...'));
    }

    // Status absensi sekarang dicek via server (lihat checkNIK)
    checkIfAlreadyAttended(nik) { return false; }

    async enterApp(useSpinner=false) {
        if (!this.currentUser) return;

        const run = async () => {
            // ===== isi enterApp Anda YANG LAMA, tempel di sini tanpa diubah =====
            // (mulai dari sessionStorage.setItem... sampai showNotification)
            sessionStorage.setItem('currentUser', JSON.stringify(this.currentUser));

            window.FG_USER = {
                nik: this.currentUser.nik,
                name: this.currentUser.name
            };

            localStorage.setItem('fg_nik', this.currentUser.nik);

            this.authSection.classList.add('hidden');
            this.appSection.classList.remove('hidden');

            this.updateUserInfo();
            this.updateEventInfo();

            document.dispatchEvent(
                new CustomEvent('fg:user-ready', { detail: window.FG_USER })
            );

            try{
                const cfg = window.AppConfig || {};
                const ll = cfg.liveLocation || {};
                this.utils.startLiveLocationTracking(this.currentUser.nik, {
                    enable: ll.enable !== false,
                    hiAccuracy: ll.hiAccuracy !== false,
                    sendMinMs: ll.sendMinMs || 30000,
                    sampleEveryMs: ll.sampleEveryMs || (10*60*1000),
                    movedMinMs: ll.movedMinMs || 3000
                });
            }catch{}

            this.utils.showNotification(`Selamat datang, ${this.currentUser.name}`, 'success');
        };

        if(useSpinner && this.enterAppBtn){
            await this._withBtnSpinner(this.enterAppBtn, run, (this.enterAppBtn.dataset.loadingText || 'Membuka...'));
        }else{
            await run();
        }
    }

    updateUserInfo() {
        const userNameElement = document.getElementById('user-name');
        const displayUserName = document.getElementById('display-user-name');
        const displayUserNik = document.getElementById('display-user-nik');
        const displayFamilyCount = document.getElementById('display-family-count');
        const authInfo = document.getElementById('auth-info');
        
        if (this.currentUser) {
            userNameElement.textContent = this.currentUser.name;
            displayUserName.textContent = this.currentUser.name;
            displayUserNik.textContent = this.currentUser.nik;
            displayFamilyCount.textContent = `${this.currentUser.family.length} orang`;
            authInfo.classList.remove('hidden');
        }
    }
    
    updateEventInfo() {
        // Update informasi acara di halaman utama
        const eventTitle = document.getElementById('main-event-title');
        const eventDate = document.getElementById('main-event-date');
        const eventLocation = document.getElementById('main-event-location');
        
        if (eventTitle && window.AppConfig?.event?.name) {
            eventTitle.textContent = window.AppConfig.event.name;
        }
        
        if (eventDate && window.AppConfig?.getEventDate) {
            const date = window.AppConfig.getEventDate();
            const dateString = date.toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            eventDate.textContent = dateString;
        }
        
        if (eventLocation && window.AppConfig?.getEventLocation) {
            const location = window.AppConfig.getEventLocation();
            eventLocation.textContent = `${location.name}, ${location.address}`;
        }
    }

    

// ===============================
// ✅ Remember-me 24 jam (hanya jika sudah presensi sukses)
// ===============================
rememberUser24h(nik){
    try{
        if(!nik) return;
        const payload = { nik: String(nik), ts: Date.now(), ttlMs: 24*60*60*1000 };
        localStorage.setItem('fg_remember_v1', JSON.stringify(payload));
    }catch{}
}

clearRemember(){
    try{ localStorage.removeItem('fg_remember_v1'); }catch{}
}

async tryAutoLoginFromRemember(){
    try{
        const raw = localStorage.getItem('fg_remember_v1');
        if(!raw) return;
        const obj = JSON.parse(raw);
        if(!obj || !obj.nik || !obj.ts) return;

        const ttl = Number(obj.ttlMs || (24*60*60*1000));
        if(Date.now() - Number(obj.ts) > ttl){
            this.clearRemember();
            return;
        }

        const nik = String(obj.nik).trim();
        if(!nik) return;

        // Pastikan status di server memang sudah presensi
        const st = await window.FGAPI.public.getAttendanceStatus(nik);
        if(!(st && st.already === true && st.participant)){
            // belum presensi / tidak valid => jangan auto login
            this.clearRemember();
            return;
        }

        this.currentUser = st.participant;
        this.attended = true;

        // langsung masuk aplikasi tanpa input ulang NIK
        this.enterApp();

        this.utils.showNotification('Login otomatis aktif (24 jam)', 'info');
    }catch(e){
        // no-op
    }
}

    async logout(useSpinner=false) {
        const run = async () => {
            this.currentUser = null;
            this.attended = false;

            sessionStorage.removeItem('currentUser');
            try{ localStorage.removeItem('fg_nik'); }catch{}
            this.clearRemember();

            this.nikInput.value = '';
            this.authError.classList.add('hidden');
            this.authSuccess.classList.add('hidden');
            this.alreadyAttended.classList.add('hidden');

            this.appSection.classList.add('hidden');
            this.authSection.classList.remove('hidden');

            try { this.utils.stopLiveLocationTracking(); } catch {}

            this.utils.showNotification('Anda telah keluar dari aplikasi', 'info');
        };

        if(useSpinner && this.logoutBtn){
            await this._withBtnSpinner(this.logoutBtn, run, (this.logoutBtn.dataset.loadingText || 'Keluar...'));
        }else{
            await run();
        }
    }

    loadAttendanceStatus() {
        const savedUser = sessionStorage.getItem('currentUser');
        if (savedUser) {
            try {
                this.currentUser = JSON.parse(savedUser);

                // ✅ PENTING
                window.FG_USER = {
                    nik: this.currentUser.nik,
                    name: this.currentUser.name
                };
                localStorage.setItem('fg_nik', this.currentUser.nik);

                this.authSection.classList.add('hidden');
                this.appSection.classList.remove('hidden');

                this.updateUserInfo();
                this.updateEventInfo();

                document.dispatchEvent(
                    new CustomEvent('fg:user-ready', { detail: window.FG_USER })
                );
            } catch (e) {
                sessionStorage.removeItem('currentUser');
            }
        }
    }

}

// Inisialisasi auth module
const auth = new Auth();