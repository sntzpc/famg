// FG Unit Draw - Frontend shared helpers (no build tools)
// NOTE: GAS_URL_EXEC & GAS_URL_REDIRECT are defined in js/config.js
const GAS_URL = (typeof GAS_URL_EXEC !== "undefined" ? GAS_URL_EXEC : "");

const LS = {
  triggerToken: "fg_ud_trigger_token",
  triggerExp: "fg_ud_trigger_exp",
  adminToken: "fg_ud_admin_token",
  adminExp: "fg_ud_admin_exp"
};

function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

function toast(msg, type="info"){
  const el = document.createElement("div");
  el.className = "pointer-events-auto w-full max-w-md rounded-2xl shadow-lg border px-4 py-3 flex gap-3 items-start bg-white/95";
  el.innerHTML = `
    <div class="mt-0.5 h-2.5 w-2.5 rounded-full ${type==="err"?"bg-red-500":type==="ok"?"bg-green-500":"bg-blue-500"}"></div>
    <div class="text-sm text-slate-800 leading-snug">${escapeHtml(msg)}</div>
    <button class="ml-auto text-slate-500 hover:text-slate-900">✕</button>
  `;
  const wrap = $("#toastWrap");
  wrap.appendChild(el);
  el.querySelector("button").onclick = ()=> el.remove();
  setTimeout(()=>{ try{ el.remove(); }catch(_){} }, 4500);
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

// JSONP helper (best for GAS + GitHub pages / local)
function api(action, params={}, method="GET", body=null){
  // if method is GET => JSONP
  if(method === "GET"){
    return apiJsonp(action, params);
  }
  return apiPost(action, params, body);
}

function apiJsonp(action, params={}){
  return new Promise((resolve, reject)=>{
        // IMPORTANT: JSONP must load JavaScript. Use the /exec WebApp URL only.
    const base = GAS_URL;
    if(!base) return reject(new Error("GAS_URL belum tersedia"));
    const cb = "FGUD_" + Math.random().toString(16).slice(2);
    const q = new URLSearchParams({action, ...params, callback: cb}).toString();
    const url = base + (base.includes("?") ? "&" : "?") + q;

    const s = document.createElement("script");
    s.src = url;
    s.async = true;

    const timer = setTimeout(()=>{
      cleanup();
      reject(new Error("Timeout JSONP"));
    }, 12000);

    function cleanup(){
      clearTimeout(timer);
      try{ delete window[cb]; }catch(_){}
      if(s && s.parentNode) s.parentNode.removeChild(s);
    }

    window[cb] = (data)=>{
      cleanup();
      resolve(data);
    };

    s.onerror = ()=>{
      cleanup();
      reject(new Error("Gagal load JSONP"));
    };

    document.body.appendChild(s);
  });
}

async function apiPost(action, params={}, bodyObj=null){
  if(!GAS_URL) throw new Error("GAS_URL belum tersedia");
  const url = GAS_URL + (GAS_URL.includes("?") ? "&" : "?") + new URLSearchParams({action, ...params}).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: {"content-type":"application/json"},
    body: bodyObj ? JSON.stringify(bodyObj) : "{}"
  });
  const txt = await res.text();
  try{ return JSON.parse(txt); }catch(e){ throw new Error("Respon bukan JSON: " + txt.slice(0,200)); }
}

async function sha256Hex(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b=>b.toString(16).padStart(2,"0")).join("");
}

function setBtnBusy(btn, busy=true, labelBusy="Memproses..."){
  if(!btn) return;
  btn.disabled = !!busy;
  btn.dataset._label = btn.dataset._label || btn.textContent;
  btn.textContent = busy ? labelBusy : btn.dataset._label;
  btn.classList.toggle("opacity-70", !!busy);
}

function ensureToastHost(){
  if($("#toastWrap")) return;
  const host = document.createElement("div");
  host.id = "toastWrap";
  host.className = "fixed z-50 top-4 right-4 flex flex-col gap-2 items-end pointer-events-none px-4";
  document.body.appendChild(host);
}

function formatCat(cat){
  return cat==="A" ? "A (Banyak)" : cat==="B" ? "B (Sedikit)" : "C (Support)";
}

function badgeCat(cat){
  const map = {A:"bg-orange-100 text-orange-800 border-orange-200", B:"bg-emerald-100 text-emerald-800 border-emerald-200", C:"bg-sky-100 text-sky-800 border-sky-200"};
  return map[cat] || "bg-slate-100 text-slate-700 border-slate-200";
}
