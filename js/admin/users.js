/* FG2026 - Admin Panel (Modular)
   js/admin/users.js
*/
(function(){
  const FGAdmin = window.FGAdmin = window.FGAdmin || {};
  const utils = window.utils || (window.utils = new Utils());

  const { $, $$, htmlEsc, renderTable, getRows, openModal, getVal, getChecked } = FGAdmin.dom;

async function loadUsers(){
const data = await FGAPI.admin.usersList(FGAdmin.store.token);
FGAdmin.store.cache.users = getRows(data);

const box = $('#tab-users');
box.innerHTML = `
  <div class="flex items-center justify-between gap-3 mb-4">
    <div>
      <h3 class="text-xl font-bold text-gray-800">User Panel</h3>
    </div>
    <button id="u-add" class="bg-gradient-to-r from-blue-600 to-teal-500 text-white px-4 py-2 rounded-xl">
      <i class="fas fa-plus mr-2"></i>Tambah
    </button>
  </div>
`;

const tableWrap = document.createElement('div');
box.appendChild(tableWrap);

renderTable(tableWrap,
  [
    {key:'username',label:'Username'},
    {key:'name',label:'Nama'},
    {key:'role',label:'Role'},
    {key:'active',label:'Aktif'}
  ],
  FGAdmin.store.cache.users.map(x=>({
    username:x.username,
    name:x.name,
    role:x.role,
    active:(x.active===true || String(x.active||'').toUpperCase()==='TRUE') ? 'Y' : 'N'
  })),
  (r)=>`<button class="u-edit text-blue-700" data-u="${htmlEsc(r.username)}" title="Edit"><i class="fas fa-pen"></i></button>
        <button class="u-pass text-purple-700 ml-2" data-u="${htmlEsc(r.username)}" title="Reset password"><i class="fas fa-key"></i></button>`
);

function openUserForm(cur){
  const isEdit = !!cur;
  const overlay = openModal({
    title: isEdit ? `Edit User (${cur.username})` : 'Tambah User',
    saveText: isEdit ? 'Simpan Perubahan' : 'Buat User',
    bodyHtml: `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Username</label>
          <input id="u_username" class="w-full p-3 border rounded-xl" placeholder="mis: operator2" ${isEdit?'disabled':''}/>
          ${isEdit?'<div class="text-xs text-gray-500 mt-1">Username tidak bisa diubah</div>':''}
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Nama</label>
          <input id="u_name" class="w-full p-3 border rounded-xl" placeholder="Nama tampilan" />
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Role</label>
          <select id="u_role" class="w-full p-3 border rounded-xl">
            <option value="OPERATOR">OPERATOR</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>

        <div class="flex items-center gap-2 p-3 border rounded-xl bg-gray-50">
          <input id="u_active" type="checkbox" class="w-4 h-4" />
          <label for="u_active" class="font-semibold text-gray-800 cursor-pointer">Aktif</label>
        </div>

        <div class="md:col-span-2 p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 border">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="font-bold text-gray-800">Password</div>
              <div class="text-sm text-gray-600">
                ${isEdit ? 'Isi jika ingin reset password. Kosongkan jika tidak diubah.' : 'Isi password awal (jika kosong, default: user123).'}
              </div>
            </div>
          </div>
          <div class="mt-3">
            <input id="u_pass" type="password" class="w-full p-3 border rounded-xl" placeholder="${isEdit?'(opsional) reset password':'user123'}" />
          </div>
        </div>
      </div>
    `,
    onSave: async ({ root, close })=>{
      const username = getVal(root,'#u_username') || (isEdit ? String(cur.username) : '');
      const name = getVal(root,'#u_name') || username;
      const role = (getVal(root,'#u_role') || 'OPERATOR').toUpperCase();
      const active = getChecked(root,'#u_active');
      const pass = root.querySelector('#u_pass')?.value || '';

      if(!username){ utils.showNotification('Username wajib','warning'); return; }

      await FGAPI.admin.usersUpsert(FGAdmin.store.token, { username, name, role, active });

      // reset password jika diisi
      const finalPass = (pass && pass.trim()) ? pass.trim() : '';
      if(finalPass){
        await FGAPI.admin.usersResetPassword(FGAdmin.store.token, username, finalPass);
      }else if(!isEdit){
        // user baru tanpa password -> set default user123 (biar pasti)
        await FGAPI.admin.usersResetPassword(FGAdmin.store.token, username, 'user123');
      }

      utils.showNotification('User tersimpan','success');
      close();
      await loadUsers();
    }
  });

  // init
  overlay.querySelector('#u_username').value = isEdit ? (cur.username||'') : '';
  overlay.querySelector('#u_name').value = isEdit ? (cur.name||cur.username||'') : '';
  overlay.querySelector('#u_role').value = isEdit ? (String(cur.role||'OPERATOR').toUpperCase()) : 'OPERATOR';
  overlay.querySelector('#u_active').checked = isEdit ? (cur.active===true || String(cur.active||'').toUpperCase()==='TRUE') : true;
}

function openResetPass(username){
  const overlay = openModal({
    title: `Reset Password (${username})`,
    saveText: 'Reset Password',
    bodyHtml: `
      <div class="space-y-3">
        <div class="p-4 rounded-2xl bg-yellow-50 border border-yellow-200 text-yellow-900">
          Masukkan password baru untuk user <b>${htmlEsc(username)}</b>.
        </div>
        <input id="rp_pass" type="password" class="w-full p-3 border rounded-xl" placeholder="Password baru" />
      </div>
    `,
    onSave: async ({ root, close })=>{
      const np = root.querySelector('#rp_pass')?.value || '';
      if(!np.trim()){ utils.showNotification('Password tidak boleh kosong','warning'); return; }
      await FGAPI.admin.usersResetPassword(FGAdmin.store.token, username, np.trim());
      utils.showNotification('Password direset','success');
      close();
    }
  });
  overlay.querySelector('#rp_pass')?.focus();
}

// add
$('#u-add').onclick = ()=> openUserForm(null);

// edit
$$('.u-edit', box).forEach(btn=>btn.onclick = ()=>{
  const username = btn.dataset.u;
  const cur = FGAdmin.store.cache.users.find(x=>String(x.username)===String(username));
  if(cur) openUserForm(cur);
});

// reset pass
$$('.u-pass', box).forEach(btn=>btn.onclick = ()=>{
  const username = btn.dataset.u;
  openResetPass(username);
});
}

  FGAdmin.users = {
    loadUsers
  };
})();
