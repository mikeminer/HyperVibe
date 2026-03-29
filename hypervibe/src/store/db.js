/**
 * Local SQLite store using sql.js (pure JavaScript — no compilation needed).
 * Located at ~/.hypervibe/hypervibe.db
 */

import initSqlJs from 'sql.js';
import { homedir } from 'os';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DIR     = join(homedir(), '.hypervibe');
const DB_PATH = join(DIR, 'hypervibe.db');

let _db  = null;
let _dirty = false;

// Persist to disk every 5 seconds if dirty
function schedulePersist() {
  setInterval(() => {
    if (_dirty && _db) {
      try {
        const data = _db.export();
        writeFileSync(DB_PATH, Buffer.from(data));
        _dirty = false;
      } catch(e) {
        console.error('[db] persist error:', e.message);
      }
    }
  }, 5000);
}

export async function getDb() {
  if (_db) return _db;

  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }

  initSchema(_db);
  schedulePersist();

  // Wrap run/prepare to mark dirty
  const origRun = _db.run.bind(_db);
  _db.run = (...args) => {
    const result = origRun(...args);
    _dirty = true;
    return result;
  };

  return _db;
}

// Synchronous wrapper — sql.js is sync so this works
export function getDbSync() {
  if (!_db) throw new Error('DB not initialized — call getDb() first');
  return _db;
}

function initSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS playbooks (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      allocation  REAL DEFAULT 0,
      state       TEXT DEFAULT 'scanning',
      status      TEXT DEFAULT 'active',
      plan        TEXT,
      created_at  INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at  INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS triggers (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      playbook_id    TEXT,
      scope          TEXT DEFAULT 'market',
      watch_coins    TEXT DEFAULT '[]',
      condition_mode TEXT NOT NULL,
      condition_expr TEXT NOT NULL,
      action_type    TEXT NOT NULL,
      action_args    TEXT DEFAULT '{}',
      context        TEXT,
      status         TEXT DEFAULT 'active',
      fire_count     INTEGER DEFAULT 0,
      expires_at     INTEGER,
      created_at     INTEGER DEFAULT (strftime('%s','now') * 1000),
      last_fired_at  INTEGER
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id           TEXT PRIMARY KEY,
      playbook_id  TEXT,
      trigger_id   TEXT,
      coin         TEXT NOT NULL,
      side         TEXT NOT NULL,
      size         TEXT NOT NULL,
      order_type   TEXT DEFAULT 'MARKET',
      price        TEXT,
      reduce_only  INTEGER DEFAULT 0,
      reasoning    TEXT NOT NULL,
      status       TEXT DEFAULT 'pending',
      tx_result    TEXT,
      created_at   INTEGER DEFAULT (strftime('%s','now') * 1000),
      resolved_at  INTEGER
    );

    CREATE TABLE IF NOT EXISTS learnings (
      id            TEXT PRIMARY KEY,
      playbook_id   TEXT,
      trigger_id    TEXT,
      approval_id   TEXT,
      coin          TEXT,
      side          TEXT,
      size          REAL,
      price         REAL,
      fee           REAL DEFAULT 0,
      closed_pnl    REAL DEFAULT 0,
      note          TEXT,
      status        TEXT DEFAULT 'filled',
      order_id      TEXT,
      filled_at     INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS observations (
      id          TEXT PRIMARY KEY,
      playbook_id TEXT,
      content     TEXT NOT NULL,
      tags        TEXT DEFAULT '[]',
      created_at  INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS skills_meta (
      id          TEXT PRIMARY KEY,
      name        TEXT,
      installed   INTEGER DEFAULT (strftime('%s','now') * 1000)
    );
  `);
}

// ── sql.js query helpers (mimic better-sqlite3 API) ──────────────────────────

/**
 * Run a query that returns rows.
 * @param {Database} db
 * @param {string} sql
 * @param {any[]} params
 * @returns {object[]}
 */
export function dbAll(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch(e) {
    console.error('[db] dbAll error:', e.message, sql);
    return [];
  }
}

/**
 * Run a query that returns one row.
 */
export function dbGet(db, sql, params = []) {
  const rows = dbAll(db, sql, params);
  return rows[0] ?? null;
}

/**
 * Run a write query.
 */
export function dbRun(db, sql, params = []) {
  try {
    db.run(sql, params);
    _dirty = true;
  } catch(e) {
    console.error('[db] dbRun error:', e.message, sql);
    throw e;
  }
}
