/**
 * Permissions — the approval gate.
 * Every trade must pass through here before execution.
 * hard_order triggers bypass the queue (pre-authorised at trigger creation).
 */

import { randomUUID } from 'crypto';
import { getDb } from '../store/db.js';

/** Broadcast function injected at startup so permissions can push events to UI */
let _broadcast = null;
export function setBroadcast(fn) { _broadcast = fn; }

export const Permissions = {
  // ── Queue a trade for approval ─────────────────────────────────────────────

  queue({ playbookId = null, triggerId = null, coin, side, size, orderType = 'MARKET', price = null, reduceOnly = false, reasoning }) {
    const db = getDb();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO approvals (id, playbook_id, trigger_id, coin, side, size, order_type, price, reduce_only, reasoning)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, playbookId, triggerId, coin, side, String(size), orderType, price ? String(price) : null, reduceOnly ? 1 : 0, reasoning);

    const approval = this.get(id);
    if (_broadcast) _broadcast({ type: 'approval_queued', approval });
    return approval;
  },

  get(id) {
    return getDb().prepare('SELECT * FROM approvals WHERE id = ?').get(id) ?? null;
  },

  listPending() {
    return getDb().prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at DESC").all();
  },

  listAll(limit = 50) {
    return getDb().prepare('SELECT * FROM approvals ORDER BY created_at DESC LIMIT ?').all(limit);
  },

  /** Mark as approved — returns the approval record for execution */
  approve(id) {
    const db = getDb();
    db.prepare("UPDATE approvals SET status = 'approved', resolved_at = unixepoch() * 1000 WHERE id = ? AND status = 'pending'").run(id);
    const approval = this.get(id);
    if (_broadcast) _broadcast({ type: 'approval_resolved', approval });
    return approval;
  },

  reject(id) {
    const db = getDb();
    db.prepare("UPDATE approvals SET status = 'rejected', resolved_at = unixepoch() * 1000 WHERE id = ? AND status = 'pending'").run(id);
    const approval = this.get(id);
    if (_broadcast) _broadcast({ type: 'approval_resolved', approval });
    return approval;
  },

  recordResult(id, txResult) {
    getDb().prepare("UPDATE approvals SET tx_result = ?, status = 'executed' WHERE id = ?").run(JSON.stringify(txResult), id);
  },

  /** Expire approvals older than ttlMs that are still pending */
  expireStale(ttlMs = 10 * 60 * 1000) {
    const cutoff = Date.now() - ttlMs;
    getDb().prepare("UPDATE approvals SET status = 'expired' WHERE status = 'pending' AND created_at < ?").run(cutoff);
  },
};
