(function(){
  // Ensure global utils instance exists (utils.js only defines class Utils)
   (function(){
    // 1) Pastikan window.utils ada
    if (!window.utils) {
      if (typeof window.Utils === 'function') window.utils = new window.Utils();
      else window.utils = {};
    }

    // 2) Pastikan htmlEsc ada (dipakai aman di UI)
    if (typeof window.utils.htmlEsc !== 'function') {
      window.utils.htmlEsc = function(str){
        return String(str ?? '').replace(/[&<>"']/g, m => ({
          '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
        }[m]));
      };
    }

    // 3) Inject Toast Container (sekali saja)
    function ensureToastHost(){
      let host = document.getElementById('fg-toast-host');
      if (host) return host;

      host = document.createElement('div');
      host.id = 'fg-toast-host';
      host.className = [
        'fixed z-[9999] pointer-events-none',
        'top-3 right-3',
        'w-[calc(100%-1.5rem)] sm:w-[420px]',
        'flex flex-col gap-2'
      ].join(' ');
      document.body.appendChild(host);
      return host;
    }

    // 4) Toast Tailwind
    function showToast(message, type='info', opts={}){
      const host = ensureToastHost();

      const duration = Number(opts.duration ?? (
        type === 'error' ? 7000 :
        type === 'warning' ? 5500 :
        3500
      ));
      const title = String(opts.title ?? (
        type === 'success' ? 'Berhasil' :
        type === 'error' ? 'Gagal' :
        type === 'warning' ? 'Peringatan' :
        'Info'
      ));

      const styles = {
        success: { ring:'ring-emerald-200', bg:'bg-white', bar:'bg-emerald-500', dot:'bg-emerald-500', text:'text-emerald-700', icon:'fa-check' },
        error:   { ring:'ring-red-200',     bg:'bg-white', bar:'bg-red-500',     dot:'bg-red-500',     text:'text-red-700',     icon:'fa-xmark' },
        warning: { ring:'ring-amber-200',   bg:'bg-white', bar:'bg-amber-500',   dot:'bg-amber-500',   text:'text-amber-700',   icon:'fa-triangle-exclamation' },
        info:    { ring:'ring-sky-200',     bg:'bg-white', bar:'bg-sky-500',     dot:'bg-sky-500',     text:'text-sky-700',     icon:'fa-circle-info' }
      };
      const s = styles[type] || styles.info;

      const card = document.createElement('div');
      card.className = [
        'pointer-events-auto',
        'rounded-2xl shadow-lg',
        'ring-1', s.ring,
        s.bg,
        'overflow-hidden',
        'translate-y-2 opacity-0',
        'transition duration-200 ease-out'
      ].join(' ');

      const safeTitle = window.utils.htmlEsc(title);
      const safeMsg = window.utils.htmlEsc(String(message ?? ''));

      card.innerHTML = `
        <div class="p-4">
          <div class="flex items-start gap-3">
            <div class="mt-1 w-9 h-9 rounded-xl ${s.dot} bg-opacity-10 flex items-center justify-center">
              <i class="fa-solid ${s.icon} ${s.text}"></i>
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="font-semibold ${s.text} leading-5">${safeTitle}</div>
                  <div class="text-sm text-slate-700 mt-0.5 break-words">${safeMsg}</div>
                </div>

                <button type="button"
                  class="shrink-0 w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-500 flex items-center justify-center"
                  aria-label="Tutup notifikasi">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="h-1 bg-slate-100">
          <div class="h-1 ${s.bar} w-full" data-bar></div>
        </div>
      `;

      host.appendChild(card);

      // animate in
      requestAnimationFrame(()=>{
        card.classList.remove('translate-y-2','opacity-0');
        card.classList.add('translate-y-0','opacity-100');
      });

      const btnClose = card.querySelector('button');
      const bar = card.querySelector('[data-bar]');

      let closed = false;
      let start = performance.now();
      let raf = 0;

      function close(){
        if (closed) return;
        closed = true;
        cancelAnimationFrame(raf);

        card.classList.add('opacity-0','translate-y-2');
        setTimeout(()=>{ try{ card.remove(); }catch{} }, 220);
      }

      btnClose?.addEventListener('click', close);

      // progress animation
      function tick(now){
        const t = now - start;
        const p = Math.max(0, 1 - (t / duration));
        if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
        if (t >= duration) close();
        else raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);

      // allow click to close (optional)
      if (opts.closeOnClick) card.addEventListener('click', close);

      return { close };
    }

    // 5) Override showNotification agar selalu pakai toast (lebih bagus)
    //    (Kalau Anda ingin menjaga showNotification versi lama, hapus blok override ini.)
    window.utils.showNotification = function(msg, type='info', opts){
      try { return showToast(msg, type, opts); }
      catch { alert(String(msg ?? '')); }
    };

    // Opsional: helper shortcut
    window.utils.toast = window.utils.showNotification;

  })();


  const $ = (s, r=document)=> r.querySelector(s);
  const wrap = $('#fam-wrap');
  if (wrap) wrap.classList.add('space-y-2');
  const status = $('#status');

  // Hubungan keluarga (dipaksa seragam via dropdown)
  const RELATIONS = ['Istri','Suami','Anak','Orang Tua','Saudara','Lainnya'];

  function setStatus(msg, type){
    status.textContent = msg || '';
    status.className = 'text-sm ' + (type==='error' ? 'text-red-600' : type==='success' ? 'text-emerald-700' : 'text-slate-600');
  }

  function parseLegacyFamilyValue(value){
    // Support format lama: "Nama (Hubungan)" atau "Nama - Hubungan"
    const raw = String(value||'').trim();
    if(!raw) return { fam_name:'', relation:'', relation_other:'' };

    // 1) (Hubungan) di belakang
    const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if(m){
      const fam_name = (m[1]||'').trim();
      const rel = (m[2]||'').trim();
      if(RELATIONS.includes(rel)) return { fam_name, relation: rel, relation_other: '' };
      return { fam_name, relation: 'Lainnya', relation_other: rel };
    }

    // 2) "Nama - Hubungan"
    const m2 = raw.match(/^(.*?)\s*[-–—]\s*(.+)$/);
    if(m2){
      const fam_name = (m2[1]||'').trim();
      const rel = (m2[2]||'').trim();
      if(RELATIONS.includes(rel)) return { fam_name, relation: rel, relation_other: '' };
      return { fam_name, relation: 'Lainnya', relation_other: rel };
    }

    // 3) hanya nama
    return { fam_name: raw, relation:'', relation_other:'' };
  }

  function relationOptionsHTML(selected){
    return RELATIONS.map(r=>`<option value="${r}" ${r===selected?'selected':''}>${r}</option>`).join('');
  }

  function famRow(value=''){
    const parsed = (typeof value === 'string') ? parseLegacyFamilyValue(value) : (value||{});
    const fam_name = String(parsed.fam_name||'');
    const relation = String(parsed.relation||'');
    const relation_other = String(parsed.relation_other||'');

    const div = document.createElement('div');

    // Card wrapper
    div.className = 'fam-item w-full rounded-2xl bg-white/70 border border-slate-200 p-3 md:p-4';

    div.innerHTML = `
      <!-- ROW: mobile tetap 1 garis, desktop dipaksa grid agar stabil -->
      <div class="fg-fam-row w-full flex items-center gap-2 sm:gap-3
                  md:grid md:items-stretch md:gap-3
                  md:grid-cols-[220px_minmax(0,1fr)_56px]">

        <!-- Hubungan -->
        <div class="shrink-0 w-[110px] sm:w-[140px] md:w-auto">
          <select class="fam-rel w-full px-3 py-3 border border-slate-200 rounded-xl bg-gray
                        focus:outline-none focus:ring-2 focus:ring-sky-200">
            <option value="" ${relation===''?'selected':''} disabled>-- Hub --</option>
            ${relationOptionsHTML(relation)}
          </select>
        </div>

        <!-- Nama -->
        <div class="flex-1 min-w-0 md:w-auto">
          <input class="fam-name w-full px-3 py-3 border border-slate-200 rounded-xl bg-white
                        focus:outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="Nama anggota keluarga"
            value="${fam_name.replace(/"/g,'&quot;')}"
          />
        </div>

        <!-- Hapus -->
        <div class="shrink-0 flex justify-end md:justify-center md:items-stretch">
          <button type="button"
            class="fam-del w-10 h-10 md:w-12 md:h-12 rounded-xl bg-red-50 text-red-600
                  hover:bg-red-100 active:scale-[0.98] flex items-center justify-center"
            title="Hapus">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      </div>

      <!-- Lainnya -->
      <div class="mt-2" style="display:${relation==='Lainnya'?'block':'none'}">
        <input
          class="fam-other w-full px-3 py-3 border border-slate-200 rounded-xl bg-white
                focus:outline-none focus:ring-2 focus:ring-sky-200"
          placeholder="Sebutkan hubungan (jika pilih Lainnya)"
          value="${relation_other.replace(/"/g,'&quot;')}"
        />
      </div>
    `;

    // toggle other
    const sel = div.querySelector('.fam-rel');
    const otherWrap = div.querySelector('.fam-other')?.parentElement;
    const other = div.querySelector('.fam-other');
    if(sel && otherWrap && other){
      sel.addEventListener('change', ()=>{
        const v = (sel.value||'').trim();
        otherWrap.style.display = (v==='Lainnya') ? 'block' : 'none';
        if(v!=='Lainnya') other.value = '';
      });
    }

    div.querySelector('.fam-del')?.addEventListener('click', ()=> div.remove());
    return div;
  }

  function collectFamily(){
  // ✅ hanya ambil row teratas yang kita buat (bukan semua div di dalamnya)
    const rows = Array.from(wrap.children).filter(el => el.classList.contains('fam-item'));
    const out = [];

    for(const row of rows){
      const nm = (row.querySelector('.fam-name')?.value || '').trim();
      const rel = (row.querySelector('.fam-rel')?.value || '').trim();
      const other = (row.querySelector('.fam-other')?.value || '').trim();
      if(!nm) continue;

      // relation boleh kosong (anggap belum diisi) -> skip agar tidak nyasar
      if(!rel) continue;

      if(rel === 'Lainnya'){
        out.push(other ? `${nm} (Lainnya: ${other})` : `${nm} (Lainnya)`);
      }else{
        out.push(`${nm} (${rel})`);
      }
    }

    // ✅ dedupe final (jaga-jaga)
    const seen = new Set();
    return out.filter(x=>{
      const key = String(x||'').trim().toLowerCase();
      if(!key) return false;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function resetForm(){
    $('#nik').value='';
    $('#name').value='';
    $('#region').value='';
    $('#unit').value='';
    $('#is_staff').checked=false;
    wrap.innerHTML='';
    wrap.appendChild(famRow(''));
    setStatus('', '');
  }

  async function applyBranding(){
    try{
      const cfg = await window.FGAPI.public.getConfig();
      const appName = cfg?.brand?.appName || cfg?.brand?.headerTitle || 'Tambah Peserta';
      const subtitle = cfg?.brand?.headerSubtitle || cfg?.event?.name || '';
      document.title = appName + ' - Form Peserta';
      const t = $('#brand-title');
      const s = $('#brand-sub');
      if(t) t.textContent = appName;
      if(s) s.textContent = subtitle;
    }catch{}
  }

  async function save(){
    const nik = ($('#nik').value||'').trim();
    const name = ($('#name').value||'').trim();
    const region = ($('#region').value||'').trim();
    const unit = ($('#unit').value||'').trim();
    const is_staff = !!$('#is_staff').checked;

    if(!nik){ utils.showNotification('NIK wajib diisi','warning'); setStatus('NIK wajib diisi','error'); return; }
    if(!name){ utils.showNotification('Nama wajib diisi','warning'); setStatus('Nama wajib diisi','error'); return; }

    // family: only anggota keluarga (bukan peserta utama)
    let family = collectFamily();
    const main = name.toLowerCase();
    family = family.filter(x=>{
      const v = String(x||'').trim();
      if(!v) return false;
      const lv = v.toLowerCase();
      if(lv===main) return false;
      if(lv===main + ' (peserta utama)') return false;
      return true;
    });

    const btn = $('#btn-save');
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>Menyimpan...';
    setStatus('Menyimpan...', '');

    try{
      await window.FGAPI.public.participantsUpsert({ nik, name, region, unit, is_staff, family });
      utils.showNotification('Peserta tersimpan','success');
      setStatus('Tersimpan: ' + nik + ' - ' + name, 'success');
    }catch(e){
      utils.showNotification('Gagal: ' + (e?.message||e), 'error');
      setStatus('Gagal menyimpan: ' + (e?.message||e), 'error');
    }finally{
      btn.disabled = false;
      btn.innerHTML = old;
    }
  }

  // bind
  $('#fam-add')?.addEventListener('click', ()=> wrap.appendChild(famRow('')));
  $('#btn-reset')?.addEventListener('click', resetForm);
  $('#btn-save')?.addEventListener('click', save);

  // init
  wrap.appendChild(famRow(''));
  applyBranding();
})();
