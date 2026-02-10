// FG Unit Draw - Hardcoded config (requested)
// Primary GAS WebApp URL (/exec)
const GAS_URL_EXEC = "https://script.google.com/macros/s/AKfycbyW1L0iNL-rjaiSbX6_jrWPN30aJdjeOhSejh5JjRhsu1AiGo96zAsxYlXk4mqBlQ/exec";

// Redirect/echo URL (optional). DO NOT use this for JSONP <script> loads because it may return application/json.
// Keep only if you need it for manual navigation; JSONP in app.js always uses GAS_URL_EXEC.
const GAS_URL_REDIRECT = "https://script.googleusercontent.com/macros/echo?user_content_key=AehSKLgcr6ESizuSBbgkkEKSDlW9vasA5lgKy8-Bf84bfav93096DMR4WlNKAcrDvQRI79d72zJSJiDVCAEJxVv4UnQG4SQoBhMs5cafhpZWA7EjimEcG9SpdxwIVBD9sw89tsWCy-mmundzgFEuZuNeRur2j-w1AwGb2Lw_tii42Aa6CCpdUHg9rFod4ozS8n7dd38R7WtLejlxAJZtbWWrBTOTcWoDodWt6JUbE-U5ma3CvS3N9w-ReWl1WdSnimV2cLVrWVwcBEIUnmVWEKa0uGXlwzDtbA&lib=MBGcxKW_L6DTkfHH7kVOdheKhRZZwLdRi";

// Optional: set default polling interval (ms)
const DISPLAY_POLL_MS = 1200;
