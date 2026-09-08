const CRITICITE_COLORS = { Faible: '#8a9b8e', Moyenne: '#e5851f', Haute: '#d0342c', Critique: '#8b1a14' };
const TABS = ['nouveau', 'dashboard', 'bibliotheque'];

function activateTab(tab) {
  document.querySelectorAll('.nav-item[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  TABS.forEach((t) => {
    const el = document.getElementById('tab-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'bibliotheque') loadBibliotheque();
}
document.querySelectorAll('.nav-item[data-tab]').forEach((b) => b.addEventListener('click', () => activateTab(b.dataset.tab)));
document.getElementById('changePasswordBtn').addEventListener('click', () => openChangePassword(false));

// ---- formulaire nouveau retour ----
function initForm() {
  document.getElementById('f_date').valueAsDate = new Date();
  document.getElementById('f_entreprise').value = ME.entreprise || '';
  fillSelect(document.getElementById('f_type'), APP_CONFIG.types_equipement, { keepFirst: true });
  fillSelect(document.getElementById('f_criticite'), APP_CONFIG.criticites, { keepFirst: false, selected: 'Moyenne' });
}

document.getElementById('retourForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('retourError'), ok = document.getElementById('retourSuccess');
  err.style.display = 'none'; ok.style.display = 'none';
  const g = (id) => document.getElementById(id).value;
  const payload = {
    date_intervention: g('f_date'),
    entreprise: g('f_entreprise').trim(),
    equipement: g('f_equipement').trim(),
    type_equipement: g('f_type'),
    zone: g('f_zone').trim(),
    criticite: g('f_criticite'),
    description_probleme: g('f_probleme').trim(),
    cause: g('f_cause').trim(),
    solution: g('f_solution').trim(),
    pieces_utilisees: g('f_pieces').trim(),
    temps_remise_minutes: g('f_temps') || null,
    cout_reparation: g('f_cout') || null,
    recurrent: document.getElementById('f_recurrent').checked
  };
  try {
    await apiFetch('/api/retours', { method: 'POST', body: JSON.stringify(payload) });
    ok.textContent = 'Retour enregistré. Merci !'; ok.style.display = 'block';
    document.getElementById('retourForm').reset();
    initForm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e2) { err.textContent = e2.message; err.style.display = 'block'; }
});

// ---- tableau de bord ----
async function loadDashboard() {
  try {
    const s = await apiFetch('/api/stats');
    document.getElementById('kTotal').textContent = s.total;
    document.getElementById('kEntreprises').textContent = s.entreprises;
    document.getElementById('kContributeurs').textContent = s.contributeurs;
    document.getElementById('kTemps').innerHTML = s.temps_moyen_minutes
      ? `${Math.round(s.temps_moyen_minutes)}<span class="unit">min</span>` : '—';
    document.getElementById('kCout').textContent = s.cout_moyen ? fmtFCFA(s.cout_moyen) : '—';
    document.getElementById('kRecurrents').textContent = s.recurrents;
    document.getElementById('dashUpdated').textContent = `${s.total} retour${s.total > 1 ? 's' : ''}`;

    drawBarChart('chEntreprise', s.parEntreprise, 'entreprise', 'n');
    drawBarChart('chTempsType', s.tempsParType, 'type', 'moyenne', { unit: 'min' });
    drawDonut('chType', s.parType, 'type', 'n');
    renderLegend('legType', s.parType, 'type', 'n');
    drawDonut('chCriticite', s.parCriticite, 'criticite', 'n', CRITICITE_COLORS);
    renderLegend('legCriticite', s.parCriticite, 'criticite', 'n', CRITICITE_COLORS);
    drawBarChart('chTopEquip', s.topEquipements, 'equipement', 'n');
  } catch (e) { console.error(e); }
}
document.getElementById('exportBtn').addEventListener('click', () => { window.location.href = '/api/export'; });

// ---- bibliothèque ----
async function fillBiblioFilters() {
  fillSelect(document.getElementById('b_type'), APP_CONFIG.types_equipement, { keepFirst: true });
  fillSelect(document.getElementById('b_criticite'), APP_CONFIG.criticites, { keepFirst: true });
  try {
    const { entreprises } = await apiFetch('/api/entreprises');
    fillSelect(document.getElementById('b_entreprise'), entreprises, { keepFirst: true });
  } catch (e) {}
}

let biblioCache = [];
async function loadBibliotheque() {
  const tbody = document.getElementById('biblioBody');
  tbody.innerHTML = '<tr><td colspan="8" class="muted">Chargement...</td></tr>';
  const p = new URLSearchParams();
  const g = (id) => document.getElementById(id).value;
  if (g('b_q')) p.set('q', g('b_q'));
  if (g('b_entreprise')) p.set('entreprise', g('b_entreprise'));
  if (g('b_type')) p.set('type_equipement', g('b_type'));
  if (g('b_criticite')) p.set('criticite', g('b_criticite'));
  try {
    const { retours } = await apiFetch('/api/retours?' + p.toString());
    biblioCache = retours;
    if (retours.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="muted">Aucun retour trouvé.</td></tr>'; return; }
    tbody.innerHTML = retours.map((r) => `
      <tr class="clickable-row" data-id="${r.id}">
        <td>${r.date_intervention}</td>
        <td>${escapeHtml(r.entreprise)}</td>
        <td>${escapeHtml(r.equipement)}</td>
        <td>${escapeHtml(r.type_equipement)}</td>
        <td><span class="badge ${r.criticite}">${r.criticite}</span></td>
        <td class="wrap">${escapeHtml((r.description_probleme || '').slice(0, 120))}${(r.description_probleme || '').length > 120 ? '…' : ''}</td>
        <td>${fmtDuree(r.temps_remise_minutes)}</td>
        <td>${escapeHtml(r.nom)}</td>
      </tr>`).join('');
    tbody.querySelectorAll('tr[data-id]').forEach((row) =>
      row.addEventListener('click', () => openDetail(biblioCache.find((x) => x.id === Number(row.dataset.id)))));
  } catch (e) { tbody.innerHTML = `<tr><td colspan="8" class="error-msg">${e.message}</td></tr>`; }
}
document.getElementById('b_search').addEventListener('click', loadBibliotheque);
document.getElementById('b_q').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadBibliotheque(); });

