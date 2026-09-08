const { createClient } = require('@libsql/client');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// Base locale par défaut (fichier). En hébergement, TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN)
// pointe vers une base Turso distante — même code, même API.
const url = process.env.TURSO_DATABASE_URL || `file:${path.join(dataDir, 'retex.db').replace(/\\/g, '/')}`;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
const client = createClient({ url, authToken });

function toPlain(v) {
  return typeof v === 'bigint' ? Number(v) : v;
}
// Turso étant distante, une coupure réseau passagère peut faire échouer une requête :
// on retente une fois après une courte pause avant d'abandonner.
async function withRetry(fn) {
  try {
    return await fn();
  } catch (e) {
    const transient = /fetch failed|ConnectTimeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network/i.test(String(e && e.message));
    if (!transient) throw e;
    await new Promise((r) => setTimeout(r, 400));
    return await fn();
  }
}
async function exec(sql) {
  await withRetry(() => client.executeMultiple(sql));
}
async function run(sql, args = []) {
  const r = await withRetry(() => client.execute({ sql, args }));
  return { lastInsertRowid: toPlain(r.lastInsertRowid), changes: r.rowsAffected };
}
async function get(sql, args = []) {
  const r = await withRetry(() => client.execute({ sql, args }));
  return r.rows[0];
}
async function all(sql, args = []) {
  const r = await withRetry(() => client.execute({ sql, args }));
  return r.rows;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

async function createUser({ username, password, nom_complet, entreprise, role = 'membre', must_change = 1 }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const info = await run(
    `INSERT INTO users (username, password_hash, password_salt, nom_complet, entreprise, role, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [username, hash, salt, nom_complet, entreprise || null, role, must_change ? 1 : 0]
  );
  return info.lastInsertRowid;
}

async function verifyUser(username, password) {
  const user = await get(`SELECT * FROM users WHERE username = ? AND actif = 1`, [username]);
  if (!user) return null;
  const hash = hashPassword(password, user.password_salt);
  if (hash !== user.password_hash) return null;
  return user;
}

async function verifyPasswordById(userId, password) {
  const user = await get(`SELECT * FROM users WHERE id = ?`, [userId]);
  if (!user) return false;
  return hashPassword(password, user.password_salt) === user.password_hash;
}

async function updatePassword(userId, newPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(newPassword, salt);
  await run(`UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0 WHERE id = ?`,
    [hash, salt, userId]);
}

async function init() {
  await exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      nom_complet TEXT NOT NULL,
      entreprise TEXT,
      role TEXT NOT NULL DEFAULT 'membre' CHECK(role IN ('membre','admin')),
      must_change_password INTEGER NOT NULL DEFAULT 1,
      actif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS retours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      nom TEXT NOT NULL,
      entreprise TEXT NOT NULL,
      date_intervention TEXT NOT NULL,
      equipement TEXT NOT NULL,
      type_equipement TEXT NOT NULL,
      zone TEXT,
      description_probleme TEXT NOT NULL,
      cause TEXT,
      solution TEXT NOT NULL,
      pieces_utilisees TEXT,
      temps_remise_minutes INTEGER,
      cout_reparation REAL,
      criticite TEXT DEFAULT 'Moyenne',
      recurrent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

const ready = init();

module.exports = { ready, get, all, run, exec, createUser, verifyUser, verifyPasswordById, updatePassword };
