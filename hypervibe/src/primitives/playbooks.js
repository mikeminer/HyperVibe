/**
 * Playbooks — persistent strategy documents loaded into agent context on every run.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../store/db.js';

export const Playbooks = {
  create({ name, description = '', allocation = 0, plan = '' }) {
    const db = getDb();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO playbooks (id, name, description, allocation, plan)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, description, allocation, plan);
    return this.get(id);
  },

  get(id) {
    return getDb().prepare('SELECT * FROM playbooks WHERE id = ?').get(id) ?? null;
  },

  list(status = null) {
    const db = getDb();
    if (status) return db.prepare('SELECT * FROM playbooks WHERE status = ? ORDER BY created_at DESC').all(status);
    return db.prepare('SELECT * FROM playbooks ORDER BY created_at DESC').all();
  },

  update(id, fields) {
    const db = getDb();
    const allowed = ['name', 'description', 'allocation', 'plan', 'state', 'status'];
    const sets = Object.keys(fields).filter(k => allowed.includes(k));
    if (sets.length === 0) return this.get(id);
    const sql = `UPDATE playbooks SET ${sets.map(k => `${k} = ?`).join(', ')}, updated_at = unixepoch() * 1000 WHERE id = ?`;
    db.prepare(sql).run(...sets.map(k => fields[k]), id);
    return this.get(id);
  },

  setState(id, state) {
    return this.update(id, { state });
  },

  archive(id) {
    return this.update(id, { status: 'archived' });
  },

  /** Format a playbook for injection into agent context */
  toContext(id) {
    const p = this.get(id);
    if (!p) return '';
    return `
## Active Playbook: ${p.name}
**ID:** ${p.id}
**Allocation:** $${p.allocation} USDC
**State:** ${p.state}
**Description:** ${p.description}

### Strategy Plan
${p.plan}
    `.trim();
  },
};
