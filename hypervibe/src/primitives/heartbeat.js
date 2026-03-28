/**
 * Heartbeat — the cheap monitoring loop.
 * Evaluates all active triggers every 30s without spinning up the main agent.
 * Only wakes the agent when a condition actually fires.
 */

import { Triggers, scheduleCronTrigger, cancelAllCronTriggers } from './triggers.js';
import Anthropic from '@anthropic-ai/sdk';

const TICK_INTERVAL_MS = 30_000;
const SLOW_TICK_MS = 5 * 60_000;  // 5 min when nothing is active

let _interval = null;
let _api = null;
let _onReasoningJob = null;
let _onHardOrder = null;
let _broadcast = null;

/** Lightweight Claude Haiku client for LLM condition evaluation */
let _haiku = null;
function getHaiku() {
  if (!_haiku) _haiku = new Anthropic();
  return _haiku;
}

export function startHeartbeat({ api, onReasoningJob, onHardOrder, broadcast }) {
  if (_interval) return;
  _api = api;
  _onReasoningJob = onReasoningJob;
  _onHardOrder = onHardOrder;
  _broadcast = broadcast;

  // Schedule existing cron triggers
  for (const t of Triggers.list()) {
    if (t.conditionMode === 'time') {
      scheduleCronTrigger(t, _handleFired);
    }
  }

  console.log('[heartbeat] started — tick every 30s');
  _tick();  // immediate first tick
  _interval = setInterval(_tick, TICK_INTERVAL_MS);
}

export function stopHeartbeat() {
  if (_interval) { clearInterval(_interval); _interval = null; }
  cancelAllCronTriggers();
  console.log('[heartbeat] stopped');
}

async function _tick() {
  try {
    const triggers = Triggers.list({ status: 'active' });
    Triggers.expireStale();

    // Collect all coins being watched
    const watchedCoins = new Set();
    for (const t of triggers) {
      for (const coin of (t.watchCoins ?? [])) watchedCoins.add(coin);
    }

    // Build a cheap price snapshot
    let prices = {};
    if (watchedCoins.size > 0) {
      prices = await _api.getPrices([...watchedCoins]);
    }

    const snapshot = { prices, ts: Date.now() };
    if (_broadcast) _broadcast({ type: 'heartbeat_tick', snapshot });

    // Evaluate code triggers
    for (const trigger of triggers.filter(t => t.conditionMode === 'code')) {
      const fired = Triggers.evaluate(trigger, prices);
      if (fired) await _handleFired(trigger, snapshot);
    }

    // Evaluate LLM triggers (cheap Haiku yes/no)
    const llmTriggers = triggers.filter(t => t.conditionMode === 'llm');
    if (llmTriggers.length > 0) {
      await _evaluateLLMTriggers(llmTriggers, snapshot);
    }

    // Event triggers are handled by their event emitters
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
        messages: [{
          role: 'user',
          content: `Given this market snapshot: ${JSON.stringify(snapshot.prices)}
Answer only "yes" or "no": ${trigger.conditionExpr}`
        }],
      });
      const answer = res.content[0]?.text?.toLowerCase().trim();
      if (answer?.startsWith('yes')) await _handleFired(trigger, snapshot);
    } catch (err) {
      console.error(`[heartbeat] llm eval error for trigger ${trigger.id}:`, err.message);
    }
  }
}

async function _handleFired(trigger, snapshot = {}) {
  // Don't re-fire within the same tick if already fired recently (< 5s)
  if (trigger.lastFiredAt && Date.now() - trigger.lastFiredAt < 5_000) return;

  console.log(`[heartbeat] trigger fired: "${trigger.name}" (${trigger.actionType})`);
  Triggers.markFired(trigger.id);

  if (trigger.actionType === 'hard_order') {
    await _onHardOrder?.(trigger);
  } else if (trigger.actionType === 'reasoning_job') {
    await _onReasoningJob?.(trigger, snapshot);
  }

  // One-shot triggers expire after firing
  if (trigger.conditionMode === 'code' && trigger.actionType === 'hard_order') {
    Triggers.update(trigger.id, { status: 'fired' });
  }
}
