/**
 * Triggers — condition + action pairs evaluated on every Heartbeat tick.
 */

import { randomUUID } from 'crypto';
import cron from 'node-cron';
import { getDb } from '../store/db.js';

let _broadcast = null;
export function setBroadcast(fn) { _broadcast = fn; }

export const Triggers = {
  // ── CRUD ──────────────────────────────────────────────────────────────────

  create({ name, playbookId = null, scope = 'market', watchCoins = [], conditionMode, conditionExpr, actionType, actionArgs = {}, context = '', expiresAt = null }) {
    const db = getDb();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO triggers (id, name, playbook_id, scope, watch_coins, condition_mode, condition_expr, action_type, action_args, context, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, playbookId, scope, JSON.stringify(watchCoins), conditionMode, conditionExpr, actionType, JSON.stringify(actionArgs), context, expiresAt);
    return this.get(id);
  },

  get(id) {
    const t = getDb().prepare('SELECT * FROM triggers WHERE id = ?').get(id);
    return t ? this._parse(t) : null;
  },

  list({ playbookId = null, status = 'active' } = {}) {
    const db = getDb();
    let sql = 'SELECT * FROM triggers WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (playbookId !== undefined && playbookId !== null) { sql += ' AND playbook_id = ?'; params.push(playbookId); }
    sql += ' ORDER BY created_at DESC';
    return db.prepare(sql).all(...params).map(t => this._parse(t));
  },

  update(id, fields) {
    const db = getDb();
    const allowed = ['name', 'status', 'condition_expr', 'action_args', 'context', 'expires_at'];
    const sets = Object.keys(fields).filter(k => allowed.includes(k));
    if (sets.length === 0) return this.get(id);
    const sql = `UPDATE triggers SET ${sets.map(k => `${k} = ?`).join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...sets.map(k => fields[k]), id);
    return this.get(id);
  },

  pause(id) { return this.update(id, { status: 'paused' }); },
  resume(id) { return this.update(id, { status: 'active' }); },
  delete(id) { getDb().prepare('DELETE FROM triggers WHERE id = ?').run(id); },

  markFired(id) {
    getDb().prepare(`
      UPDATE triggers SET fire_count = fire_count + 1, last_fired_at = unixepoch() * 1000 WHERE id = ?
    `).run(id);
  },

  expireStale() {
    const now = Date.now();
    getDb().prepare("UPDATE triggers SET status = 'expired' WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < ?").run(now);
  },

  // ── Evaluation ────────────────────────────────────────────────────────────

  /**
   * Evaluate a single trigger against a price snapshot.
   * Returns true if the condition fires, false otherwise.
   */
  evaluate(trigger, snapshot) {
    try {
      if (trigger.conditionMode === 'code') {
        // Safe-ish eval: only has access to prices object
        // In production you'd use a sandboxed VM
        const fn = new Function('prices', `"use strict"; return (${trigger.conditionExpr});`);
        return Boolean(fn(snapshot));
      }
      // time and event triggers are handled by Heartbeat directly
      return false;
    } catch (err) {
      console.error(`[trigger] eval error for ${trigger.id}: ${err.message}`);
      return false;
    }
  },

  _parse(t) {
    return {
      ...t,
      watchCoins: JSON.parse(t.watch_coins ?? '[]'),
      actionArgs: JSON.parse(t.action_args ?? '{}'),
    };
  },
};

// ── Cron task registry (for 'time' triggers) ──────────────────────────────────

const _cronTasks = new Map();

export function scheduleCronTrigger(trigger, onFire) {
  if (_cronTasks.has(trigger.id)) return; // already scheduled
  if (trigger.conditionMode !== 'time') return;

  const expr = trigger.conditionExpr;
  if (!cron.validate(expr)) {
    console.warn(`[trigger] invalid cron: ${expr}`);
    return;
  }

  const task = cron.schedule(expr, () => {
    Triggers.markFired(trigger.id);
    if (_broadcast) _broadcast({ type: 'trigger_fired', trigger });
    onFire(trigger);
  });

  _cronTasks.set(trigger.id, task);
  console.log(`[trigger] scheduled cron: "${trigger.name}" — ${expr}`);
}

export function cancelCronTrigger(triggerId) {
  const task = _cronTasks.get(triggerId);
  if (task) { task.stop(); _cronTasks.delete(triggerId); }
}

export function cancelAllCronTriggers() {
  for (const [id, task] of _cronTasks) { task.stop(); _cronTasks.delete(id); }
}
