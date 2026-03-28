/**
 * The main HyperVibe agent — Claude Sonnet with full tool access.
 * Loaded when a trigger fires a reasoning_job or the user chats.
 */

import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, handleTool } from './tools.js';
import { Playbooks } from '../primitives/playbooks.js';
import { Learnings } from '../primitives/learnings.js';
import { Triggers } from '../primitives/triggers.js';
import { Permissions } from '../primitives/permissions.js';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;
const MAX_TOOL_LOOPS = 10;

const SYSTEM_PROMPT = `You are HyperVibe, an autonomous trading agent for Hyperliquid perpetuals.

You have 20 tools covering market data, account info, and trade execution. Every trade goes through an approval gate — you queue it, the user approves or rejects it. Never try to execute without queueing first.

## Your role
- Reason carefully from live data. Never assume prices — always fetch them.
- When asked to trade, fetch current price + indicators first, then make your case.
- When placing a trade, write detailed reasoning covering: what signals fired, why this setup, entry rationale, stop/target levels, risk/reward.
- After placing a trade, immediately create appropriate Heartbeat triggers: stop-loss (hard_order), target (hard_order), position monitor (time-based reasoning_job).
- Be direct. No fluff. Traders value precision over politeness.
- When in doubt, stand down and explain why.

## Capital rules
- Never risk more than 2% of account equity on a single trade unless explicitly instructed otherwise.
- Always propose a stop-loss with every entry.
- If account equity cannot be fetched, refuse to size positions.

## Hyperliquid specifics
- All perps are settled in USDC.
- Funding rates are paid/received every 1 hour.
- Coins trade 24/7.
- Size is in coin units (e.g. 0.01 BTC, not dollars).
- For market orders, slippage is typically < 0.05% on liquid markets.

## Tool use
- get_positions, get_account_value, get_open_orders: always call these at the start of any portfolio review.
- get_candles + compute_indicators: use for technical analysis before any entry.
- get_funding_rate: always check before entering a position that might be held overnight.
- place_order: always include full reasoning. The user reads this verbatim in the approval card.
- create_trigger: create stop-loss and target triggers immediately after every entry.
`;

const client = new Anthropic();

/**
 * Run a single agent turn.
 * @param {object[]} messages - conversation history
 * @param {object} context - { api, signer, walletAddress, vaultAddress, playbookId, triggerContext }
 * @param {function} onChunk - called with each streamed text chunk
 * @returns {object[]} updated messages
 */
export async function runAgent(messages, context, onChunk = null) {
  const { api, signer, walletAddress, vaultAddress, playbookId } = context;

  // Build system with live context injections
  let system = SYSTEM_PROMPT + '\n\n';
  system += `## Current time: ${new Date().toISOString()} (UTC)\n`;

  if (playbookId) {
    system += '\n' + Playbooks.toContext(playbookId) + '\n';
    system += '\n' + Learnings.toContext(playbookId) + '\n';
  }

  if (context.triggerContext) {
    system += `\n## Trigger Context\nThis run was spawned by trigger: "${context.triggerContext.name}"\n${context.triggerContext.context || ''}\n`;
  }

  const activePlaybooks = Playbooks.list('active');
  if (activePlaybooks.length > 0) {
    system += `\n## Active Playbooks\n${activePlaybooks.map(p => `• ${p.name} (${p.id}) — ${p.state} — $${p.allocation} allocated`).join('\n')}\n`;
  }

  const pendingApprovals = Permissions.listPending();
  if (pendingApprovals.length > 0) {
    system += `\n## Pending Approvals (${pendingApprovals.length})\n${pendingApprovals.map(a => `• ${a.id.slice(0, 8)}: ${a.side} ${a.size} ${a.coin}`).join('\n')}\n`;
  }

  const playbookCtx = playbookId ? Playbooks.get(playbookId) : null;

  let currentMessages = [...messages];
  let loopCount = 0;
  let fullText = '';

  while (loopCount < MAX_TOOL_LOOPS) {
    loopCount++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools: TOOL_DEFINITIONS,
      messages: currentMessages,
    });

    // Collect text content
    const textBlocks = response.content.filter(b => b.type === 'text');
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

    for (const block of textBlocks) {
      fullText += block.text;
      if (onChunk) onChunk({ type: 'text', text: block.text });
    }

    // Add assistant message to history
    currentMessages = [...currentMessages, { role: 'assistant', content: response.content }];

    // If no tool calls, we're done
    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') break;

    // Execute tools
    const toolResults = [];
    for (const toolUse of toolUseBlocks) {
      if (onChunk) onChunk({ type: 'tool_call', tool: toolUse.name, input: toolUse.input });

      let result;
      try {
        result = await handleTool(toolUse.name, toolUse.input, {
          api, signer, walletAddress, vaultAddress, playbookContext: playbookCtx,
        });
        if (onChunk) onChunk({ type: 'tool_result', tool: toolUse.name, result });
      } catch (err) {
        result = { error: err.message };
        if (onChunk) onChunk({ type: 'tool_error', tool: toolUse.name, error: err.message });
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }

    // Add tool results and continue loop
    currentMessages = [...currentMessages, { role: 'user', content: toolResults }];
  }

  if (onChunk) onChunk({ type: 'done', text: fullText });
  return currentMessages;
}

/**
 * Run the agent in response to a trigger firing.
 */
export async function runReasoningJob(trigger, snapshot, context, broadcast) {
  console.log(`[agent] reasoning job for trigger: "${trigger.name}"`);

  const systemMsg = {
    role: 'user',
    content: `Trigger fired: "${trigger.name}"\n\nContext: ${trigger.context || 'None'}\n\nCurrent market snapshot: ${JSON.stringify(snapshot?.prices ?? {})}\n\nPlease analyse the situation and take appropriate action.`,
  };

  const messages = await runAgent([systemMsg], { ...context, triggerContext: trigger }, (chunk) => {
    if (broadcast) broadcast({ type: 'agent_chunk', triggerId: trigger.id, chunk });
  });

  // Extract final text
  const finalMsg = messages.filter(m => m.role === 'assistant').at(-1);
  const text = finalMsg?.content?.filter(b => b.type === 'text').map(b => b.text).join('') ?? '';

  if (text) {
    Learnings.addObservation({
      playbookId: trigger.playbookId ?? trigger.playbook_id,
      content: `[Trigger: ${trigger.name}] ${text.slice(0, 500)}`,
      tags: ['trigger', trigger.actionType],
    });
  }
}
