# FG Unit Draw (Trigger + Display + Setting)

## 1) Setup Backend (Google Apps Script)
1. Buat Google Spreadsheet baru (mis: FG_UnitDraw_DB).
2. Extensions → Apps Script → buat file `Code.gs` lalu paste isi dari `backend/Code.gs`.
3. Jalankan fungsi `setup()` sekali dari editor (akan membuat sheet: Settings, Participants, Draws, Sessions).
4. Deploy → New deployment → Web app:
   - Execute as: Me
   - Who has access: Anyone
5. Copy URL Web App `/exec` (contoh: https://script.google.com/macros/s/XXXX/exec)

## 2) Setup Frontend (GitHub Pages / hosting statis)
- Upload folder `frontend/` ke hosting.
- Buka `setting.html` → isi GAS URL → Simpan URL.
- Login admin:
  - username: admin
  - password: admin123
  - Setelah login, atur:
    - Allowed NIK Trigger
    - Master peserta/unit + kategori A/B/C

## 3) Operasional
- Trigger: buka `trigger.html` di HP → Simpan GAS URL → login NIK → tekan tombol ACAK.
- Display: buka `display.html` di layar besar (tanpa login).
- Export XLSX: dari Display klik "Export XLSX".

## Catatan aturan pengacakan
Backend akan berusaha menghindari A/C muncul berurutan (dua non-B tidak boleh berdampingan) dan memaksimalkan agar A/C diselipkan di antara B.
Jika jumlah B tidak cukup, sistem akan tetap best-effort.
