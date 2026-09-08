async function apiFetch(url, options = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Non authentifié'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur');
  return data;
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDuree(min) {
  if (min == null || min === '') return '—';
  min = Number(min);
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h} h`;
}
function fmtFCFA(n) {
  if (n == null || n === '' || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('fr-FR') + ' F';
}

let APP_CONFIG = { types_equipement: [], criticites: [] };
let ME = null;

async function loadMe() {
  const { user } = await apiFetch('/api/me');
  ME = user;
  const n = document.getElementById('userName');
  const e = document.getElementById('userEntreprise');
  if (n) n.textContent = user.nom_complet;
  if (e) e.textContent = user.entreprise || '';
  return user;
}
async function loadConfig() {
  try { APP_CONFIG = await apiFetch('/api/config'); } catch (e) {}
  return APP_CONFIG;
}

function fillSelect(el, values, { keepFirst = true, selected } = {}) {
  if (!el) return;
  const first = keepFirst ? el.querySelector('option') : null;
  el.innerHTML = '';
  if (first) el.appendChild(first);
  for (const v of values) {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    if (v === selected) o.selected = true;
    el.appendChild(o);
  }
}

// ---- modal ----
function showModal(html) {
  closeModal();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'modalOverlay';
  ov.innerHTML = `<div class="modal-box">${html}</div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(); });
  document.body.appendChild(ov);
  return ov;
}
function closeModal() {
  const ex = document.getElementById('modalOverlay');
  if (ex) ex.remove();
}

function setupLogout() {
  const b = document.getElementById('logoutBtn');
  if (b) b.addEventListener('click', async () => {
    await apiFetch('/api/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login.html';
  });
}

function openChangePassword(force = false) {
  const ov = showModal(`
    <h2>Changer mon mot de passe</h2>
    ${force ? '<p class="muted" style="margin-top:0;">Vous utilisez encore le mot de passe par défaut. Merci d\'en choisir un nouveau.</p>' : ''}
    <form id="pwdForm">
      <label for="pwd_c">Mot de passe actuel</label>
      <input type="password" id="pwd_c" required>
      <label for="pwd_n">Nouveau mot de passe (min. 6 caractères)</label>
      <input type="password" id="pwd_n" required minlength="6">
      <label for="pwd_x">Confirmer</label>
      <input type="password" id="pwd_x" required minlength="6">
      <div class="error-msg" id="pwdErr" style="display:none;"></div>
      <div class="success-msg" id="pwdOk" style="display:none;"></div>
      <div class="modal-actions">
        ${force ? '' : '<button type="button" class="secondary" id="pwdCancel">Annuler</button>'}
        <button type="submit">Valider</button>
      </div>
    </form>
  `);
  const cancel = ov.querySelector('#pwdCancel');
  if (cancel) cancel.addEventListener('click', closeModal);
  ov.querySelector('#pwdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = ov.querySelector('#pwdErr'), ok = ov.querySelector('#pwdOk');
    err.style.display = 'none'; ok.style.display = 'none';
    const n = ov.querySelector('#pwd_n').value, x = ov.querySelector('#pwd_x').value;
    if (n !== x) { err.textContent = 'Les deux mots de passe ne correspondent pas.'; err.style.display = 'block'; return; }
    try {
      await apiFetch('/api/me/password', { method: 'POST', body: JSON.stringify({ currentPassword: ov.querySelector('#pwd_c').value, newPassword: n }) });
      ok.textContent = 'Mot de passe modifié.'; ok.style.display = 'block';
      setTimeout(closeModal, 1200);
    } catch (e2) { err.textContent = e2.message; err.style.display = 'block'; }
  });
}
