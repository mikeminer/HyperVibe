/**
 * HyperVibe — tools for Claude
 * Read tools: no approval. Write tools: approval gate.
 */

import { HyperliquidSigner } from '../hl/signer.js';
import { Permissions } from '../primitives/permissions.js';
import { Playbooks } from '../primitives/playbooks.js';
import { Triggers, scheduleCronTrigger } from '../primitives/triggers.js';
import { Learnings } from '../primitives/learnings.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename_tools  = fileURLToPath(import.meta.url);
const __dirname_tools   = path.dirname(__filename_tools);
const AUTOTRADE_BRIDGE  = path.join(__dirname_tools, '..', '..', 'tools', 'autotrade', 'autotrade-bridge.js');
const SIGNALS_DIR       = path.join(__dirname_tools, '..', '..', 'playbooks', 'signals');

// ── Hyperliquid onchain helpers ───────────────────────────────────────────────

const HL_RPC          = 'https://rpc.hyperliquid.xyz/evm';
const HL_API          = 'https://api.hyperliquid.xyz/info';
const ASSISTANCE_FUND = '0xfefefefefefefefefefefefefefefefefefefefe';

async function hlRpc(method, params) {
  const res = await fetch(HL_RPC, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  return data.result;
}

async function hlPost(body) {
  const res = await fetch(HL_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return res.json();
}

// ── toolGetHypeFees ───────────────────────────────────────────────────────────

async function toolGetHypeFees({ minutes = 30 } = {}) {
  const currentBlockHex = await hlRpc('eth_blockNumber', []);
  const currentBlock    = parseInt(currentBlockHex, 16);
  const blocksBack      = Math.floor((minutes * 60) / 2);
  const startBlock      = Math.max(0, currentBlock - blocksBack);

  const [meta, mids, balNow, balThen] = await Promise.all([
    hlPost({ type: 'metaAndAssetCtxs' }),
    hlPost({ type: 'allMids' }),
    hlRpc('eth_getBalance', [ASSISTANCE_FUND, '0x' + currentBlock.toString(16)]),
    hlRpc('eth_getBalance', [ASSISTANCE_FUND, '0x' + startBlock.toString(16)]),
  ]);

  const universe   = meta[0]?.universe ?? [];
  const ctxs       = meta[1] ?? [];
  const hype_price = parseFloat(mids['HYPE'] || 0);
  const hype_idx   = universe.findIndex(u => u.name === 'HYPE');
  const hype_ctx   = hype_idx >= 0 ? ctxs[hype_idx] : {};

  let total_24h_vlm = 0;
  let hype_24h_vlm  = 0;
  for (let i = 0; i < universe.length; i++) {
    const vlm = parseFloat(ctxs[i]?.dayNtlVlm ?? 0);
    total_24h_vlm += vlm;
    if (universe[i].name === 'HYPE') hype_24h_vlm = vlm;
  }

  const window_fraction   = minutes / (24 * 60);
  const vlm_window        = total_24h_vlm * window_fraction;
  const FEE_RATE          = 0.00025;
  const FUND_SHARE        = 0.40;
  const usdc_inflow       = vlm_window * FEE_RATE * FUND_SHARE;
  const fee_rate_per_hour = (total_24h_vlm * FEE_RATE * FUND_SHARE) / 24;
  const hype_bought_est   = hype_price > 0 ? (usdc_inflow / hype_price) * 0.85 : 0;
  const hype_burned_est   = hype_bought_est * 0.80;

  const balNowHype          = parseInt(balNow,  16) / 1e18;
  const balThenHype         = parseInt(balThen, 16) / 1e18;
  const hype_delta          = balNowHype - balThenHype;
  const hype_burned_onchain = hype_delta < 0 ? Math.abs(hype_delta) : 0;
  const hype_accumulated    = hype_delta > 0 ? hype_delta : 0;

  const hype_burned = hype_burned_onchain > 0 ? hype_burned_onchain : hype_burned_est;
  const hype_bought = hype_burned_onchain > 0 ? hype_burned_onchain / 0.80 : hype_bought_est;

  const burn_signal_strength = hype_burned_est > 0
    ? Math.min(hype_burned / hype_burned_est, 5)
    : 0;

  return {
    ok:                    true,
    period_minutes:        minutes,
    block_start:           startBlock,
    block_end:             currentBlock,
    total_24h_volume:      Math.round(total_24h_vlm),
    hype_24h_volume:       Math.round(hype_24h_vlm),
    volume_in_window:      Math.round(vlm_window),
    usdc_inflow:           parseFloat(usdc_inflow.toFixed(2)),
    fee_rate_per_hour:     parseFloat(fee_rate_per_hour.toFixed(2)),
    hype_balance_now:      parseFloat(balNowHype.toFixed(6)),
    hype_balance_then:     parseFloat(balThenHype.toFixed(6)),
    hype_delta:            parseFloat(hype_delta.toFixed(6)),
    hype_burned_onchain:   parseFloat(hype_burned_onchain.toFixed(6)),
    hype_accumulated:      parseFloat(hype_accumulated.toFixed(6)),
    hype_burned:           parseFloat(hype_burned.toFixed(6)),
    hype_bought:           parseFloat(hype_bought.toFixed(6)),
    burn_signal_strength:  parseFloat(burn_signal_strength.toFixed(3)),
    hype_price,
    hype_oi:               parseFloat(hype_ctx.openInterest ?? 0),
    hype_funding:          parseFloat(hype_ctx.funding ?? 0),
    hype_mark_px:          parseFloat(hype_ctx.markPx ?? 0),
    low_activity:          total_24h_vlm < 10_000_000,
    burn_source:           hype_burned_onchain > 0 ? 'onchain_balance_delta' : 'volume_estimate',
  };
}

// ── toolGetHypeOrderbook ──────────────────────────────────────────────────────

async function toolGetHypeOrderbook({ coin = 'HYPE', depth_pct = 5 } = {}) {
  const data = await hlPost({ type: 'l2Book', coin });

  if (!data.levels?.[0] || !data.levels?.[1]) {
    const meta = await hlPost({ type: 'metaAndAssetCtxs' });
    const idx  = (meta[0]?.universe ?? []).findIndex(u => u.name === coin);
    const mid  = idx >= 0 ? parseFloat(meta[1]?.[idx]?.markPx || 0) : 0;
    return { ok: true, coin, mid_price: mid, book_imbalance: null, imbalance_label: 'unavailable', partial: true };
  }

  const bids = Array.isArray(data.levels[0]) ? data.levels[0] : [];
  const asks = Array.isArray(data.levels[1]) ? data.levels[1] : [];

  if (!bids.length || !asks.length) {
    return { ok: false, error: 'Empty bid or ask array in l2Book response' };
  }

  const best_bid   = parseFloat(bids[0]?.px ?? 0);
  const best_ask   = parseFloat(asks[0]?.px ?? 0);
  const mid        = (best_bid + best_ask) / 2;
  const spread_bps = mid > 0 ? ((best_ask - best_bid) / mid * 10000).toFixed(2) : '0';

  const bid_depth = bids
    .filter(l => parseFloat(l.px) >= mid * (1 - depth_pct / 100))
    .reduce((s, l) => s + parseFloat(l.sz), 0);
  const ask_depth = asks
    .filter(l => parseFloat(l.px) <= mid * (1 + depth_pct / 100))
    .reduce((s, l) => s + parseFloat(l.sz), 0);

  const total          = bid_depth + ask_depth;
  const book_imbalance = total > 0 ? parseFloat(((bid_depth - ask_depth) / total).toFixed(4)) : 0;

  return {
    ok: true, coin,
    mid_price:       mid,
    best_bid,
    best_ask,
    spread_bps,
    bid_depth:       parseFloat(bid_depth.toFixed(2)),
    ask_depth:       parseFloat(ask_depth.toFixed(2)),
    book_imbalance,
    imbalance_label: book_imbalance > 0.15 ? 'bid-heavy' : book_imbalance < -0.15 ? 'ask-heavy' : 'neutral',
  };
}

// ── toolGetHypeSignal ─────────────────────────────────────────────────────────

async function toolGetHypeSignal({ minutes = 30 } = {}) {
  const [fees, book] = await Promise.all([
    toolGetHypeFees({ minutes }),
    toolGetHypeOrderbook({ coin: 'HYPE' }),
  ]);

  const imbalance = book.ok ? book.book_imbalance : null;

  let signal = 'NEUTRAL';
  if (fees.burn_signal_strength > 2) {
    signal = 'BURN_SPIKE';
  } else if (!fees.low_activity) {
    if      (imbalance !== null && imbalance > 0.15)  signal = 'BOUNCE_HIGH';
    else if (imbalance !== null && imbalance > 0.05)  signal = 'BOUNCE_MED';
    else if (imbalance !== null && imbalance < -0.15) signal = 'FEE_DROP';
  }
  if (signal === 'BOUNCE_MED' && fees.burn_signal_strength > 1.5) signal = 'BOUNCE_HIGH';

  const CIRCULATING = 333_000_000;
  const ELASTICITY  = 2.5;
  const supply_1h   = fees.hype_price > 0 && fees.hype_burned > 0
    ? (fees.hype_burned * (60 / minutes)) / CIRCULATING * 100
    : 0;

  return {
    ok: true,
    signal,
    fees,
    book:            book.ok ? book : null,
    price_estimates: {
      current:                 fees.hype_price,
      t1h:                     parseFloat((fees.hype_price * (1 + supply_1h * ELASTICITY)).toFixed(4)),
      t4h:                     parseFloat((fees.hype_price * (1 + supply_1h * 4 * ELASTICITY)).toFixed(4)),
      t24h:                    parseFloat((fees.hype_price * (1 + supply_1h * 24 * ELASTICITY)).toFixed(4)),
      supply_reduction_pct_1h: supply_1h.toFixed(6),
      elasticity_coeff:        ELASTICITY,
    },
  };
}

// ── toolRunAutotradeResearch ──────────────────────────────────────────────────

async function toolRunAutotradeResearch({ coin = 'HYPE', timeframe = '1h', iterations = 20, min_pf = 1.2, max_drawdown = -25, max_leverage = 3 } = {}) {
  const { mkdir } = await import('fs/promises');
  const { createWriteStream } = await import('fs');

  await mkdir(SIGNALS_DIR, { recursive: true }).catch(() => {});

  const args = [
    AUTOTRADE_BRIDGE, 'run',
    '--coin',         coin,
    '--timeframe',    timeframe,
    '--iterations',   String(iterations),
    '--min-pf',       String(min_pf),
    '--max-drawdown', String(max_drawdown),
    '--max-leverage', String(max_leverage),
    '--out',          SIGNALS_DIR,
  ];

  const logFile   = path.join(SIGNALS_DIR, `run_${coin.toLowerCase()}_${Date.now()}.log`);
  const logStream = createWriteStream(logFile, { flags: 'a' });

  const child = spawn('node', args, {
    shell:    true,
    detached: true,
    stdio:    ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  child.unref();

  const estimatedMinutes = Math.round(20 + iterations * 1.5);

  return {
    status:            'started',
    coin,
    symbol:            `${coin.toUpperCase()}/USDC:USDC`,
    timeframe,
    iterations,
    pid:               child.pid,
    log_file:          logFile,
    signals_dir:       SIGNALS_DIR,
    estimated_minutes: estimatedMinutes,
    message:           `Ricerca avviata su ${coin} (${timeframe}, ${iterations} iterazioni). Tempo stimato: ~${estimatedMinutes} minuti. Quando completa, chiama load_autotrade_signal per vedere il risultato.`,
  };
}

// ── toolLoadAutotradeSignal ───────────────────────────────────────────────────

async function toolLoadAutotradeSignal({ coin = null } = {}) {
  const { readdirSync, readFileSync, existsSync, statSync } = await import('fs');

  if (!existsSync(SIGNALS_DIR)) {
    return { ok: false, error: `Cartella signals non trovata: ${SIGNALS_DIR}. Avvia prima run_autotrade_research.` };
  }

  const files = readdirSync(SIGNALS_DIR)
    .filter(f => f.endsWith('.json') && f.startsWith('signal_') && (!coin || f.includes(coin.toLowerCase())))
    .map(f => ({ file: f, mtime: statSync(path.join(SIGNALS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    return { ok: false, error: `Nessun signal trovato${coin ? ` per ${coin}` : ''}. Avvia prima run_autotrade_research.` };
  }

  const signalPath = path.join(SIGNALS_DIR, files[0].file);
  const signal     = JSON.parse(readFileSync(signalPath, 'utf-8'));

  return {
    ok:               true,
    signal_file:      files[0].file,
    signal_path:      signalPath,
    coin:             signal.coin,
    timeframe:        signal.timeframe,
    ready_for_live:   signal.ready_for_live,
    composite_score:  signal.composite_score,
    backtest_metrics: signal.backtest_metrics,
    risk:             signal.signal_params?.risk,
    warnings:         signal.warnings ?? [],
    generated_at:     signal.generated_at,
    message:          signal.ready_for_live
      ? `Strategia pronta: PF=${signal.backtest_metrics?.profit_factor}, DD=${signal.backtest_metrics?.max_drawdown_pct}%. Puoi proporre il trade con place_order.`
      : `Strategia non pronta per il live. Warnings: ${(signal.warnings ?? []).join('; ')}`,
  };
}

// ── Tool definitions ──────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: 'get_price',
    description: 'Get current mid price for one or more Hyperliquid perpetual coins.',
    input_schema: { type: 'object', properties: { coins: { type: 'array', items: { type: 'string' } } }, required: ['coins'] },
  },
  {
    name: 'get_all_mids',
    description: 'Get current mid prices for all perpetual markets.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_positions',
    description: 'Get all open perpetual positions with unrealized PnL, entry price, mark price, leverage.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_account_value',
    description: 'Get account equity, margin used, withdrawable balance. Returns spot+perp for Unified Account.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_open_orders',
    description: 'Get all pending open orders (limit orders awaiting fill).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_fills',
    description: 'Get recent trade history (fills) for the account.',
    input_schema: { type: 'object', properties: { days: { type: 'number' } } },
  },
  {
    name: 'get_funding_payments',
    description: 'Get recent funding payments received or paid.',
    input_schema: { type: 'object', properties: { days: { type: 'number' } } },
  },
  {
    name: 'get_candles',
    description: 'Get OHLCV candlestick data for a coin.',
    input_schema: {
      type: 'object',
      properties: {
        coin:     { type: 'string' },
        interval: { type: 'string', enum: ['1m','5m','15m','30m','1h','4h','1d'] },
        lookback: { type: 'number' },
      },
      required: ['coin'],
    },
  },
  {
    name: 'compute_indicators',
    description: 'Compute technical indicators (RSI, MACD, EMA, SMA, Bollinger Bands, ATR) from live OHLCV.',
    input_schema: {
      type: 'object',
      properties: {
        coin:       { type: 'string' },
        interval:   { type: 'string', enum: ['1m','5m','15m','30m','1h','4h','1d'] },
        indicators: { type: 'array', items: { type: 'string', enum: ['RSI','MACD','EMA_9','EMA_21','SMA_50','SMA_200','BB','ATR'] } },
      },
      required: ['coin','indicators'],
    },
  },
  {
    name: 'get_funding_rate',
    description: 'Get current and predicted funding rate + open interest for a coin.',
    input_schema: { type: 'object', properties: { coin: { type: 'string' } }, required: ['coin'] },
  },
  {
    name: 'get_orderbook',
    description: 'Get L2 order book (bids and asks) for a coin.',
    input_schema: { type: 'object', properties: { coin: { type: 'string' }, levels: { type: 'number' } }, required: ['coin'] },
  },
  {
    name: 'get_market_info',
    description: 'Get market info: max leverage, size decimals, 24h volume, open interest.',
    input_schema: { type: 'object', properties: { coin: { type: 'string' } }, required: ['coin'] },
  },
  {
    name: 'get_top_movers',
    description: 'Get top gaining and losing perpetual markets by 24h price change.',
    input_schema: { type: 'object', properties: { n: { type: 'number' } } },
  },
  {
    name: 'search_coins',
    description: 'Search for perpetual markets on Hyperliquid by name or symbol.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'get_vault_details',
    description: 'Get details about a Hyperliquid vault (TVL, leader, performance).',
    input_schema: { type: 'object', properties: { vault_address: { type: 'string' } }, required: ['vault_address'] },
  },
  // ── Onchain fee tools ─────────────────────────────────────────────────────
  {
    name: 'get_hype_fees',
    description: 'Fetch HYPE fee data combining two sources: (1) volume-based USDC inflow estimate from protocol dayNtlVlm, (2) real onchain HYPE balance delta of the Assistance Fund via eth_getBalance at two blocks. Returns usdc_inflow, hype_burned, hype_delta, burn_signal_strength, fee_rate_per_hour, burn_source. Always call this — never estimate manually.',
    input_schema: {
      type: 'object',
      properties: {
        minutes: { type: 'number', description: 'Lookback period in minutes (default 30)' },
      },
    },
  },
  {
    name: 'get_hype_orderbook',
    description: 'Fetch live L2 order book for a Hyperliquid perpetual. Returns mid_price, spread_bps, bid_depth, ask_depth, book_imbalance (-1 to +1), imbalance_label (bid-heavy/ask-heavy/neutral).',
    input_schema: {
      type: 'object',
      properties: {
        coin:      { type: 'string', description: 'Coin name (default: HYPE)' },
        depth_pct: { type: 'number', description: 'Depth range as % from mid (default 5)' },
      },
    },
  },
  {
    name: 'get_hype_signal',
    description: 'Run the full HYPE fee monitor cycle: onchain fees + live orderbook + signal classification (BOUNCE_HIGH / BOUNCE_MED / NEUTRAL / FEE_DROP / BURN_SPIKE) + price estimates at T+1h T+4h T+24h. Use every 30 minutes. If any field shows UNAVAILABLE, you failed to call this tool.',
    input_schema: {
      type: 'object',
      properties: {
        minutes: { type: 'number', description: 'Fee lookback period in minutes (default 30)' },
      },
    },
  },
  // ── Autotrade Strategy Research ───────────────────────────────────────────
  {
    name: 'run_autotrade_research',
    description: 'Avvia una ricerca autonoma di strategie di trading tramite backtesting LLM (autotrade). Claude Code itera su strategie, le backtesta su dati Hyperliquid reali e seleziona la migliore. Il processo gira in background — chiama load_autotrade_signal quando completa per vedere il risultato.',
    input_schema: {
      type: 'object',
      properties: {
        coin:         { type: 'string',  description: 'Ticker del perpetual su Hyperliquid (es. BTC, ETH, SOL, HYPE)' },
        timeframe:    { type: 'string',  enum: ['15m','1h','4h','1d'], description: 'Timeframe candele (default: 1h)' },
        iterations:   { type: 'number', description: 'Numero iterazioni LLM (default: 20, max consigliato: 50)' },
        min_pf:       { type: 'number', description: 'Profit factor minimo (default: 1.2)' },
        max_drawdown: { type: 'number', description: 'Drawdown massimo % negativo (default: -25)' },
        max_leverage: { type: 'number', description: 'Leva massima (default: 3)' },
      },
    },
  },
  {
    name: 'load_autotrade_signal',
    description: 'Carica il signal JSON più recente generato da autotrade. Contiene la migliore strategia trovata con metriche di backtest (profit factor, drawdown, sharpe, win rate) e parametri di rischio (SL, TP, leverage, size). Chiama questo tool dopo run_autotrade_research.',
    input_schema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Filtra per coin (opzionale)' },
      },
    },
  },
  // ── Write tools ───────────────────────────────────────────────────────────
  {
    name: 'place_order',
    description: 'Queue a trade for approval. Not executed until user approves.',
    input_schema: {
      type: 'object',
      properties: {
        coin:        { type: 'string' },
        side:        { type: 'string', enum: ['BUY','SELL'] },
        size:        { type: 'number', description: 'Size in coin units' },
        order_type:  { type: 'string', enum: ['MARKET','LIMIT'], default: 'MARKET' },
        price:       { type: 'number' },
        reduce_only: { type: 'boolean', default: false },
        reasoning:   { type: 'string' },
        playbook_id: { type: 'string' },
      },
      required: ['coin','side','size','reasoning'],
    },
  },
  {
    name: 'place_exit_orders',
    description: 'Place native TP limit orders on Hyperliquid + SL as HyperVibe trigger. ALWAYS call after opening a position. Hyperliquid minimum order = $11. TPs below $11 are automatically merged.',
    input_schema: {
      type: 'object',
      properties: {
        coin:            { type: 'string' },
        position_side:   { type: 'string', enum: ['LONG','SHORT'] },
        total_size:      { type: 'number' },
        stop_loss_price: { type: 'number' },
        tp1_price:       { type: 'number' },
        tp1_size:        { type: 'number' },
        tp2_price:       { type: 'number' },
        tp2_size:        { type: 'number' },
        tp3_price:       { type: 'number' },
        tp3_size:        { type: 'number' },
        reasoning:       { type: 'string' },
      },
      required: ['coin','position_side','total_size','stop_loss_price','tp1_price','tp1_size','reasoning'],
    },
  },
  {
    name: 'cancel_order',
    description: 'Cancel a pending open order by order ID.',
    input_schema: {
      type: 'object',
      properties: {
        coin:      { type: 'string' },
        order_id:  { type: 'number' },
        reasoning: { type: 'string' },
      },
      required: ['coin','order_id','reasoning'],
    },
  },
  {
    name: 'set_leverage',
    description: 'Set leverage for a coin.',
    input_schema: {
      type: 'object',
      properties: {
        coin:      { type: 'string' },
        leverage:  { type: 'number', minimum: 1, maximum: 50 },
        cross:     { type: 'boolean', default: true },
        reasoning: { type: 'string' },
      },
      required: ['coin','leverage','reasoning'],
    },
  },
  {
    name: 'create_trigger',
    description: 'Create a Heartbeat trigger — condition + action evaluated every 30s.',
    input_schema: {
      type: 'object',
      properties: {
        name:           { type: 'string' },
        playbook_id:    { type: 'string' },
        watch_coins:    { type: 'array', items: { type: 'string' } },
        condition_mode: { type: 'string', enum: ['code','time','llm'] },
        condition_expr: { type: 'string' },
        action_type:    { type: 'string', enum: ['hard_order','reasoning_job'] },
        action_args:    { type: 'object' },
        context:        { type: 'string' },
        expires_at:     { type: 'number' },
      },
      required: ['name','condition_mode','condition_expr','action_type'],
    },
  },
  {
    name: 'create_playbook',
    description: 'Create a new trading playbook.',
    input_schema: {
      type: 'object',
      properties: {
        name:        { type: 'string' },
        description: { type: 'string' },
        allocation:  { type: 'number' },
        plan:        { type: 'string' },
      },
      required: ['name','plan'],
    },
  },
  {
    name: 'add_observation',
    description: 'Log an observation to the trade journal.',
    input_schema: {
      type: 'object',
      properties: {
        content:     { type: 'string' },
        playbook_id: { type: 'string' },
        tags:        { type: 'array', items: { type: 'string' } },
      },
      required: ['content'],
    },
  },
];

// ── Tool handler ──────────────────────────────────────────────────────────────

export async function handleTool(name, input, { api, signer, walletAddress, vaultAddress, playbookContext }) {
  switch (name) {
    case 'get_price':            return api.getPrices(input.coins);
    case 'get_all_mids':         return api.getAllMids();
    case 'get_positions':        return api.getPositions(walletAddress);
    case 'get_account_value':    return api.getAccountValue(walletAddress);
    case 'get_open_orders':      return api.getOpenOrders(walletAddress);
    case 'get_fills':            return api.getFills(walletAddress, Date.now() - (input.days ?? 7) * 86_400_000);
    case 'get_funding_payments': return api.getFundingPayments(walletAddress, Date.now() - (input.days ?? 7) * 86_400_000);
    case 'get_candles':          return api.getCandles(input.coin, input.interval ?? '1h', input.lookback ?? 100);
    case 'compute_indicators': {
      const candles = await api.getCandles(input.coin, input.interval ?? '1h', 200);
      return computeIndicators(candles, input.indicators);
    }
    case 'get_funding_rate':    return api.getFundingRate(input.coin);
    case 'get_orderbook':       return api.getOrderbook(input.coin, input.levels ?? 10);
    case 'get_market_info':     return api.getMarketInfo(input.coin);
    case 'get_top_movers':      return api.getTopMovers(input.n ?? 10);
    case 'search_coins':        return api.searchCoins(input.query);
    case 'get_vault_details':   return api.getVaultDetails(input.vault_address);

    // ── Onchain fee tools ───────────────────────────────────────────────────
    case 'get_hype_fees':       return toolGetHypeFees(input);
    case 'get_hype_orderbook':  return toolGetHypeOrderbook(input);
    case 'get_hype_signal':     return toolGetHypeSignal(input);

    // ── Autotrade Strategy Research ─────────────────────────────────────────
    case 'run_autotrade_research': return toolRunAutotradeResearch(input);
    case 'load_autotrade_signal':  return toolLoadAutotradeSignal(input);

    // ── Write tools ─────────────────────────────────────────────────────────
    case 'place_order': {
      const approval = Permissions.queue({
        playbookId:  input.playbook_id ?? playbookContext?.id ?? null,
        coin:        input.coin,
        side:        input.side,
        size:        input.size,
        orderType:   input.order_type ?? 'MARKET',
        price:       input.price ?? null,
        reduceOnly:  input.reduce_only ?? false,
        reasoning:   input.reasoning,
      });
      return { queued: true, approval_id: approval.id, message: `Trade queued — ${input.side} ${input.size} ${input.coin}. Awaiting approval.` };
    }

    case 'place_exit_orders': {
      const approval = Permissions.queue({
        playbookId:  playbookContext?.id ?? null,
        coin:        input.coin,
        side:        'EXIT_ORDERS',
        size:        String(input.total_size),
        orderType:   'EXIT_ORDERS',
        reasoning:
          `Exit orders for ${input.position_side} ${input.total_size} ${input.coin}\n` +
          `SL: $${input.stop_loss_price} | TP1: $${input.tp1_price} (${input.tp1_size})` +
          (input.tp2_price ? ` | TP2: $${input.tp2_price} (${input.tp2_size})` : '') +
          (input.tp3_price ? ` | TP3: $${input.tp3_price} (${input.tp3_size})` : '') +
          `\n\n${input.reasoning}`,
        price: JSON.stringify(input),
      });
      return {
        queued: true, approval_id: approval.id,
        message: `Exit orders queued — SL $${input.stop_loss_price}, TP1 $${input.tp1_price}${input.tp2_price ? `, TP2 $${input.tp2_price}` : ''}. TPs below $11 will be merged automatically.`,
      };
    }

    case 'cancel_order': {
      const approval = Permissions.queue({
        coin: input.coin, side: 'CANCEL', size: String(input.order_id),
        orderType: 'CANCEL', reasoning: input.reasoning,
      });
      return { queued: true, approval_id: approval.id };
    }

    case 'set_leverage': {
      const approval = Permissions.queue({
        coin: input.coin, side: 'SET_LEVERAGE', size: String(input.leverage),
        orderType: 'SET_LEVERAGE', reasoning: input.reasoning,
      });
      return { queued: true, approval_id: approval.id };
    }

    case 'create_trigger': {
      const trigger = Triggers.create({
        name:          input.name,
        playbookId:    input.playbook_id ?? null,
        watchCoins:    input.watch_coins ?? [],
        conditionMode: input.condition_mode,
        conditionExpr: input.condition_expr,
        actionType:    input.action_type,
        actionArgs:    input.action_args ?? {},
        context:       input.context ?? '',
        expiresAt:     input.expires_at ?? null,
      });
      if (trigger.conditionMode === 'time') scheduleCronTrigger(trigger, () => {});
      return { created: true, trigger };
    }

    case 'create_playbook': {
      const pb = Playbooks.create({
        name: input.name, description: input.description ?? '',
        allocation: input.allocation ?? 0, plan: input.plan,
      });
      return { created: true, playbook: pb };
    }

    case 'add_observation': {
      const id = Learnings.addObservation({
        playbookId: input.playbook_id ?? null,
        content:    input.content,
        tags:       input.tags ?? [],
      });
      return { logged: true, id };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Execute approved order ────────────────────────────────────────────────────

export async function executeApprovedOrder(approval, { api, signer, vaultAddress }) {
  if (!signer) throw new Error('No signer — add HL_PRIVATE_KEY in Settings');

  // ── Exit orders ─────────────────────────────────────────────────────────
  if (approval.order_type === 'EXIT_ORDERS') {
    const params = JSON.parse(approval.price);
    const { coin, position_side, total_size, stop_loss_price, tp1_price, tp1_size, tp2_price, tp2_size, tp3_price, tp3_size } = params;

    const assetIndex = await api.getAssetIndex(coin);
    const asset      = await api.getAssetInfo(coin);
    const isLong     = position_side === 'LONG';
    const exitIsBuy  = !isLong;
    const fmt        = (sz) => HyperliquidSigner.formatSize(parseFloat(sz), asset.szDecimals);
    const px5        = (p) => {
      const s = parseFloat(p).toPrecision(5);
      return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
    };

    console.log(`[exit] ${position_side} ${total_size} ${coin} | SL:$${stop_loss_price} TP1:$${tp1_price}`);

    const results = [];
    const errors  = [];

    const submitLimit = async (price, size, label) => {
      await new Promise(r => setTimeout(r, 80));
      const payload = await signer.buildOrderAction({
        assetIndex, isBuy: exitIsBuy,
        price: px5(price), size: fmt(size),
        reduceOnly: true, tif: 'Gtc',
        vaultAddress: vaultAddress ?? null,
      });
      const res = await api.submitAction(payload.action, payload.nonce, payload.signature, payload.vaultAddress);
      console.log(`[exit] ${label} response:`, JSON.stringify(res));
      if (res?.status === 'err') throw new Error(String(res.response));
      const statusErr = res?.response?.data?.statuses?.[0]?.error;
      if (statusErr) throw new Error(statusErr);
      return res;
    };

    const MIN_NOTIONAL = 11.5;
    const tpCandidates = [
      tp1_price && tp1_size ? { price: parseFloat(tp1_price), size: parseFloat(tp1_size), label: 'TP1' } : null,
      tp2_price && tp2_size ? { price: parseFloat(tp2_price), size: parseFloat(tp2_size), label: 'TP2' } : null,
      tp3_price && tp3_size ? { price: parseFloat(tp3_price), size: parseFloat(tp3_size), label: 'TP3' } : null,
    ].filter(Boolean);

    const tpOrders = [];
    let acc = null;
    for (const tp of tpCandidates) {
      acc = acc
        ? { price: tp.price, size: acc.size + tp.size, label: acc.label + '+' + tp.label }
        : { ...tp };
      if (acc.size * acc.price >= MIN_NOTIONAL) { tpOrders.push({ ...acc }); acc = null; }
    }
    if (acc) {
      if (tpOrders.length > 0) { tpOrders.at(-1).size += acc.size; tpOrders.at(-1).label += '+' + acc.label; }
      else tpOrders.push(acc);
    }

    console.log(`[exit] After merge: ${tpOrders.map(t => t.label + '×' + t.size.toFixed(2) + '@$' + t.price).join(', ')}`);

    for (const tp of tpOrders) {
      try {
        const r   = await submitLimit(tp.price, tp.size, tp.label);
        const oid = r?.response?.data?.statuses?.[0]?.resting?.oid;
        results.push({ type: tp.label, price: tp.price, oid });
      } catch(e) {
        errors.push(`${tp.label}: ${e.message}`);
        console.error(`[exit] ${tp.label} failed:`, e.message);
      }
    }

    try {
      const slExpr = isLong
        ? `prices["${coin}"] <= ${stop_loss_price}`
        : `prices["${coin}"] >= ${stop_loss_price}`;
      Triggers.create({
        name:       `SL ${coin} @ $${stop_loss_price}`,
        watchCoins: [coin], conditionMode: 'code', conditionExpr: slExpr,
        actionType: 'hard_order',
        actionArgs: { coin, side: exitIsBuy ? 'BUY' : 'SELL', size: fmt(total_size), order_type: 'MARKET', reduce_only: true },
        context:    `Auto SL: ${position_side} ${total_size} ${coin}. Market order when price hits $${stop_loss_price}.`,
        expiresAt:  Date.now() + 30 * 24 * 60 * 60 * 1000,
      });
      results.push({ type: 'SL', price: stop_loss_price, mode: 'HyperVibe 30s' });
    } catch(e) {
      errors.push(`SL: ${e.message}`);
      console.error('[exit] SL trigger failed:', e.message);
    }

    if (results.length === 0) throw new Error(`All exit orders failed:\n${errors.join('\n')}`);
    return {
      status:   errors.length === 0 ? 'ok' : 'partial',
      placed:   results, errors,
      response: { data: { statuses: [{ resting: { oid: results[0]?.oid, note: results.map(r => r.type + '@$' + r.price).join(', ') } }] } },
    };
  }

  // ── Cancel ──────────────────────────────────────────────────────────────
  if (approval.order_type === 'CANCEL') {
    const oid        = parseInt(approval.size);
    const assetIndex = await api.getAssetIndex(approval.coin);
    const payload    = await signer.buildCancelAction([{ assetIndex, oid }], vaultAddress);
    return api.submitAction(payload.action, payload.nonce, payload.signature, payload.vaultAddress);
  }

  // ── Set leverage ─────────────────────────────────────────────────────────
  if (approval.order_type === 'SET_LEVERAGE') {
    const leverage   = parseInt(approval.size);
    const assetIndex = await api.getAssetIndex(approval.coin);
    const payload    = await signer.buildSetLeverageAction(assetIndex, leverage, true, vaultAddress);
    return api.submitAction(payload.action, payload.nonce, payload.signature, payload.vaultAddress);
  }

  // ── Regular order ────────────────────────────────────────────────────────
  const assetIndex = await api.getAssetIndex(approval.coin);
  const asset      = await api.getAssetInfo(approval.coin);
  const isBuy      = approval.side === 'BUY';
  const isMarket   = approval.order_type === 'MARKET';

  let price;
  if (isMarket) {
    const midPx = await api.getPrice(approval.coin);
    price = HyperliquidSigner.marketPrice(midPx, isBuy);
  } else {
    price = parseFloat(approval.price).toPrecision(5);
  }

  const size = HyperliquidSigner.formatSize(parseFloat(approval.size), asset.szDecimals);
  console.log(`[execute] ${approval.side} ${size} ${approval.coin} @ ${price} (${approval.order_type})`);

  const payload = await signer.buildOrderAction({
    assetIndex, isBuy, price, size,
    reduceOnly: Boolean(approval.reduce_only),
    tif:        isMarket ? 'Ioc' : 'Gtc',
    vaultAddress,
  });

  const result = await api.submitAction(payload.action, payload.nonce, payload.signature, payload.vaultAddress);
  console.log('[execute] response:', JSON.stringify(result));

  if (result?.status === 'err') throw new Error(`Hyperliquid rejected order: ${JSON.stringify(result.response)}`);
  const statuses = result?.response?.data?.statuses ?? [];
  for (const s of statuses) { if (s.error) throw new Error(`Order error: ${s.error}`); }
  return result;
}

// ── Signer test ───────────────────────────────────────────────────────────────

export async function testSigner(signer, api, coin = 'BTC') {
  if (!signer) return { ok: false, error: 'No signer configured' };
  try {
    const assetIndex = await api.getAssetIndex(coin);
    const midPx      = await api.getPrice(coin);
    const price      = HyperliquidSigner.marketPrice(midPx, true);
    const payload    = await signer.buildOrderAction({ assetIndex, isBuy: true, price, size: '0.001', reduceOnly: false, tif: 'Ioc', vaultAddress: null });
    return { ok: true, signerAddress: signer.address, testCoin: coin, assetIndex, signatureR: payload.signature.r.slice(0, 12) + '…' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Technical indicators ──────────────────────────────────────────────────────

function computeIndicators(candles, indicators) {
  if (!candles || candles.length < 2) return { error: 'Not enough candle data' };
  const closes = candles.map(c => c.c);
  const highs   = candles.map(c => c.h);
  const lows    = candles.map(c => c.l);
  const result  = { candles: candles.length, currentPrice: closes.at(-1) };

  for (const ind of indicators) {
    switch (ind) {
      case 'RSI':    result.RSI    = computeRSI(closes, 14); break;
      case 'MACD':   result.MACD   = computeMACD(closes); break;
      case 'EMA_9':  result.EMA_9  = ema(closes, 9).at(-1); break;
      case 'EMA_21': result.EMA_21 = ema(closes, 21).at(-1); break;
      case 'SMA_50': result.SMA_50 = sma(closes, 50); break;
      case 'SMA_200':result.SMA_200= sma(closes, 200); break;
      case 'BB':     result.BB     = bollingerBands(closes, 20, 2); break;
      case 'ATR':    result.ATR    = computeATR(highs, lows, closes, 14); break;
    }
  }
  if (closes.length >= 25) {
    result.priceChange24h = ((closes.at(-1) - closes.at(-25)) / closes.at(-25) * 100).toFixed(2) + '%';
  }
  return result;
}

function sma(arr, n) {
  if (arr.length < n) return null;
  return arr.slice(-n).reduce((a, b) => a + b, 0) / n;
}

function ema(arr, n) {
  const k = 2 / (n + 1);
  const result = [arr[0]];
  for (let i = 1; i < arr.length; i++) result.push(arr[i] * k + result[i - 1] * (1 - k));
  return result;
}

function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const rs = gains / (losses || 1);
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

function computeMACD(closes) {
  const ema12    = ema(closes, 12);
  const ema26    = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal   = ema(macdLine.slice(-26), 9);
  return {
    macd:      parseFloat(macdLine.at(-1).toFixed(4)),
    signal:    parseFloat(signal.at(-1).toFixed(4)),
    histogram: parseFloat((macdLine.at(-1) - signal.at(-1)).toFixed(4)),
  };
}

function bollingerBands(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean  = slice.reduce((a, b) => a + b, 0) / period;
  const std   = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return {
    upper:     parseFloat((mean + mult * std).toFixed(4)),
    middle:    parseFloat(mean.toFixed(4)),
    lower:     parseFloat((mean - mult * std).toFixed(4)),
    bandwidth: parseFloat((4 * std / mean * 100).toFixed(2)),
  };
}

function computeATR(highs, lows, closes, period = 14) {
  const trs = [];
  for (let i = 1; i < highs.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i]  - closes[i - 1])
    ));
  }
  return parseFloat(sma(trs, period)?.toFixed(4) ?? 0);
}
