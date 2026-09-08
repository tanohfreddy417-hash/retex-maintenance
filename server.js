const express = require('express');
const session = require('express-session');
const path = require('node:path');
const crypto = require('node:crypto');
const { ready, get, all, run, createUser, verifyUser, verifyPasswordById, updatePassword } = require('./db');
const { TYPES_EQUIPEMENT, CRITICITES } = require('./constants');

const app = express();
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 jours
  })
);

function ah(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
  });
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Non authentifié' });
  next();
}

// identifiant : minuscules, sans accents, sans espaces
function slugUsername(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);
}

// ---- auth ----
app.post('/api/register', ah(async (req, res) => {
  const b = req.body || {};
  const nom_complet = (b.nom_complet || '').trim();
  const entreprise = (b.entreprise || '').trim();
  let username = slugUsername(b.username || nom_complet);
  if (!nom_complet) return res.status(400).json({ error: 'Nom complet requis' });
  if (!entreprise) return res.status(400).json({ error: 'Entreprise requise' });
  if (username.length < 3) return res.status(400).json({ error: 'Identifiant trop court (min. 3 lettres)' });

  const exists = await get(`SELECT id FROM users WHERE username = ?`, [username]);
  if (exists) return res.status(409).json({ error: `L'identifiant "${username}" est déjà pris. Ajoutez votre prénom ou un chiffre.` });

  const motDePasse = username + '1234';
  await createUser({ username, password: motDePasse, nom_complet, entreprise, role: 'membre', must_change: 1 });
  res.status(201).json({ username, mot_de_passe: motDePasse });
}));

app.post('/api/login', ah(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Identifiants manquants' });
  const user = await verifyUser(slugUsername(username), password);
  if (!user) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  req.session.user = {
    id: user.id, username: user.username, nom_complet: user.nom_complet,
    entreprise: user.entreprise, role: user.role, must_change_password: !!user.must_change_password
  };
  res.json({ user: req.session.user });
}));

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

app.post('/api/me/password', requireAuth, ah(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Champs requis manquants' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères' });
  if (!(await verifyPasswordById(req.session.user.id, currentPassword))) {
    return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  }
  await updatePassword(req.session.user.id, newPassword);
  req.session.user.must_change_password = false;
  res.json({ ok: true });
}));

app.get('/api/config', requireAuth, (req, res) => {
  res.json({ types_equipement: TYPES_EQUIPEMENT, criticites: CRITICITES });
});

// ---- retours d'expérience ----
app.post('/api/retours', requireAuth, ah(async (req, res) => {
  const b = req.body || {};
  const required = ['date_intervention', 'equipement', 'type_equipement', 'description_probleme', 'solution'];
  for (const f of required) {
    if (!b[f] || !String(b[f]).trim()) return res.status(400).json({ error: `Champ requis manquant : ${f}` });
  }
  if (!TYPES_EQUIPEMENT.includes(b.type_equipement)) return res.status(400).json({ error: "Type d'équipement invalide" });
  const criticite = CRITICITES.includes(b.criticite) ? b.criticite : 'Moyenne';
  const info = await run(`
    INSERT INTO retours
      (user_id, nom, entreprise, date_intervention, equipement, type_equipement, zone,
       description_probleme, cause, solution, pieces_utilisees, temps_remise_minutes, cout_reparation, criticite, recurrent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    req.session.user.id,
    req.session.user.nom_complet,
    (b.entreprise || req.session.user.entreprise || '').trim() || 'Non précisée',
    b.date_intervention,
    String(b.equipement).trim(),
    b.type_equipement,
    (b.zone || '').trim() || null,
    String(b.description_probleme).trim(),
    (b.cause || '').trim() || null,
    String(b.solution).trim(),
    (b.pieces_utilisees || '').trim() || null,
    b.temps_remise_minutes ? Math.max(0, Math.round(Number(b.temps_remise_minutes))) : null,
    b.cout_reparation ? Math.max(0, Number(b.cout_reparation)) : null,
    criticite,
    b.recurrent ? 1 : 0
  ]);
  res.status(201).json({ id: info.lastInsertRowid });
}));

app.get('/api/retours', requireAuth, ah(async (req, res) => {
  const { q, entreprise, type_equipement, criticite, date_from, date_to, mine } = req.query;
  const clauses = [];
  const values = [];
  if (q) {
    clauses.push(`(equipement LIKE ? OR description_probleme LIKE ? OR solution LIKE ? OR cause LIKE ? OR pieces_utilisees LIKE ?)`);
    const like = `%${q}%`;
    values.push(like, like, like, like, like);
  }
  if (entreprise) { clauses.push('entreprise = ?'); values.push(entreprise); }
  if (type_equipement) { clauses.push('type_equipement = ?'); values.push(type_equipement); }
  if (criticite) { clauses.push('criticite = ?'); values.push(criticite); }
  if (date_from) { clauses.push('date_intervention >= ?'); values.push(date_from); }
  if (date_to) { clauses.push('date_intervention <= ?'); values.push(date_to); }
  if (mine === '1') { clauses.push('user_id = ?'); values.push(req.session.user.id); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await all(`SELECT * FROM retours ${where} ORDER BY date_intervention DESC, id DESC LIMIT 1000`, values);
  res.json({ retours: rows });
}));

app.get('/api/retours/:id', requireAuth, ah(async (req, res) => {
  const row = await get(`SELECT * FROM retours WHERE id = ?`, [Number(req.params.id)]);
  if (!row) return res.status(404).json({ error: 'Introuvable' });
  res.json({ retour: row });
}));

app.put('/api/retours/:id', requireAuth, ah(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await get(`SELECT * FROM retours WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Introuvable' });
  if (req.session.user.role !== 'admin' && existing.user_id !== req.session.user.id) {
    return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres retours' });
  }
  const b = req.body || {};
  const fields = ['date_intervention', 'equipement', 'type_equipement', 'zone', 'description_probleme',
    'cause', 'solution', 'pieces_utilisees', 'temps_remise_minutes', 'cout_reparation', 'criticite', 'recurrent', 'entreprise'];
  if (b.type_equipement !== undefined && !TYPES_EQUIPEMENT.includes(b.type_equipement)) {
    return res.status(400).json({ error: "Type d'équipement invalide" });
  }
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (b[f] === undefined) continue;
    updates.push(`${f} = ?`);
    if (f === 'recurrent') values.push(b[f] ? 1 : 0);
    else if (f === 'temps_remise_minutes') values.push(b[f] === '' || b[f] == null ? null : Math.max(0, Math.round(Number(b[f]))));
    else if (f === 'cout_reparation') values.push(b[f] === '' || b[f] == null ? null : Math.max(0, Number(b[f])));
    else values.push(b[f] === '' ? null : b[f]);
  }
  if (updates.length === 0) return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
  updates.push(`updated_at = datetime('now')`);
  values.push(id);
  await run(`UPDATE retours SET ${updates.join(', ')} WHERE id = ?`, values);
  res.json({ ok: true });
}));

