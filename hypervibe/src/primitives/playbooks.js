/**
 * Playbooks — persistent strategy documents loaded into agent context on every run.
 */

import { randomUUID } from 'crypto';
import { getDb, dbAll, dbGet, dbRun } from '../store/db.js';

export const Playbooks = {
  async _db() { return getDb(); },

  async create({ name, description = '', allocation = 0, plan = '' }) {
    const db = await this._db();
    const id = randomUUID();
    dbRun(db, `INSERT INTO playbooks (id, name, description, allocation, plan) VALUES (?,?,?,?,?)`,
      [id, name, description, allocation, plan]);
    return this.get(id);
  },

  async get(id) {
    const db = await this._db();
    return dbGet(db, 'SELECT * FROM playbooks WHERE id = ?', [id]);
  },

  async list(status = null) {
    const db = await this._db();
    if (status) return dbAll(db, 'SELECT * FROM playbooks WHERE status = ? ORDER BY created_at DESC', [status]);
    return dbAll(db, 'SELECT * FROM playbooks ORDER BY created_at DESC');
  },

  async update(id, fields) {
    const db = await this._db();
    const allowed = ['name', 'description', 'allocation', 'plan', 'state', 'status'];
    const sets = Object.keys(fields).filter(k => allowed.includes(k));
    if (sets.length === 0) return this.get(id);
    const sql = `UPDATE playbooks SET ${sets.map(k => `${k} = ?`).join(', ')}, updated_at = strftime('%s','now')*1000 WHERE id = ?`;
    dbRun(db, sql, [...sets.map(k => fields[k]), id]);
    return this.get(id);
  },

  async setState(id, state) { return this.update(id, { state }); },
  async archive(id) { return this.update(id, { status: 'archived' }); },

  async toContext(id) {
    const p = await this.get(id);
    if (!p) return '';
    return `## Active Playbook: ${p.name}\n**ID:** ${p.id}\n**Allocation:** $${p.allocation} USDC\n**State:** ${p.state}\n**Description:** ${p.description}\n\n### Strategy Plan\n${p.plan}`.trim();
  },
};
