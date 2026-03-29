/**
 * Heartbeat — the cheap monitoring loop.
 */

import { Triggers, scheduleCronTrigger, cancelAllCronTriggers } from './triggers.js';
import Anthropic from '@anthropic-ai/sdk';

const TICK_INTERVAL_MS = 30_000;

let _interval  = null;
let _api       = null;
let _onReasoningJob = null;
let _onHardOrder    = null;
let _broadcast      = null;

let _haiku = null;
function getHaiku() {
  if (!_haiku) _haiku = new Anthropic();
  return _haiku;
}

export async function startHeartbeat({ api, onReasoningJob, onHardOrder, broadcast }) {
  if (_interval) return;
  _api            = api;
  _onReasoningJob = onReasoningJob;
  _onHardOrder    = onHardOrder;
  _broadcast      = broadcast;

  // Schedule existing cron triggers
  const existing = await Triggers.list({ status: 'active' });
  for (const t of existing) {
    if (t.conditionMode === 'time') {
      scheduleCronTrigger(t, _handleFired);
    }
  }

  console.log('[heartbeat] started — tick every 30s');
  _tick();
  _interval = setInterval(_tick, TICK_INTERVAL_MS);
}

export function stopHeartbeat() {
  if (_interval) { clearInterval(_interval); _interval = null; }
  cancelAllCronTriggers();
  console.log('[heartbeat] stopped');
}

async function _tick() {
  try {
    const triggers = await Triggers.list({ status: 'active' });
    await Triggers.expireStale();

    const watchedCoins = new Set();
    for (const t of triggers) {
      for (const coin of (t.watchCoins ?? [])) watchedCoins.add(coin);
    }

    let prices = {};
    if (watchedCoins.size > 0) {
      prices = await _api.getPrices([...watchedCoins]);
    }

    const snapshot = { prices, ts: Date.now() };
    if (_broadcast) _broadcast({ type: 'heartbeat_tick', snapshot });

    for (const trigger of triggers.filter(t => t.conditionMode === 'code')) {
      const fired = Triggers.evaluate(trigger, prices);
      if (fired) await _handleFired(trigger, snapshot);
    }

    const llmTriggers = triggers.filter(t => t.conditionMode === 'llm');
    if (llmTriggers.length > 0) {
      await _evaluateLLMTriggers(llmTriggers, snapshot);
    }
  } catch (err) {
    console.error('[heartbeat] tick error:', err.message);
  }
}

async function _evaluateLLMTriggers(triggers, snapshot) {
  const haiku = getHaiku();
  for (const trigger of triggers) {
    try {
      const res = await haiku.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: `Given this market snapshot: ${JSON.stringify(snapshot.prices)}\nAnswer only "yes" or "no": ${trigger.conditionExpr}` }],
      });
      const answer = res.content[0]?.text?.toLowerCase().trim();
      if (answer?.startsWith('yes')) await _handleFired(trigger, snapshot);
    } catch (err) {
      console.error(`[heartbeat] llm eval error ${trigger.id}:`, err.message);
    }
  }
}

async function _handleFired(trigger, snapshot = {}) {
  if (trigger.lastFiredAt && Date.now() - trigger.lastFiredAt < 5_000) return;
  console.log(`[heartbeat] trigger fired: "${trigger.name}" (${trigger.actionType})`);
  await Triggers.markFired(trigger.id);
  if (trigger.actionType === 'hard_order') {
    await _onHardOrder?.(trigger);
  } else if (trigger.actionType === 'reasoning_job') {
    await _onReasoningJob?.(trigger, snapshot);
  }
  if (trigger.conditionMode === 'code' && trigger.actionType === 'hard_order') {
    await Triggers.update(trigger.id, { status: 'fired' });
  }
}
