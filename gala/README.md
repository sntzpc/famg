# FG2026 - Gala Dinner Dashboard (Standalone)

Dashboard ini menampilkan:
- Hitung mundur menuju Gala Dinner (waktu fleksibel dari frontend)
- Ringkasan kehadiran realtime (dari Google Sheet `attendance`)
- Siklus kartu otomatis: **KMP1 Total → Region acak → Unit acak → ulang**

## 1) Deploy Backend (Google Apps Script)
1. Buka Google Apps Script (project baru).
2. Copy isi file `backend/Code.gs` dan `backend/appsscript.json`.
3. Deploy sebagai **Web App**:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Setelah deploy, ambil URL **script.googleusercontent.com** (biasanya ada di halaman deploy / test web app).
   - Jika yang Anda dapat `script.google.com/macros/.../exec`, biasanya tetap bisa, tapi kadang kena CORS bila di-host di domain lain.

## 2) Setup Frontend
1. Buka `frontend/index.html` (bisa langsung double click / serve via hosting).
2. Klik **Pengaturan** (ikon gear)
3. Isi:
   - Backend URL: URL Web App GAS
   - Event ID: contoh `GALA_2026`
   - Waktu Gala Dinner: pilih tanggal & jam
   - Interval refresh: 5 detik (disarankan)
   - Interval ganti kartu: 8 detik (disarankan)

## 3) Struktur Data (Sheet `attendance`)
Header wajib:
`id, event_id, nik, name, region, unit, family_json, timestamp`

Kategori dihitung dari `family_json` (array string), contoh:
`"Risma (Istri)"` → Pasangan
`"Labib (Anak)"` → Anak
`"Suparlan (Orang Tua)"` → Keluarga
`"(Peserta Utama)"` → Staff

## Catatan
- Dashboard ini **tanpa login**.
- Update realtime dilakukan dengan polling (interval refresh).
