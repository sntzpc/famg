/* FG2026 - Admin Panel (Modular)
   js/admin/core_drive.js
*/
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};
  const drive = FGAdmin.drive = FGAdmin.drive || {};

function driveIdFromAny(s){
const str = String(s||'').trim();
if(!str) return '';
// kalau sudah id mentah
if(/^[a-zA-Z0-9_-]{20,}$/.test(str) && !str.includes('http')) return str;

// uc?export=view&id=ID
let m = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
if(m && m[1]) return m[1];

// /file/d/ID/
m = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
if(m && m[1]) return m[1];

// lh3 googleusercontent /d/ID
m = str.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
if(m && m[1]) return m[1];

return '';
}

// ✅ sumber <img> yang paling stabil untuk Drive image
function driveImgSrc(urlOrId, size=800){
const id = driveIdFromAny(urlOrId);
if(!id) return String(urlOrId||'').trim();

// thumbnail endpoint untuk gambar (paling stabil)
return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${Number(size)||800}`;
}

// ✅ fallback chain jika thumbnail gagal load
function bindImgFallback(imgEl, urlOrId){
const id = driveIdFromAny(urlOrId);
if(!imgEl || !id) return;

const fallbacks = [
  `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`,
  `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}`
];

let i = 0;
imgEl.addEventListener('error', ()=>{
  if(i >= fallbacks.length) return;
  imgEl.src = fallbacks[i++];
}, { once:false });
}

// ✅ cache dataUrl agar tidak request berulang
const prizeImgCache = new Map(); // key=fileId -> dataUrl

async function loadPrizeImgToEl(imgEl, fileIdOrUrl){
try{
  const id = driveIdFromAny(fileIdOrUrl);
  if(!id) return;

  if(prizeImgCache.has(id)){
    imgEl.src = prizeImgCache.get(id);
    return;
  }

  // ambil dari GAS (anti ORB)
  const res = await FGAPI.public.getPrizeImageDataUrl(id);
  const dataUrl = res?.data_url || '';
  if(dataUrl){
    prizeImgCache.set(id, dataUrl);
    imgEl.src = dataUrl;
  }
}catch(err){
  // kalau gagal, biarkan placeholder icon tetap tampil
  console.warn('loadPrizeImgToEl error:', err);
}
}



  drive.driveIdFromAny = driveIdFromAny;
  drive.driveImgSrc = driveImgSrc;
  drive.bindImgFallback = bindImgFallback;
  drive.loadPrizeImgToEl = loadPrizeImgToEl;
})();
