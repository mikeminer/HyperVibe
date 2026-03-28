/**
 * Local SQLite store — all HyperVibe state persists here.
 * Located at ~/.hypervibe/hypervibe.db
 */

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const DIR = join(homedir(), '.hypervibe');
const DB_PATH = join(DIR, 'hypervibe.db');

let _db = null;

export function getDb() {
  if (_db) return _db;

  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS playbooks (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      allocation  REAL DEFAULT 0,
      state       TEXT DEFAULT 'scanning',
      status      TEXT DEFAULT 'active',
      plan        TEXT,
      created_at  INTEGER DEFAULT (unixepoch() * 1000),
      updated_at  INTEGER DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS triggers (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      playbook_id   TEXT REFERENCES playbooks(id),
      scope         TEXT DEFAULT 'market',   -- 'symbol' | 'portfolio' | 'market'
      watch_coins   TEXT DEFAULT '[]',       -- JSON array of coins
      condition_mode TEXT NOT NULL,          -- 'code' | 'time' | 'event' | 'llm'
      condition_expr TEXT NOT NULL,
      action_type   TEXT NOT NULL,           -- 'hard_order' | 'reasoning_job'
      action_args   TEXT DEFAULT '{}',       -- JSON
      context       TEXT,
      status        TEXT DEFAULT 'active',   -- 'active' | 'paused' | 'fired' | 'expired'
      fire_count    INTEGER DEFAULT 0,
      expires_at    INTEGER,
      created_at    INTEGER DEFAULT (unixepoch() * 1000),
      last_fired_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id           TEXT PRIMARY KEY,
      playbook_id  TEXT REFERENCES playbooks(id),
      trigger_id   TEXT REFERENCES triggers(id),
      coin         TEXT NOT NULL,
      side         TEXT NOT NULL,            -- 'BUY' | 'SELL'
      size         TEXT NOT NULL,
      order_type   TEXT DEFAULT 'MARKET',
      price        TEXT,
      reduce_only  INTEGER DEFAULT 0,
      reasoning    TEXT NOT NULL,
      status       TEXT DEFAULT 'pending',   -- 'pending' | 'approved' | 'rejected' | 'expired'
      tx_result    TEXT,
      created_at   INTEGER DEFAULT (unixepoch() * 1000),
      resolved_at  INTEGER
    );

    CREATE TABLE IF NOT EXISTS learnings (
      id            TEXT PRIMARY KEY,
      playbook_id   TEXT REFERENCES playbooks(id),
      trigger_id    TEXT REFERENCES triggers(id),
      approval_id   TEXT REFERENCES approvals(id),
      coin          TEXT,
      side          TEXT,
      size          REAL,
      price         REAL,
      fee           REAL DEFAULT 0,
      closed_pnl    REAL DEFAULT 0,
      note          TEXT,
      status        TEXT DEFAULT 'filled',
      order_id      TEXT,
      filled_at     INTEGER DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS observations (
      id          TEXT PRIMARY KEY,
      playbook_id TEXT REFERENCES playbooks(id),
      content     TEXT NOT NULL,
      tags        TEXT DEFAULT '[]',
      created_at  INTEGER DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}