function detailRow(k, v) {
  if (v == null || v === '') return '';
  return `<div class="detail-row"><div class="k">${k}</div><div class="v">${escapeHtml(v)}</div></div>`;
}
function openDetail(r) {
  if (!r) return;
  const canEdit = ME && (ME.role === 'admin' || ME.id === r.user_id);
  const ov = showModal(`
    <h2>${escapeHtml(r.equipement)} <span class="badge ${r.criticite}" style="font-size:11px;vertical-align:middle;">${r.criticite}</span></h2>
    <p class="muted" style="margin-top:-4px;">${escapeHtml(r.entreprise)} · ${r.date_intervention} · saisi par ${escapeHtml(r.nom)}${r.recurrent ? ' · <strong>récurrent</strong>' : ''}</p>
    ${detailRow("Type d'équipement", r.type_equipement)}
    ${detailRow('Zone / atelier', r.zone)}
    ${detailRow('Problème rencontré', r.description_probleme)}
    ${detailRow('Cause identifiée', r.cause)}
    ${detailRow('Solution appliquée', r.solution)}
    ${detailRow('Pièces utilisées', r.pieces_utilisees)}
    ${detailRow('Temps de remise en état', fmtDuree(r.temps_remise_minutes))}
    ${r.cout_reparation != null ? detailRow('Coût de la réparation', fmtFCFA(r.cout_reparation)) : ''}
    <div class="modal-actions">
      ${canEdit ? '<button type="button" class="danger" id="dDelete">Supprimer</button>' : ''}
      <button type="button" class="secondary" id="dClose">Fermer</button>
    </div>
  `);
  ov.querySelector('#dClose').addEventListener('click', closeModal);
  const del = ov.querySelector('#dDelete');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('Supprimer ce retour ?')) return;
    try { await apiFetch('/api/retours/' + r.id, { method: 'DELETE' }); closeModal(); loadBibliotheque(); }
    catch (e) { alert(e.message); }
  });
}

// ---- init ----
(async () => {
  await loadMe();
  await loadConfig();
  setupLogout();
  initForm();
  fillBiblioFilters();
  if (ME.must_change_password) openChangePassword(true);
})();
