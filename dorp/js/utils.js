// ===============================
// FG2026 - Doorprize Utils (standalone)
// Fokus: notifikasi UI + helper kecil yang dipakai oleh operator_doorprize
// ===============================

(function(){
  class Utils {
    getConfig(){ return window.AppConfig || {}; }

    showNotification(message, type = 'info'){
      const notification = document.createElement('div');
      notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 animate-fade-in ${this._notifColor(type)}`;
      notification.innerHTML = `
        <div class="flex items-center">
          <i class="fas ${this._notifIcon(type)} mr-3"></i>
          <div><p class="font-medium">${this._esc(message)}</p></div>
          <button class="ml-4 text-gray-500 hover:text-gray-700" aria-label="Tutup">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;

      notification.querySelector('button')?.addEventListener('click', ()=> notification.remove());
      document.body.appendChild(notification);

      const cfg = this.getConfig();
      const timeout = Number(cfg?.app?.notificationTimeout || 4500);
      setTimeout(()=>{ if(notification.parentElement) notification.remove(); }, timeout);
    }

    _notifColor(type){
      const colors = {
        success: 'bg-green-100 text-green-800 border border-green-200',
        error:   'bg-red-100 text-red-800 border border-red-200',
        warning: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
        info:    'bg-blue-100 text-blue-800 border border-blue-200'
      };
      return colors[type] || colors.info;
    }

    _notifIcon(type){
      const icons = {
        success: 'fa-check-circle',
        error:   'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info:    'fa-info-circle'
      };
      return icons[type] || icons.info;
    }

    _esc(s){
      return String(s ?? '').replace(/[&<>"']/g, m => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      }[m]));
    }
  }

  window.utils = window.utils || new Utils();
  window.Utils = window.Utils || Utils;
})();