app.delete('/api/retours/:id', requireAuth, ah(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await get(`SELECT * FROM retours WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Introuvable' });
  if (req.session.user.role !== 'admin' && existing.user_id !== req.session.user.id) {
    return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres retours' });
  }
  await run(`DELETE FROM retours WHERE id = ?`, [id]);
  res.json({ ok: true });
}));

// ---- tableau de bord ----
app.get('/api/stats', requireAuth, ah(async (req, res) => {
  const [
    totaux, parEntreprise, parType, parCriticite, tempsParType, topEquipements, parMois, recurrents
  ] = await Promise.all([
    get(`SELECT COUNT(*) AS total,
                COUNT(DISTINCT entreprise) AS entreprises,
                COUNT(DISTINCT user_id) AS contributeurs,
                AVG(temps_remise_minutes) AS temps_moyen,
                AVG(cout_reparation) AS cout_moyen
         FROM retours`),
    all(`SELECT entreprise, COUNT(*) AS n FROM retours GROUP BY entreprise ORDER BY n DESC`),
    all(`SELECT type_equipement AS type, COUNT(*) AS n FROM retours GROUP BY type_equipement ORDER BY n DESC`),
    all(`SELECT criticite, COUNT(*) AS n FROM retours GROUP BY criticite`),
    all(`SELECT type_equipement AS type, AVG(temps_remise_minutes) AS moyenne, COUNT(*) AS n
         FROM retours WHERE temps_remise_minutes IS NOT NULL
         GROUP BY type_equipement ORDER BY moyenne DESC`),
    all(`SELECT equipement, COUNT(*) AS n, COUNT(DISTINCT entreprise) AS nb_usines
         FROM retours GROUP BY LOWER(equipement) ORDER BY n DESC LIMIT 12`),
    all(`SELECT strftime('%Y-%m', date_intervention) AS mois, COUNT(*) AS n
         FROM retours GROUP BY mois ORDER BY mois ASC`),
    get(`SELECT COUNT(*) AS n FROM retours WHERE recurrent = 1`)
  ]);

  res.json({
    total: totaux.total,
    entreprises: totaux.entreprises,
    contributeurs: totaux.contributeurs,
    temps_moyen_minutes: totaux.temps_moyen || 0,
    cout_moyen: totaux.cout_moyen || 0,
    recurrents: recurrents.n,
    parEntreprise, parType, parCriticite, tempsParType, topEquipements, parMois
  });
}));

// ---- export CSV ----
app.get('/api/export', requireAuth, ah(async (req, res) => {
  const rows = await all(`SELECT * FROM retours ORDER BY date_intervention DESC, id DESC`);
  const cols = ['id', 'date_intervention', 'entreprise', 'nom', 'equipement', 'type_equipement', 'zone',
    'criticite', 'recurrent', 'description_probleme', 'cause', 'solution', 'pieces_utilisees',
    'temps_remise_minutes', 'cout_reparation', 'created_at'];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const csv = [cols.join(';')]
    .concat(rows.map((r) => cols.map((c) => esc(r[c])).join(';')))
    .join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="retex-maintenance-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + csv); // BOM pour Excel
}));

// ---- liste des entreprises (pour les filtres) ----
app.get('/api/entreprises', requireAuth, ah(async (req, res) => {
  const rows = await all(`SELECT DISTINCT entreprise FROM retours ORDER BY entreprise`);
  res.json({ entreprises: rows.map((r) => r.entreprise) });
}));

// ---- statique ----
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.redirect(req.session.user ? '/app.html' : '/login.html');
});

const PORT = process.env.PORT || 3100;
const HOST = process.env.HOST || '0.0.0.0';
ready
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`RETEX Maintenance démarré sur http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Échec d'initialisation de la base :", err);
    process.exit(1);
  });
