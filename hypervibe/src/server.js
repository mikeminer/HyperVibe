/**
 * HyperVibe server
 * Express REST API + WebSocket for real-time streaming.
 * Settings can be updated live via POST /api/settings — no restart needed.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import cors from 'cors';
import { HyperliquidAPI } from './hl/api.js';
import { HyperliquidSigner } from './hl/signer.js';
import { startHeartbeat, stopHeartbeat } from './primitives/heartbeat.js';
import { Triggers, scheduleCronTrigger, setBroadcast as setTriggersBroadcast } from './primitives/triggers.js';
import { Permissions, setBroadcast as setPermissionsBroadcast } from './primitives/permissions.js';
import { Playbooks } from './primitives/playbooks.js';
import { Learnings } from './primitives/learnings.js';
import { Skills } from './primitives/skills.js';
import { initTelegram, isTelegramConfigured, sendApprovalMessage, sendExecutionNotification, sendNotification, stopTelegram } from './primitives/telegram.js';
import { runAgent, runReasoningJob } from './agent/agent.js';
import { executeApprovedOrder, testSigner } from './agent/tools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '..', '.env');

// ── .env helpers ──────────────────────────────────────────────────────────────

function readEnv() {
  if (!existsSync(ENV_PATH)) return {};
  const lines = readFileSync(ENV_PATH, 'utf8').split('\n');
  const result = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    result[key] = val;
  }
  return result;
}

function writeEnv(values) {
  // Read existing file to preserve comments
  let content = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const lines = content.split('\n');

  for (const [key, val] of Object.entries(values)) {
    const idx = lines.findIndex(l => l.match(new RegExp(`^\\s*${key}\\s*=`)));
    if (idx >= 0) {
      lines[idx] = `${key}=${val}`;
    } else {
      lines.push(`${key}=${val}`);
    }
  }
  writeFileSync(ENV_PATH, lines.join('\n'), 'utf8');
}

// ── Mutable runtime config ────────────────────────────────────────────────────
// Wrapped in an object so it can be hot-updated without restart.

const runtime = {
  api: null,
  signer: null,
  walletAddress: null,
  vaultAddress: null,
  network: 'mainnet',
};

function applyConfig({ anthropicKey, privateKey, walletAddress, vaultAddress, network }) {
  if (anthropicKey && !anthropicKey.includes('...')) process.env.ANTHROPIC_API_KEY = anthropicKey;

  const net = network || 'mainnet';
  runtime.network = net;

  // Strip placeholder values before using
  const isReal = (v) => v && typeof v === 'string' && !v.includes('...') && v.length > 10;
  runtime.walletAddress = isReal(walletAddress) ? walletAddress : null;
  runtime.vaultAddress  = isReal(vaultAddress)  ? vaultAddress  : null;
  runtime.api           = new HyperliquidAPI(net);

  // Only create signer if private key is a real 32-byte hex key (66 chars: 0x + 64 hex)
  const pkValid = isReal(privateKey) && /^0x[0-9a-fA-F]{64}$/.test(privateKey);
  try {
    runtime.signer = pkValid ? new HyperliquidSigner(privateKey, net) : null;
  } catch(e) {
    console.warn('[config] invalid private key, running in read-only mode:', e.message);
    runtime.signer = null;
  }
}

// ── App factory ───────────────────────────────────────────────────────────────

export async function createApp(config) {
  applyConfig(config);

  // ── Telegram bot ───────────────────────────────────────────────────────────
  function initTelegramBot() {
    const token  = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    initTelegram({
      token, chatId,
      onApprove: async (approvalId) => {
        const approval = await Permissions.approve(approvalId);
        if (!approval) return;
        broadcast({ type: 'approval_resolved', approval });
        try {
          const tx = await executeApprovedOrder(approval, {
            api: runtime.api, signer: runtime.signer, vaultAddress: runtime.vaultAddress,
          });
          await Permissions.recordResult(approval.id, tx);
          broadcast({ type: 'trade_executed', approval, txResult: tx });
          await sendExecutionNotification(approval, tx);
          if (tx?.response?.data?.statuses?.[0]?.filled) {
            const fill = tx.response.data.statuses[0].filled;
            await Learnings.logTrade({
              playbookId: approval.playbook_id,
              coin: approval.coin, side: approval.side,
              size: parseFloat(approval.size), price: parseFloat(fill.avgPx ?? 0),
              fee: parseFloat(fill.totalFee ?? 0), note: approval.reasoning.slice(0, 300),
            });
          }
        } catch (err) {
          broadcast({ type: 'trade_error', approval, error: err.message });
          await sendExecutionNotification(approval, { error: err.message });
        }
      },
      onReject: async (approvalId) => {
        const approval = Permissions.reject(approvalId);
        if (approval) broadcast({ type: 'approval_resolved', approval });
      },
      broadcast,
    });
  }

  initTelegramBot();

  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  app.use(cors());
  app.use(express.json());
  app.use(express.static(join(__dirname, '..', 'public')));

  // ── WebSocket broadcast ────────────────────────────────────────────────────

  function broadcast(data) {
    // Send Telegram notification for new approvals
    if (data.type === 'approval_queued' && isTelegramConfigured()) {
      sendApprovalMessage(data.approval).catch(() => {});
    }
    const msg = JSON.stringify(data);
    for (const ws of wss.clients) {
      if (ws.readyState === 1) ws.send(msg);
    }
  }

  setPermissionsBroadcast(broadcast);
  setTriggersBroadcast(broadcast);

  const sessions = new Map();

  wss.on('connection', (ws) => {
    sessions.set(ws, []);

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === 'chat') {
        const history = sessions.get(ws) ?? [];
        history.push({ role: 'user', content: msg.text });

        try {
          const updated = await runAgent(history, {
            api: runtime.api,
            signer: runtime.signer,
            walletAddress: runtime.walletAddress,
            vaultAddress: runtime.vaultAddress,
            playbookId: msg.playbookId ?? null,
          }, (chunk) => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'agent_chunk', chunk }));
          });
          sessions.set(ws, updated);
        } catch (err) {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', message: err.message }));
        }
      }
    });

    ws.on('close', () => sessions.delete(ws));

    Promise.all([Playbooks.list(), Triggers.list(), Permissions.listPending()]).then(([playbooks, triggers, pendingApprovals]) => {
      ws.send(JSON.stringify({
        type: 'init',
        wallet: runtime.walletAddress,
        network: runtime.network,
        hasSigner: Boolean(runtime.signer),
        hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
        playbooks,
        triggers,
        pendingApprovals,
      }));
    });
  });

  // ── REST API ───────────────────────────────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      wallet: runtime.walletAddress,
      network: runtime.network,
      hasSigner: Boolean(runtime.signer),
    });
  });

  // GET settings — returns current config with masked key previews
  app.get('/api/settings', (_req, res) => {
    const env = readEnv();
    const maskKey = (v) => {
      if (!v || v.includes('...') || v.length < 10) return null;
      return v.slice(0, 8) + '...' + v.slice(-4);
    };
    res.json({
      walletAddress: runtime.walletAddress ?? '',
      vaultAddress:  runtime.vaultAddress  ?? '',
      network:       runtime.network,
      hasSigner:     Boolean(runtime.signer),
      hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
      anthropicKeySet: Boolean(env.ANTHROPIC_API_KEY),
      privateKeySet:   Boolean(env.HL_PRIVATE_KEY),
      // Masked previews for Show button (first 8 + last 4 chars)
      anthropicKeyMasked: maskKey(env.ANTHROPIC_API_KEY),
      privateKeyMasked:   maskKey(env.HL_PRIVATE_KEY),
    });
  });

  // POST settings — update config live + persist to .env
  app.post('/api/settings', (req, res) => {
    const { anthropicKey, privateKey, walletAddress, vaultAddress, network } = req.body;

    // Build what to save (only update non-empty fields)
    const toSave = {};
    if (anthropicKey)  toSave.ANTHROPIC_API_KEY  = anthropicKey;
    if (privateKey)    toSave.HL_PRIVATE_KEY      = privateKey;
    if (walletAddress) toSave.HL_WALLET_ADDRESS   = walletAddress;
    if (vaultAddress)  toSave.HL_VAULT_ADDRESS    = vaultAddress;
    if (network)       toSave.HL_NETWORK          = network;
    if (req.body.telegramToken) toSave.TELEGRAM_BOT_TOKEN = req.body.telegramToken;
    if (req.body.telegramChatId) toSave.TELEGRAM_CHAT_ID  = req.body.telegramChatId;

    try {
      writeEnv(toSave);
    } catch (err) {
      console.warn('[settings] could not write .env:', err.message);
    }

    // Apply in memory immediately
    const current = readEnv();
    applyConfig({
      anthropicKey:  anthropicKey  || current.ANTHROPIC_API_KEY,
      privateKey:    privateKey    || current.HL_PRIVATE_KEY,
      walletAddress: walletAddress || current.HL_WALLET_ADDRESS,
      vaultAddress:  vaultAddress  || current.HL_VAULT_ADDRESS,
      network:       network       || current.HL_NETWORK || 'mainnet',
    });

    // Re-init Telegram if token/chatId changed
    if (req.body.telegramToken || req.body.telegramChatId) {
      stopTelegram();
      setTimeout(initTelegramBot, 500);
    }

    // Notify all clients of updated config
    broadcast({
      type: 'settings_updated',
      wallet: runtime.walletAddress,
      network: runtime.network,
      hasSigner: Boolean(runtime.signer),
      hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    });

    res.json({
      ok: true,
      wallet: runtime.walletAddress,
      network: runtime.network,
      hasSigner: Boolean(runtime.signer),
      hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    });
  });

  // ── Playbooks ──────────────────────────────────────────────────────────────

  // ── Playbook Store ────────────────────────────────────────────────────────
  app.get('/api/playbooks/registry', async (req, res) => {
    const registryUrl = req.query.url ||
      'https://raw.githubusercontent.com/mikeminer/HyperVibe/main/playbooks-registry.json';
    try {
      const r = await fetch(registryUrl, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const installed = (await Playbooks.list()).map(p => p.name);
      data.playbooks = (data.playbooks ?? []).map(p => ({
        ...p,
        installed: installed.includes(p.name),
      }));
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: `Cannot reach registry: ${e.message}` });
    }
  });

  app.post('/api/playbooks/install', async (req, res) => {
    const { url, name, description, allocation, tags } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} fetching playbook from ${url}`);
      const plan = await r.text();
      if (!plan.trim()) throw new Error('Empty playbook file');
      // Extract name from first heading if not provided
      const headingName = plan.match(/^##?\s+(.+?)\s*—/m)?.[1]?.trim();
      const pb = Playbooks.create({
        name:        name || headingName || url.split('/').pop().replace('.md', ''),
        description: description || plan.match(/\*\*Objective:\*\*\s*(.+)/)?.[1]?.trim() || '',
        allocation:  allocation || 0,
        plan,
      });
      broadcast({ type: 'playbook_installed', playbook: pb });
      res.json({ ok: true, playbook: pb });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.post('/api/playbooks/install-raw', async (req, res) => {
    const { plan, name, description, allocation } = req.body;
    if (!plan) return res.status(400).json({ error: 'plan is required' });
    try {
      const headingName = plan.match(/^##?\s+(.+?)\s*—/m)?.[1]?.trim();
      const pb = Playbooks.create({
        name:        name || headingName || 'custom-playbook',
        description: description || plan.match(/\*\*Objective:\*\*\s*(.+)/)?.[1]?.trim() || '',
        allocation:  allocation || 0,
        plan,
      });
      broadcast({ type: 'playbook_installed', playbook: pb });
      res.json({ ok: true, playbook: pb });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/playbooks', async (_req, res) => res.json(await Playbooks.list()));
  app.post('/api/playbooks', (req, res) => res.json(Playbooks.create(req.body)));
  app.get('/api/playbooks/:id', async (req, res) => {
    const pb = await Playbooks.get(req.params.id);
    if (!pb) return res.status(404).json({ error: 'Not found' });
    res.json(pb);
  });
  app.patch('/api/playbooks/:id', async (req, res) => res.json(await Playbooks.update(req.params.id, req.body)));
  app.delete('/api/playbooks/:id', async (req, res) => { await Playbooks.archive(req.params.id); res.json({ ok: true }); });

  // ── Triggers ───────────────────────────────────────────────────────────────
  app.get('/api/triggers', async (req, res) => {
    const { playbookId, status } = req.query;
    res.json(await Triggers.list({ playbookId, status }));
  });
  app.post('/api/triggers', async (req, res) => {
    const trigger = await Triggers.create(req.body);
    if (trigger.conditionMode === 'time') {
      scheduleCronTrigger(trigger, (t) => runReasoningJob(t, {}, {
        api: runtime.api, signer: runtime.signer,
        walletAddress: runtime.walletAddress, vaultAddress: runtime.vaultAddress,
      }, broadcast));
    }
    res.json(trigger);
  });
  app.patch('/api/triggers/:id/pause',  async (req, res) => res.json(await Triggers.pause(req.params.id)));
  app.patch('/api/triggers/:id/resume', async (req, res) => res.json(await Triggers.resume(req.params.id)));
  app.delete('/api/triggers/:id', async (req, res) => { await Triggers.delete(req.params.id); res.json({ ok: true }); });

  // ── Approvals ──────────────────────────────────────────────────────────────
  app.get('/api/approvals',         async (_req, res) => res.json(await Permissions.listAll(100)));
  app.get('/api/approvals/pending', async (_req, res) => res.json(await Permissions.listPending()));

  app.post('/api/approvals/:id/approve', async (req, res) => {
    const approval = await Permissions.approve(req.params.id);
    if (!approval) return res.status(404).json({ error: 'Approval not found or not pending' });

    let txResult;
    try {
      if (!runtime.signer) throw new Error('No signer configured — add HL_PRIVATE_KEY in Settings');
      txResult = await executeApprovedOrder(approval, {
        api: runtime.api, signer: runtime.signer, vaultAddress: runtime.vaultAddress,
      });
      await Permissions.recordResult(approval.id, txResult);

      if (txResult?.response?.data?.statuses?.[0]?.filled) {
        const fill = txResult.response.data.statuses[0].filled;
        Learnings.logTrade({
          playbookId: approval.playbook_id,
          coin: approval.coin,
          side: approval.side,
          size: parseFloat(approval.size),
          price: parseFloat(fill.avgPx ?? 0),
          fee: parseFloat(fill.totalFee ?? 0),
          note: approval.reasoning.slice(0, 300),
        });
      }
      // For exit orders, show what was placed
      if (approval.order_type === 'EXIT_ORDERS' && txResult?.placed) {
        const placed = txResult.placed.map(p => p.type).join(', ');
        const errs   = txResult.errors?.join(', ');
        broadcast({ type: 'trade_executed', approval, txResult,
          message: `Exit orders: ${placed}${errs ? ' | Failed: ' + errs : ''}` });
      } else {
        broadcast({ type: 'trade_executed', approval, txResult });
      }
    } catch (err) {
      txResult = { error: err.message };
      broadcast({ type: 'trade_error', approval, error: err.message });
    }
    res.json({ approval, txResult });
  });

  app.post('/api/approvals/:id/reject', (req, res) => {
    res.json(Permissions.reject(req.params.id));
  });

  // ── Learnings ──────────────────────────────────────────────────────────────
  app.get('/api/learnings/trades', async (req, res) => {
    const { playbookId, coin, limit } = req.query;
    res.json(await Learnings.getTrades({ playbookId, coin, limit: parseInt(limit ?? 50) }));
  });
  app.get('/api/learnings/observations', async (req, res) => {
    res.json(await Learnings.getObservations({ playbookId: req.query.playbookId }));
  });


  // ── Skills ────────────────────────────────────────────────────────────────
  app.get('/api/skills', async (_req, res) => res.json(await Skills.list()));

  app.get('/api/skills/registry', async (req, res) => {
    const registryUrl = req.query.url ||
      'https://raw.githubusercontent.com/mikeminer/HyperVibe/main/skills-registry.json';
    try {
      const r = await fetch(registryUrl, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      // Annotate with installed status
      const installed = (await Skills.list()).map(s => s.name);
      data.skills = (data.skills ?? []).map(s => ({
        ...s,
        installed: installed.includes(s.name),
      }));
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: `Cannot reach registry: ${e.message}` });
    }
  });

  app.post('/api/skills/install', async (req, res) => {
    const { url, name, description, tags } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} fetching skill from ${url}`);
      const content = await r.text();
      if (!content.trim()) throw new Error('Empty skill file');
      // Extract name from frontmatter if not provided
      const fmName = content.match(/^---[\s\S]*?\nname:\s*(.+)\n/)?.[1]?.trim();
      const skill = await Skills.create({
        name:        name || fmName || url.split('/').pop().replace('.md', ''),
        description: description || content.match(/\ndescription:\s*(.+)\n/)?.[1]?.trim() || '',
        tags:        tags || [],
        content:     content.replace(/^---[\s\S]*?---\n/, '').trim(),
      });
      broadcast({ type: 'skill_installed', skill });
      res.json({ ok: true, skill });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.post('/api/skills/install-raw', async (req, res) => {
    // Install from raw markdown text (paste)
    const { content, name, description, tags } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });
    try {
      const fmName = content.match(/^---[\s\S]*?\nname:\s*(.+)\n/)?.[1]?.trim();
      const skill = await Skills.create({
        name:        name || fmName || 'custom-skill',
        description: description || content.match(/\ndescription:\s*(.+)\n/)?.[1]?.trim() || '',
        tags:        tags || [],
        content:     content.replace(/^---[\s\S]*?---\n/, '').trim(),
      });
      broadcast({ type: 'skill_installed', skill });
      res.json({ ok: true, skill });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/skills', async (req, res) => {
    try { res.json(await Skills.create(req.body)); } catch(e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/skills/:id', async (req, res) => {
    const s = await Skills.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json(s);
  });
  app.patch('/api/skills/:id', async (req, res) => {
    try { res.json(await Skills.update(req.params.id, req.body)); } catch(e) { res.status(400).json({ error: e.message }); }
  });
  app.delete('/api/skills/:id', async (req, res) => {
    await Skills.delete(req.params.id);
    res.json({ ok: true });
  });


  app.post('/api/skills/:id/attach', async (req, res) => {
    res.json(await Skills.attachToPlaybook(req.params.id, req.body.playbookId));
  });
  app.post('/api/skills/:id/detach', async (req, res) => {
    res.json(await Skills.detachFromPlaybook(req.params.id, req.body.playbookId));
  });

  // ── Telegram ──────────────────────────────────────────────────────────────
  app.get('/api/telegram/status', (_req, res) => {
    res.json({
      configured: isTelegramConfigured(),
      token: process.env.TELEGRAM_BOT_TOKEN ? '✓ set' : 'not set',
      chatId: process.env.TELEGRAM_CHAT_ID ?? null,
    });
  });
  app.post('/api/telegram/test', async (_req, res) => {
    try {
      await sendNotification('👋 *HyperVibe connected!*\nApproval notifications will appear here.');
      res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── Market proxy ───────────────────────────────────────────────────────────
  app.get('/api/market/mids', async (_req, res) => {
    try { res.json(await runtime.api.getAllMids()); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/market/top-movers', async (_req, res) => {
    try { res.json(await runtime.api.getTopMovers()); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/market/price/:coin', async (req, res) => {
    try { res.json({ coin: req.params.coin, price: await runtime.api.getPrice(req.params.coin) }); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/market/info/:coin', async (req, res) => {
    try { res.json(await runtime.api.getMarketInfo(req.params.coin)); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Account proxy ──────────────────────────────────────────────────────────
  app.get('/api/account/positions', async (_req, res) => {
    if (!runtime.walletAddress) return res.status(400).json({ error: 'No wallet configured' });
    try { res.json(await runtime.api.getPositions(runtime.walletAddress)); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/account/value', async (_req, res) => {
    if (!runtime.walletAddress) return res.status(400).json({ error: 'No wallet configured' });
    try { res.json(await runtime.api.getAccountValue(runtime.walletAddress)); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/account/orders', async (_req, res) => {
    if (!runtime.walletAddress) return res.status(400).json({ error: 'No wallet configured' });
    try { res.json(await runtime.api.getOpenOrders(runtime.walletAddress)); } catch (e) { res.status(500).json({ error: e.message }); }
  });


  // ── Debug / diagnostics ────────────────────────────────────────────────────

  app.post('/api/debug/test-exit', async (req, res) => {
    const { coin = 'HYPE', side = 'LONG', size = '0.01', tp_price, sl_price } = req.body;
    if (!runtime.signer) return res.status(400).json({ error: 'No signer' });
    if (!runtime.walletAddress) return res.status(400).json({ error: 'No wallet' });

    try {
      const assetIndex = await runtime.api.getAssetIndex(coin);
      const asset      = await runtime.api.getAssetInfo(coin);
      const midPx      = await runtime.api.getPrice(coin);
      const isLong     = side === 'LONG';
      const exitIsBuy  = !isLong;

      // Test TP1 limit order
      const testTpPrice = tp_price || (isLong ? midPx * 1.05 : midPx * 0.95);
      const fmt = (sz) => HyperliquidSigner.formatSize(parseFloat(sz), asset.szDecimals);
      const px5 = (p)  => parseFloat(p).toPrecision(5);

      const action = {
        type: 'order',
        orders: [{
          a: assetIndex,
          b: exitIsBuy,
          p: px5(testTpPrice),
          s: fmt(size),
          r: true,
          t: { limit: { tif: 'Gtc' } },
        }],
        grouping: 'na',
      };

      const nonce = Date.now();
      const sig   = await runtime.signer.sign(action, nonce, runtime.vaultAddress ?? null);
      const result = await runtime.api.submitAction(action, nonce, sig, runtime.vaultAddress ?? null);

      res.json({
        ok: !result?.status || result.status !== 'err',
        coin, side, testTpPrice,
        action,
        hyperliquidResponse: result,
      });
    } catch(e) {
      res.status(500).json({ error: e.message, stack: e.stack });
    }
  });

  app.get('/api/debug/test-signer', async (_req, res) => {
    const result = await testSigner(runtime.signer, runtime.api, 'BTC');
    res.json(result);
  });

  app.get('/api/debug/test-connection', async (_req, res) => {
    try {
      const price = await runtime.api.getPrice('BTC');
      const acct  = runtime.walletAddress
        ? await runtime.api.getAccountValue(runtime.walletAddress)
        : null;
      res.json({
        ok: true,
        hyperliquidReachable: true,
        btcPrice: price,
        wallet: runtime.walletAddress,
        hasSigner: Boolean(runtime.signer),
        signerAddress: runtime.signer?.address ?? null,
        accountValue: acct,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Heartbeat ──────────────────────────────────────────────────────────────
  await startHeartbeat({
    api: runtime.api,
    broadcast,
    onHardOrder: async (trigger) => {
      const args = trigger.actionArgs ?? {};
      if (!args.coin) return;
      const approval = await Permissions.queue({
        playbookId: trigger.playbook_id,
        triggerId: trigger.id,
        coin: args.coin, side: args.side, size: args.size,
        orderType: args.order_type ?? 'MARKET', price: args.price ?? null,
        reduceOnly: args.reduce_only ?? false,
        reasoning: `Hard order triggered by: "${trigger.name}"\n${trigger.context || ''}`,
      });
      await Permissions.approve(approval.id);
      try {
        const tx = await executeApprovedOrder(Permissions.get(approval.id), {
          api: runtime.api, signer: runtime.signer, vaultAddress: runtime.vaultAddress,
        });
        await Permissions.recordResult(approval.id, tx);
        broadcast({ type: 'hard_order_executed', trigger, tx });
      } catch (err) {
        broadcast({ type: 'hard_order_error', trigger, error: err.message });
      }
    },
    onReasoningJob: (trigger, snapshot) => runReasoningJob(trigger, snapshot, {
      api: runtime.api, signer: runtime.signer,
      walletAddress: runtime.walletAddress, vaultAddress: runtime.vaultAddress,
    }, broadcast),
  });

  return new Promise((resolve) => {
    httpServer.listen(config.port, () => {
      resolve({ httpServer, app, wss, broadcast });
    });
  });
}
