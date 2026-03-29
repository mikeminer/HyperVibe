/**
 * Learnings — immutable trade journal + observations.
 */

import { randomUUID } from 'crypto';
import { getDb, dbAll, dbGet, dbRun } from '../store/db.js';

export const Learnings = {
  async _db() { return getDb(); },

  async logTrade({ playbookId = null, triggerId = null, approvalId = null, coin, side, size, price, fee = 0, closedPnl = 0, note = '', orderId = null }) {
    const db = await this._db();
    const id = randomUUID();
    dbRun(db, `INSERT INTO learnings (id, playbook_id, trigger_id, approval_id, coin, side, size, price, fee, closed_pnl, note, order_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, playbookId, triggerId, approvalId, coin, side, size, price, fee, closedPnl, note, orderId]);
    return id;
  },

  async getTrades({ playbookId = null, coin = null, limit = 50 } = {}) {
    const db = await this._db();
    let sql = 'SELECT * FROM learnings WHERE 1=1';
    const params = [];
    if (playbookId) { sql += ' AND playbook_id = ?'; params.push(playbookId); }
    if (coin)       { sql += ' AND coin = ?';        params.push(coin); }
    sql += ' ORDER BY filled_at DESC LIMIT ?';
    params.push(limit);
    return dbAll(db, sql, params);
  },

  async getPnlSummary(playbookId = null) {
    const db = await this._db();
    let sql = 'SELECT SUM(closed_pnl) as totalPnl, SUM(fee) as totalFees, COUNT(*) as tradeCount FROM learnings WHERE 1=1';
    const params = [];
    if (playbookId) { sql += ' AND playbook_id = ?'; params.push(playbookId); }
    return dbGet(db, sql, params) ?? { totalPnl: 0, totalFees: 0, tradeCount: 0 };
  },

  async addObservation({ playbookId = null, content, tags = [] }) {
    const db = await this._db();
    const id = randomUUID();
    dbRun(db, `INSERT INTO observations (id, playbook_id, content, tags) VALUES (?,?,?,?)`,
      [id, playbookId, content, JSON.stringify(tags)]);
    return id;
  },

  async getObservations({ playbookId = null, limit = 20 } = {}) {
    const db = await this._db();
    let sql = 'SELECT * FROM observations WHERE 1=1';
    const params = [];
    if (playbookId) { sql += ' AND playbook_id = ?'; params.push(playbookId); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    return dbAll(db, sql, params);
  },

  async toContext(playbookId = null, limit = 10) {
    const trades = await this.getTrades({ playbookId, limit });
    const obs    = await this.getObservations({ playbookId, limit: 5 });
    const pnl    = await this.getPnlSummary(playbookId);
    let ctx = '## Recent Trade History\n';
    if (trades.length === 0) {
      ctx += 'No trades recorded yet.\n';
    } else {
      ctx += `Total PnL: $${(pnl.totalPnl ?? 0).toFixed(2)} | Fees: $${(pnl.totalFees ?? 0).toFixed(2)} | Trades: ${pnl.tradeCount}\n\n`;
      for (const t of trades) {
        const ts = new Date(t.filled_at).toISOString();
        ctx += `• ${ts} ${t.side} ${t.size} ${t.coin} @ ${t.price} | PnL: $${(t.closed_pnl ?? 0).toFixed(2)} | ${t.note}\n`;
      }
    }
    if (obs.length > 0) {
      ctx += '\n## Observations\n';
      for (const o of obs) ctx += `• ${o.content}\n`;
    }
    return ctx;
  },
};
