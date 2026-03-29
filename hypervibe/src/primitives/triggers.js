/**
 * Triggers — condition + action pairs evaluated on every Heartbeat tick.
 */

import { randomUUID } from 'crypto';
import cron from 'node-cron';
import { getDb, dbAll, dbGet, dbRun } from '../store/db.js';

let _broadcast = null;
export function setBroadcast(fn) { _broadcast = fn; }

export const Triggers = {
  async _db() { return getDb(); },

  async create({ name, playbookId = null, scope = 'market', watchCoins = [], conditionMode, conditionExpr, actionType, actionArgs = {}, context = '', expiresAt = null }) {
    const db = await this._db();
    const id = randomUUID();
    dbRun(db, `INSERT INTO triggers (id, name, playbook_id, scope, watch_coins, condition_mode, condition_expr, action_type, action_args, context, expires_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, name, playbookId, scope, JSON.stringify(watchCoins), conditionMode, conditionExpr, actionType, JSON.stringify(actionArgs), context, expiresAt]);
    return this.get(id);
  },

  async get(id) {
    const db = await this._db();
    const t = dbGet(db, 'SELECT * FROM triggers WHERE id = ?', [id]);
    return t ? this._parse(t) : null;
  },

  async list({ playbookId = null, status = 'active' } = {}) {
    const db = await this._db();
    let sql = 'SELECT * FROM triggers WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (playbookId != null) { sql += ' AND playbook_id = ?'; params.push(playbookId); }
    sql += ' ORDER BY created_at DESC';
    return dbAll(db, sql, params).map(t => this._parse(t));
  },

  async update(id, fields) {
    const db = await this._db();
    const allowed = ['name', 'status', 'condition_expr', 'action_args', 'context', 'expires_at'];
    const sets = Object.keys(fields).filter(k => allowed.includes(k));
    if (sets.length === 0) return this.get(id);
    dbRun(db, `UPDATE triggers SET ${sets.map(k => `${k} = ?`).join(', ')} WHERE id = ?`,
      [...sets.map(k => fields[k]), id]);
    return this.get(id);
  },

  async pause(id)  { return this.update(id, { status: 'paused' }); },
  async resume(id) { return this.update(id, { status: 'active' }); },

  async delete(id) {
    const db = await this._db();
    dbRun(db, 'DELETE FROM triggers WHERE id = ?', [id]);
  },

  async markFired(id) {
    const db = await this._db();
    dbRun(db, `UPDATE triggers SET fire_count = fire_count + 1, last_fired_at = strftime('%s','now')*1000 WHERE id = ?`, [id]);
  },

  async expireStale() {
    const db = await this._db();
    dbRun(db, "UPDATE triggers SET status = 'expired' WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < ?", [Date.now()]);
  },

  evaluate(trigger, prices) {
    try {
      if (trigger.conditionMode === 'code') {
        const fn = new Function('prices', `"use strict"; return (${trigger.conditionExpr});`);
        return Boolean(fn(prices));
      }
      return false;
    } catch(e) {
      console.error(`[trigger] eval error ${trigger.id}: ${e.message}`);
      return false;
    }
  },

  _parse(t) {
    return {
      ...t,
      watchCoins:  JSON.parse(t.watch_coins  ?? '[]'),
      actionArgs:  JSON.parse(t.action_args  ?? '{}'),
    };
  },
};

// ── Cron registry ─────────────────────────────────────────────────────────────

const _cronTasks = new Map();

export function scheduleCronTrigger(trigger, onFire) {
  if (_cronTasks.has(trigger.id)) return;
  if (trigger.conditionMode !== 'time') return;
  const expr = trigger.conditionExpr;
  if (!cron.validate(expr)) { console.warn(`[trigger] invalid cron: ${expr}`); return; }
  const task = cron.schedule(expr, () => {
    Triggers.markFired(trigger.id);
    if (_broadcast) _broadcast({ type: 'trigger_fired', trigger });
    onFire(trigger);
  });
  _cronTasks.set(trigger.id, task);
}

export function cancelCronTrigger(id) {
  const task = _cronTasks.get(id);
  if (task) { task.stop(); _cronTasks.delete(id); }
}

export function cancelAllCronTriggers() {
  for (const [id, task] of _cronTasks) { task.stop(); _cronTasks.delete(id); }
}
