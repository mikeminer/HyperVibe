/**
 * Permissions — the approval gate.
 */

import { randomUUID } from 'crypto';
import { getDb, dbAll, dbGet, dbRun } from '../store/db.js';

let _broadcast = null;
export function setBroadcast(fn) { _broadcast = fn; }

export const Permissions = {
  async _db() { return getDb(); },

  async queue({ playbookId = null, triggerId = null, coin, side, size, orderType = 'MARKET', price = null, reduceOnly = false, reasoning }) {
    const db = await this._db();
    const id = randomUUID();
    dbRun(db, `INSERT INTO approvals (id, playbook_id, trigger_id, coin, side, size, order_type, price, reduce_only, reasoning)
               VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, playbookId, triggerId, coin, side, String(size), orderType, price ? String(price) : null, reduceOnly ? 1 : 0, reasoning]);
    const approval = await this.get(id);
    if (_broadcast) _broadcast({ type: 'approval_queued', approval });
    return approval;
  },

  async get(id) {
    const db = await this._db();
    return dbGet(db, 'SELECT * FROM approvals WHERE id = ?', [id]);
  },

  async listPending() {
    const db = await this._db();
    return dbAll(db, "SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at DESC");
  },

  async listAll(limit = 50) {
    const db = await this._db();
    return dbAll(db, 'SELECT * FROM approvals ORDER BY created_at DESC LIMIT ?', [limit]);
  },

  async approve(id) {
    const db = await this._db();
    dbRun(db, "UPDATE approvals SET status = 'approved', resolved_at = strftime('%s','now')*1000 WHERE id = ? AND status = 'pending'", [id]);
    const approval = await this.get(id);
    if (_broadcast) _broadcast({ type: 'approval_resolved', approval });
    return approval;
  },

  async reject(id) {
    const db = await this._db();
    dbRun(db, "UPDATE approvals SET status = 'rejected', resolved_at = strftime('%s','now')*1000 WHERE id = ? AND status = 'pending'", [id]);
    const approval = await this.get(id);
    if (_broadcast) _broadcast({ type: 'approval_resolved', approval });
    return approval;
  },

  async recordResult(id, txResult) {
    const db = await this._db();
    dbRun(db, "UPDATE approvals SET tx_result = ?, status = 'executed' WHERE id = ?", [JSON.stringify(txResult), id]);
  },

  async expireStale(ttlMs = 10 * 60 * 1000) {
    const db = await this._db();
    const cutoff = Date.now() - ttlMs;
    dbRun(db, "UPDATE approvals SET status = 'expired' WHERE status = 'pending' AND created_at < ?", [cutoff]);
  },
};
