FG2026 - Doorprize Standalone

1) Backend (Google Apps Script)
- Buka folder backend/Code.gs (copy-paste ke project GAS baru)
- Jalankan fungsi setup() sekali dari Script Editor
- Deploy sebagai Web App:
  - Execute as: Me
  - Who has access: Anyone
- Salin URL Deploy (yang /exec) lalu tempel ke config.js -> window.AppConfig.api.url

Default akun:
- admin / admin123
- operator / operator123

2) Frontend
- Buka index.html (bisa via hosting statis / local server).

Catatan:
- Aplikasi menggunakan sheet yang sama dengan aplikasi utama jika SPREADSHEET_ID sama.
- Sheet yang digunakan: participants, doorprize_items, doorprize_draws, panel_users, panel_sessions, logs, app_config.
