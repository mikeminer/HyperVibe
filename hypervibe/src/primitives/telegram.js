/**
 * Telegram async approvals.
 * When a trade is queued for approval, sends a structured message to your
 * Telegram chat with ✓ Approve / ✗ Reject inline buttons.
 *
 * Setup:
 *   1. Message @BotFather on Telegram → /newbot → copy the token
 *   2. Message your bot once (to open a chat)
 *   3. Run: node -e "fetch('https://api.telegram.org/bot<TOKEN>/getUpdates').then(r=>r.json()).then(d=>console.log(d.result[0]?.message?.chat?.id))"
 *   4. Add to .env:
 *        TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
 *        TELEGRAM_CHAT_ID=123456789
 */

const BASE = (token) => `https://api.telegram.org/bot${token}`;

let _token      = null;
let _chatId     = null;
let _onApprove  = null;   // callback(approvalId)
let _onReject   = null;   // callback(approvalId)
let _polling    = false;
let _lastUpdate = 0;
let _broadcast  = null;

export function initTelegram({ token, chatId, onApprove, onReject, broadcast }) {
  if (!token || !chatId) return false;
  _token     = token;
  _chatId    = chatId;
  _onApprove = onApprove;
  _onReject  = onReject;
  _broadcast = broadcast;
  startPolling();
  console.log('[telegram] bot initialized, polling for callbacks...');
  return true;
}

export function isTelegramConfigured() {
  return Boolean(_token && _chatId);
}

// ── Send approval notification ─────────────────────────────────────────────────

export async function sendApprovalMessage(approval) {
  if (!_token || !_chatId) return false;

  const side  = approval.side === 'BUY' ? '🟢 BUY' : '🔴 SELL';
  const size  = parseFloat(approval.size).toFixed(4);
  const type  = approval.order_type ?? 'MARKET';
  const price = approval.price ? `@ $${parseFloat(approval.price).toFixed(4)}` : 'MARKET';

  // Truncate reasoning to fit Telegram's 4096 char limit
  const reasoning = (approval.reasoning ?? '').slice(0, 600);
  const truncated = approval.reasoning?.length > 600 ? '…' : '';

  const text = [
    `⚡ *HyperVibe — Trade Approval Required*`,
    ``,
    `*${side} ${size} ${approval.coin}* ${price} (${type})`,
    ``,
    `📋 *Reasoning:*`,
    `${reasoning}${truncated}`,
    ``,
    `_Reply via the buttons below or at_ http://localhost:3001`,
  ].join('\n');

  try {
    const res = await fetch(`${BASE(_token)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:    _chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✓ Approve', callback_data: `approve:${approval.id}` },
            { text: '✗ Reject',  callback_data: `reject:${approval.id}`  },
          ]],
        },
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('[telegram] sendMessage error:', data.description);
      return false;
    }
    console.log(`[telegram] approval message sent for ${approval.coin} ${approval.side}`);
    return true;
  } catch (err) {
    console.error('[telegram] sendMessage failed:', err.message);
    return false;
  }
}

// ── Send trade executed notification ──────────────────────────────────────────

export async function sendExecutionNotification(approval, txResult) {
  if (!_token || !_chatId) return;

  const coin = approval?.coin ?? approval?.symbol ?? '???';
  const side = approval?.side ?? '???';
  const size = approval?.size ?? '???';

  const fill = txResult?.response?.data?.statuses?.[0]?.filled;
  const err  = txResult?.error
             ?? txResult?.response?.data?.statuses?.[0]?.error
             ?? (typeof txResult?.response === 'string' ? txResult.response : null);

  let text;
  if (err) {
    text = `❌ *Trade Failed*\n${side} ${size} ${coin}\n\`${err}\``;
  } else if (fill) {
    text = `✅ *Trade Executed*\n${side} ${fill.totalSz} ${coin} @ $${parseFloat(fill.avgPx).toFixed(4)}\nFee: $${parseFloat(fill.fee ?? 0).toFixed(4)}`;
  } else {
    text = `✅ *Order Submitted*\n${side} ${size} ${coin}`;
  }

  try {
    await fetch(`${BASE(_token)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: _chatId, text, parse_mode: 'Markdown' }),
    });
  } catch {}
}

// ── Send generic notification ──────────────────────────────────────────────────

export async function sendNotification(text) {
  if (!_token || !_chatId) return;
  try {
    await fetch(`${BASE(_token)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: _chatId, text, parse_mode: 'Markdown' }),
    });
  } catch {}
}

// ── Long polling loop ──────────────────────────────────────────────────────────

async function startPolling() {
  if (_polling) return;
  _polling = true;

  while (_polling) {
    try {
      const res = await fetch(`${BASE(_token)}/getUpdates?offset=${_lastUpdate + 1}&timeout=25&allowed_updates=["callback_query"]`);
      const data = await res.json();

      if (data.ok && data.result?.length) {
        for (const update of data.result) {
          _lastUpdate = update.update_id;
          if (update.callback_query) {
            await handleCallback(update.callback_query);
          }
        }
      }
    } catch (err) {
      // Network error — wait before retrying
      await sleep(5000);
    }
  }
}

async function handleCallback(cb) {
  const [action, approvalId] = (cb.data ?? '').split(':');
  if (!approvalId) return;

  // Answer the callback immediately (removes loading spinner)
  try {
    await fetch(`${BASE(_token)}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: cb.id,
        text: action === 'approve' ? '✓ Approving...' : '✗ Rejecting...',
      }),
    });
  } catch {}

  // Execute the action
  if (action === 'approve' && _onApprove) {
    console.log(`[telegram] approve received for ${approvalId}`);
    await _onApprove(approvalId);

    // Edit the message to show it was approved
    await editMessage(cb.message.chat.id, cb.message.message_id,
      cb.message.text + '\n\n✓ *Approved via Telegram*', null);

  } else if (action === 'reject' && _onReject) {
    console.log(`[telegram] reject received for ${approvalId}`);
    await _onReject(approvalId);

    await editMessage(cb.message.chat.id, cb.message.message_id,
      cb.message.text + '\n\n✗ *Rejected via Telegram*', null);
  }
}

async function editMessage(chatId, messageId, text, replyMarkup) {
  try {
    await fetch(`${BASE(_token)}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:    chatId,
        message_id: messageId,
        text,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup ?? { inline_keyboard: [] },
      }),
    });
  } catch {}
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function stopTelegram() { _polling = false; }
