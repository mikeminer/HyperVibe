/**
 * Learnings — immutable trade journal + observations.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../store/db.js';

export const Learnings = {
  // ── Trade records ─────────────────────────────────────────────────────────

  logTrade({ playbookId = null, triggerId = null, approvalId = null, coin, side, size, price, fee = 0, closedPnl = 0, note = '', orderId = null }) {
    const db = getDb();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO learnings (id, playbook_id, trigger_id, approval_id, coin, side, size, price, fee, closed_pnl, note, order_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, playbookId, triggerId, approvalId, coin, side, size, price, fee, closedPnl, note, orderId);
    return id;
  },

  getTrades({ playbookId = null, coin = null, limit = 50 } = {}) {
    const db = getDb();
    let sql = 'SELECT * FROM learnings WHERE 1=1';
    const params = [];
    if (playbookId) { sql += ' AND playbook_id = ?'; params.push(playbookId); }
    if (coin) { sql += ' AND coin = ?'; params.push(coin); }
    sql += ' ORDER BY filled_at DESC LIMIT ?';
    params.push(limit);
    return db.prepare(sql).all(...params);
  },

  getPnlSummary(playbookId = null) {
    const db = getDb();
    let sql = 'SELECT SUM(closed_pnl) as totalPnl, SUM(fee) as totalFees, COUNT(*) as tradeCount FROM learnings WHERE 1=1';
    const params = [];
    if (playbookId) { sql += ' AND playbook_id = ?'; params.push(playbookId); }
    return db.prepare(sql).get(...params);
  },

  // ── Observations ──────────────────────────────────────────────────────────

  addObservation({ playbookId = null, content, tags = [] }) {
    const db = getDb();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO observations (id, playbook_id, content, tags)
      VALUES (?, ?, ?, ?)
    `).run(id, playbookId, content, JSON.stringify(tags));
    return id;
  },

  getObservations({ playbookId = null, limit = 20 } = {}) {
    const db = getDb();
    let sql = 'SELECT * FROM observations WHERE 1=1';
    const params = [];
    if (playbookId) { sql += ' AND playbook_id = ?'; params.push(playbookId); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    return db.prepare(sql).all(...params);
  },

  /** Build a context string of recent trades + observations for the agent */
  toContext(playbookId = null, limit = 10) {
    const trades = this.getTrades({ playbookId, limit });
    const obs = this.getObservations({ playbookId, limit: 5 });
    const pnl = this.getPnlSummary(playbookId);

    let ctx = '## Recent Trade History\n';
    if (trades.length === 0) {
      ctx += 'No trades recorded yet.\n';
    } else {
      ctx += `Total PnL: $${(pnl.totalPnl ?? 0).toFixed(2)} | Fees: $${(pnl.totalFees ?? 0).toFixed(2)} | Trades: ${pnl.tradeCount}\n\n`;
      for (const t of trades) {
        const ts = new Date(t.filled_at).toISOString();
        ctx += `• ${ts} ${t.side} ${t.size} ${t.coin} @ ${t.price} | PnL: $${t.closed_pnl?.toFixed(2)} | ${t.note}\n`;
      }
    }
    if (obs.length > 0) {
      ctx += '\n## Observations\n';
      for (const o of obs) ctx += `• ${o.content}\n`;
    }
    return ctx;
  },
};
