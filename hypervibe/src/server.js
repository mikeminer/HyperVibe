/**
 * HyperVibe server
 * Express REST API + WebSocket for real-time streaming.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import { HyperliquidAPI } from './hl/api.js';
import { HyperliquidSigner } from './hl/signer.js';
import { startHeartbeat, stopHeartbeat } from './primitives/heartbeat.js';
import { Triggers, scheduleCronTrigger, setBroadcast as setTriggersBroadcast } from './primitives/triggers.js';
import { Permissions, setBroadcast as setPermissionsBroadcast } from './primitives/permissions.js';
import { Playbooks } from './primitives/playbooks.js';
import { Learnings } from './primitives/learnings.js';
import { runAgent, runReasoningJob } from './agent/agent.js';
import { executeApprovedOrder } from './agent/tools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp(config) {
  const { port, anthropicKey, privateKey, walletAddress, vaultAddress, network } = config;

  if (anthropicKey) process.env.ANTHROPIC_API_KEY = anthropicKey;

  // Init services
  const api = new HyperliquidAPI(network);
  const signer = privateKey ? new HyperliquidSigner(privateKey, network) : null;

  const agentContext = { api, signer, walletAddress, vaultAddress };

  // Express app
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  app.use(cors());
  app.use(express.json());
  app.use(express.static(join(__dirname, '..', 'public')));

  // ── WebSocket broadcast ────────────────────────────────────────────────────

  function broadcast(data) {
    const msg = JSON.stringify(data);
    for (const ws of wss.clients) {
      if (ws.readyState === 1 /* OPEN */) ws.send(msg);
    }
  }

  setPermissionsBroadcast(broadcast);
  setTriggersBroadcast(broadcast);

  // Per-session chat history (keyed by ws)
  const sessions = new Map();

  wss.on('connection', (ws) => {
    sessions.set(ws, []);
    console.log('[ws] client connected');

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === 'chat') {
        const history = sessions.get(ws) ?? [];
        history.push({ role: 'user', content: msg.text });

        try {
          const updated = await runAgent(history, {
            ...agentContext,
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

    ws.on('close', () => { sessions.delete(ws); });

    // Send initial state
    ws.send(JSON.stringify({
      type: 'init',
      wallet: walletAddress,
      network,
      playbooks: Playbooks.list(),
      triggers: Triggers.list(),
      pendingApprovals: Permissions.listPending(),
    }));
  });

  // ── REST API ───────────────────────────────────────────────────────────────

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, wallet: walletAddress, network, hasSigner: Boolean(signer) });
  });

  // Settings / wallet check
  app.get('/api/settings', (_req, res) => {
    res.json({
      wallet: walletAddress,
      vaultAddress,
      network,
      hasSigner: Boolean(signer),
      hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    });
  });

  // ── Playbooks ──────────────────────────────────────────────────────────────
  app.get('/api/playbooks', (_req, res) => res.json(Playbooks.list()));
  app.post('/api/playbooks', (req, res) => {
    const pb = Playbooks.create(req.body);
    res.json(pb);
  });
  app.get('/api/playbooks/:id', (req, res) => {
    const pb = Playbooks.get(req.params.id);
    if (!pb) return res.status(404).json({ error: 'Not found' });
    res.json(pb);
  });
  app.patch('/api/playbooks/:id', (req, res) => {
    res.json(Playbooks.update(req.params.id, req.body));
  });
  app.delete('/api/playbooks/:id', (req, res) => {
    Playbooks.archive(req.params.id);
    res.json({ ok: true });
  });

  // ── Triggers ───────────────────────────────────────────────────────────────
  app.get('/api/triggers', (req, res) => {
    const { playbookId, status } = req.query;
    res.json(Triggers.list({ playbookId, status }));
  });
  app.post('/api/triggers', (req, res) => {
    const trigger = Triggers.create(req.body);
    if (trigger.conditionMode === 'time') {
      scheduleCronTrigger(trigger, (t) => runReasoningJob(t, {}, agentContext, broadcast));
    }
    res.json(trigger);
  });
  app.patch('/api/triggers/:id/pause', (req, res) => res.json(Triggers.pause(req.params.id)));
  app.patch('/api/triggers/:id/resume', (req, res) => res.json(Triggers.resume(req.params.id)));
  app.delete('/api/triggers/:id', (req, res) => { Triggers.delete(req.params.id); res.json({ ok: true }); });

  // ── Approvals ──────────────────────────────────────────────────────────────
  app.get('/api/approvals', (_req, res) => res.json(Permissions.listAll(100)));
  app.get('/api/approvals/pending', (_req, res) => res.json(Permissions.listPending()));

  app.post('/api/approvals/:id/approve', async (req, res) => {
    const approval = Permissions.approve(req.params.id);
    if (!approval) return res.status(404).json({ error: 'Approval not found or not pending' });

    // Execute the trade
    let txResult;
    try {
      if (!signer) throw new Error('No signer configured — add HL_PRIVATE_KEY to .env');
      txResult = await executeApprovedOrder(approval, { api, signer, vaultAddress });
      Permissions.recordResult(approval.id, txResult);

      // Log to journal
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

      broadcast({ type: 'trade_executed', approval, txResult });
    } catch (err) {
      txResult = { error: err.message };
      broadcast({ type: 'trade_error', approval, error: err.message });
    }

    res.json({ approval, txResult });
  });

  app.post('/api/approvals/:id/reject', (req, res) => {
    const approval = Permissions.reject(req.params.id);
    res.json(approval);
  });

  // ── Learnings ──────────────────────────────────────────────────────────────
  app.get('/api/learnings/trades', (req, res) => {
    const { playbookId, coin, limit } = req.query;
    res.json(Learnings.getTrades({ playbookId, coin, limit: parseInt(limit ?? 50) }));
  });
  app.get('/api/learnings/observations', (req, res) => {
    const { playbookId } = req.query;
    res.json(Learnings.getObservations({ playbookId }));
  });

  // ── Live market proxy ─────────────────────────────────────────────────────
  app.get('/api/market/mids', async (_req, res) => {
    try { res.json(await api.getAllMids()); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/market/top-movers', async (_req, res) => {
    try { res.json(await api.getTopMovers()); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/market/price/:coin', async (req, res) => {
    try { res.json({ coin: req.params.coin, price: await api.getPrice(req.params.coin) }); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/market/info/:coin', async (req, res) => {
    try { res.json(await api.getMarketInfo(req.params.coin)); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Account proxy ──────────────────────────────────────────────────────────
  app.get('/api/account/positions', async (_req, res) => {
    if (!walletAddress) return res.status(400).json({ error: 'No wallet configured' });
    try { res.json(await api.getPositions(walletAddress)); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/account/value', async (_req, res) => {
    if (!walletAddress) return res.status(400).json({ error: 'No wallet configured' });
    try { res.json(await api.getAccountValue(walletAddress)); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/account/orders', async (_req, res) => {
    if (!walletAddress) return res.status(400).json({ error: 'No wallet configured' });
    try { res.json(await api.getOpenOrders(walletAddress)); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  startHeartbeat({
    api,
    broadcast,
    onHardOrder: async (trigger) => {
      const args = trigger.actionArgs ?? {};
      if (!args.coin) return;
      const approval = Permissions.queue({
        playbookId: trigger.playbook_id,
        triggerId: trigger.id,
        coin: args.coin,
        side: args.side,
        size: args.size,
        orderType: args.order_type ?? 'MARKET',
        price: args.price ?? null,
        reduceOnly: args.reduce_only ?? false,
        reasoning: `Hard order triggered by: "${trigger.name}"\n${trigger.context || ''}`,
      });
      // Auto-approve hard orders (they were pre-authorised at trigger creation)
      Permissions.approve(approval.id);
      try {
        const tx = await executeApprovedOrder(Permissions.get(approval.id), { api, signer, vaultAddress });
        Permissions.recordResult(approval.id, tx);
        broadcast({ type: 'hard_order_executed', trigger, tx });
      } catch (err) {
        broadcast({ type: 'hard_order_error', trigger, error: err.message });
      }
    },
    onReasoningJob: (trigger, snapshot) => runReasoningJob(trigger, snapshot, agentContext, broadcast),
  });

  // ── Start listening ────────────────────────────────────────────────────────

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      resolve({ httpServer, app, wss, broadcast });
    });
  });
}
