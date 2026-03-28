/**
 * The 20 Hyperliquid tools available to the agent.
 * Read tools: free, no approval.
 * Write tools (place_order, cancel_order, etc.): require approval gate.
 */

import { HyperliquidSigner } from '../hl/signer.js';
import { Permissions } from '../primitives/permissions.js';
import { Playbooks } from '../primitives/playbooks.js';
import { Triggers, scheduleCronTrigger } from '../primitives/triggers.js';
import { Learnings } from '../primitives/learnings.js';

// Tool definitions (for Claude's tools parameter)
export const TOOL_DEFINITIONS = [
  // ── Read tools ──────────────────────────────────────────────────────────

  {
    name: 'get_price',
    description: 'Get the current mid price for one or more Hyperliquid perpetual coins.',
    input_schema: {
      type: 'object',
      properties: {
        coins: { type: 'array', items: { type: 'string' }, description: 'e.g. ["BTC", "ETH", "HYPE"]' },
      },
      required: ['coins'],
    },
  },
  {
    name: 'get_all_mids',
    description: 'Get current mid prices for all perpetual markets on Hyperliquid.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_positions',
    description: 'Get all open perpetual positions with unrealized PnL, entry price, mark price, and leverage.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_account_value',
    description: 'Get account equity, margin used, withdrawable balance, and liquidation risk summary.',
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
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Look back N days (default 7)' },
      },
    },
  },
  {
    name: 'get_funding_payments',
    description: 'Get recent funding payments received or paid.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Look back N days (default 7)' },
      },
    },
  },
  {
    name: 'get_candles',
    description: 'Get OHLCV candlestick data for a coin.',
    input_schema: {
      type: 'object',
      properties: {
        coin: { type: 'string' },
        interval: { type: 'string', enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'], description: 'Candle interval' },
        lookback: { type: 'number', description: 'Number of candles (default 100)' },
      },
      required: ['coin'],
    },
  },
  {
    name: 'compute_indicators',
    description: 'Compute technical indicators (RSI, MACD, EMA, SMA, Bollinger Bands, ATR) from OHLCV data.',
    input_schema: {
      type: 'object',
      properties: {
        coin: { type: 'string' },
        interval: { type: 'string', enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] },
        indicators: {
          type: 'array',
          items: { type: 'string', enum: ['RSI', 'MACD', 'EMA_9', 'EMA_21', 'SMA_50', 'SMA_200', 'BB', 'ATR'] },
        },
      },
      required: ['coin', 'indicators'],
    },
  },
  {
    name: 'get_funding_rate',
    description: 'Get current and predicted funding rate for a coin, plus open interest.',
    input_schema: {
      type: 'object',
      properties: { coin: { type: 'string' } },
      required: ['coin'],
    },
  },
  {
    name: 'get_orderbook',
    description: 'Get the L2 order book (bids and asks) for a coin.',
    input_schema: {
      type: 'object',
      properties: {
        coin: { type: 'string' },
        levels: { type: 'number', description: 'Number of price levels (default 10)' },
      },
      required: ['coin'],
    },
  },
  {
    name: 'get_market_info',
    description: 'Get market info for a coin: max leverage, size decimals, 24h volume, open interest, mark price.',
    input_schema: {
      type: 'object',
      properties: { coin: { type: 'string' } },
      required: ['coin'],
    },
  },
  {
    name: 'get_top_movers',
    description: 'Get top gaining and losing perpetual markets by 24h price change.',
    input_schema: {
      type: 'object',
      properties: { n: { type: 'number', description: 'Number of top movers per side (default 10)' } },
    },
  },
  {
    name: 'search_coins',
    description: 'Search for perpetual markets on Hyperliquid by name or symbol.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'get_vault_details',
    description: 'Get details about a Hyperliquid vault (TVL, leader, performance).',
    input_schema: {
      type: 'object',
      properties: { vault_address: { type: 'string', description: '0x vault address' } },
      required: ['vault_address'],
    },
  },

  // ── Write tools (require approval) ────────────────────────────────────────

  {
    name: 'place_order',
    description: 'Queue a trade for approval. The trade will not execute until approved via the approval gate. Specify MARKET or LIMIT, side (BUY/SELL), coin, and size in coin units.',
    input_schema: {
      type: 'object',
      properties: {
        coin: { type: 'string' },
        side: { type: 'string', enum: ['BUY', 'SELL'] },
        size: { type: 'number', description: 'Position size in coin units (e.g. 0.1 for 0.1 BTC)' },
        order_type: { type: 'string', enum: ['MARKET', 'LIMIT'], default: 'MARKET' },
        price: { type: 'number', description: 'Required for LIMIT orders' },
        reduce_only: { type: 'boolean', default: false },
        reasoning: { type: 'string', description: 'Full reasoning for this trade — signals, thesis, risk/reward' },
        playbook_id: { type: 'string', description: 'Optional playbook this trade belongs to' },
      },
      required: ['coin', 'side', 'size', 'reasoning'],
    },
  },
  {
    name: 'cancel_order',
    description: 'Cancel a pending open order by order ID. Requires approval.',
    input_schema: {
      type: 'object',
      properties: {
        coin: { type: 'string' },
        order_id: { type: 'number' },
        reasoning: { type: 'string' },
      },
      required: ['coin', 'order_id', 'reasoning'],
    },
  },
  {
    name: 'set_leverage',
    description: 'Set leverage for a coin. Requires approval.',
    input_schema: {
      type: 'object',
      properties: {
        coin: { type: 'string' },
        leverage: { type: 'number', minimum: 1, maximum: 50 },
        cross: { type: 'boolean', default: true, description: 'true = cross margin, false = isolated' },
        reasoning: { type: 'string' },
      },
      required: ['coin', 'leverage', 'reasoning'],
    },
  },

  // ── Agent-managed primitives ───────────────────────────────────────────────

  {
    name: 'create_trigger',
    description: 'Create a new trigger — a condition and action pair evaluated by Heartbeat every 30s. Use hard_order for stops/targets, reasoning_job for anything requiring analysis.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        playbook_id: { type: 'string' },
        watch_coins: { type: 'array', items: { type: 'string' } },
        condition_mode: { type: 'string', enum: ['code', 'time', 'llm'] },
        condition_expr: {
          type: 'string',
          description: 'For code: JS expression using prices["COIN"]. For time: cron (e.g. "0 9 * * 1-5"). For llm: natural language question.',
        },
        action_type: { type: 'string', enum: ['hard_order', 'reasoning_job'] },
        action_args: {
          type: 'object',
          description: 'For hard_order: { coin, side, size, reduce_only, order_type, price }. For reasoning_job: { context }.',
        },
        context: { type: 'string', description: 'Why this trigger exists' },
        expires_at: { type: 'number', description: 'Unix ms timestamp for expiry' },
      },
      required: ['name', 'condition_mode', 'condition_expr', 'action_type'],
    },
  },
  {
    name: 'create_playbook',
    description: 'Create a new trading playbook — a persistent strategy document that anchors every decision.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        allocation: { type: 'number', description: 'USDC allocated to this strategy' },
        plan: { type: 'string', description: 'Full strategy document in markdown' },
      },
      required: ['name', 'plan'],
    },
  },
  {
    name: 'add_observation',
    description: 'Log an observation, insight, or lesson to the trade journal.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        playbook_id: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['content'],
    },
  },
];

// ── Tool handler ───────────────────────────────────────────────────────────────

export async function handleTool(name, input, { api, signer, walletAddress, vaultAddress, playbookContext }) {
  switch (name) {
    // ── Read ──────────────────────────────────────────────────────────────────
    case 'get_price':
      return api.getPrices(input.coins);

    case 'get_all_mids':
      return api.getAllMids();

    case 'get_positions':
      return api.getPositions(walletAddress);

    case 'get_account_value':
      return api.getAccountValue(walletAddress);

    case 'get_open_orders':
      return api.getOpenOrders(walletAddress);

    case 'get_fills': {
      const days = input.days ?? 7;
      return api.getFills(walletAddress, Date.now() - days * 86_400_000);
    }

    case 'get_funding_payments': {
      const days = input.days ?? 7;
      return api.getFundingPayments(walletAddress, Date.now() - days * 86_400_000);
    }

    case 'get_candles':
      return api.getCandles(input.coin, input.interval ?? '1h', input.lookback ?? 100);

    case 'compute_indicators': {
      const candles = await api.getCandles(input.coin, input.interval ?? '1h', 200);
      return computeIndicators(candles, input.indicators);
    }

    case 'get_funding_rate':
      return api.getFundingRate(input.coin);

    case 'get_orderbook':
      return api.getOrderbook(input.coin, input.levels ?? 10);

    case 'get_market_info':
      return api.getMarketInfo(input.coin);

    case 'get_top_movers':
      return api.getTopMovers(input.n ?? 10);

    case 'search_coins':
      return api.searchCoins(input.query);

    case 'get_vault_details':
      return api.getVaultDetails(input.vault_address);

    // ── Write (approval gate) ─────────────────────────────────────────────────
    case 'place_order': {
      const approval = Permissions.queue({
        playbookId: input.playbook_id ?? playbookContext?.id ?? null,
        coin: input.coin,
        side: input.side,
        size: input.size,
        orderType: input.order_type ?? 'MARKET',
        price: input.price ?? null,
        reduceOnly: input.reduce_only ?? false,
        reasoning: input.reasoning,
      });
      return {
        queued: true,
        approval_id: approval.id,
        message: `Trade queued for approval — ${input.side} ${input.size} ${input.coin} (${input.order_type ?? 'MARKET'}). Awaiting user approval.`,
      };
    }

    case 'cancel_order': {
      const approval = Permissions.queue({
        playbookId: playbookContext?.id ?? null,
        coin: input.coin,
        side: 'CANCEL',
        size: String(input.order_id),
        orderType: 'CANCEL',
        reasoning: input.reasoning,
      });
      return { queued: true, approval_id: approval.id, message: 'Cancel request queued for approval.' };
    }

    case 'set_leverage': {
      const approval = Permissions.queue({
        coin: input.coin,
        side: 'SET_LEVERAGE',
        size: String(input.leverage),
        orderType: 'SET_LEVERAGE',
        reasoning: input.reasoning,
      });
      return { queued: true, approval_id: approval.id, message: `Leverage change to ${input.leverage}x queued for approval.` };
    }

    // ── Primitives ────────────────────────────────────────────────────────────
    case 'create_trigger': {
      const trigger = Triggers.create({
        name: input.name,
        playbookId: input.playbook_id ?? null,
        watchCoins: input.watch_coins ?? [],
        conditionMode: input.condition_mode,
        conditionExpr: input.condition_expr,
        actionType: input.action_type,
        actionArgs: input.action_args ?? {},
        context: input.context ?? '',
        expiresAt: input.expires_at ?? null,
      });
      // Register cron if time-based
      if (trigger.conditionMode === 'time') {
        scheduleCronTrigger(trigger, () => {});
      }
      return { created: true, trigger };
    }

    case 'create_playbook': {
      const pb = Playbooks.create({
        name: input.name,
        description: input.description ?? '',
        allocation: input.allocation ?? 0,
        plan: input.plan,
      });
      return { created: true, playbook: pb };
    }

    case 'add_observation': {
      const id = Learnings.addObservation({
        playbookId: input.playbook_id ?? null,
        content: input.content,
        tags: input.tags ?? [],
      });
      return { logged: true, id };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Execute an approved trade ──────────────────────────────────────────────────

export async function executeApprovedOrder(approval, { api, signer, vaultAddress }) {
  if (!signer) throw new Error('No signer configured — add HL_PRIVATE_KEY to .env');

  if (approval.order_type === 'CANCEL') {
    const oid = parseInt(approval.size);
    const assetIndex = await api.getAssetIndex(approval.coin);
    const payload = await signer.buildCancelAction([{ assetIndex, oid }], vaultAddress);
    return api.submitAction(payload.action, payload.nonce, payload.signature, payload.vaultAddress);
  }

  if (approval.order_type === 'SET_LEVERAGE') {
    const leverage = parseInt(approval.size);
    const assetIndex = await api.getAssetIndex(approval.coin);
    const payload = await signer.buildSetLeverageAction(assetIndex, leverage, true, vaultAddress);
    return api.submitAction(payload.action, payload.nonce, payload.signature, payload.vaultAddress);
  }

  const assetIndex = await api.getAssetIndex(approval.coin);
  const asset = await api.getAssetInfo(approval.coin);
  const isBuy = approval.side === 'BUY';
  const isMarket = approval.order_type === 'MARKET';

  let price;
  if (isMarket) {
    const midPx = await api.getPrice(approval.coin);
    price = HyperliquidSigner.marketPrice(midPx, isBuy);
  } else {
    price = parseFloat(approval.price).toPrecision(5);
  }

  const size = HyperliquidSigner.formatSize(parseFloat(approval.size), asset.szDecimals);

  const payload = await signer.buildOrderAction({
    assetIndex,
    isBuy,
    price,
    size,
    reduceOnly: Boolean(approval.reduce_only),
    tif: isMarket ? 'Ioc' : 'Gtc',
    vaultAddress,
  });

  return api.submitAction(payload.action, payload.nonce, payload.signature, payload.vaultAddress);
}

// ── Technical indicators ───────────────────────────────────────────────────────

function computeIndicators(candles, indicators) {
  if (!candles || candles.length < 2) return { error: 'Not enough candle data' };
  const closes = candles.map(c => c.c);
  const highs = candles.map(c => c.h);
  const lows = candles.map(c => c.l);
  const result = { candles: candles.length };

  for (const ind of indicators) {
    switch (ind) {
      case 'RSI': result.RSI = computeRSI(closes, 14); break;
      case 'MACD': result.MACD = computeMACD(closes); break;
      case 'EMA_9': result.EMA_9 = ema(closes, 9).at(-1); break;
      case 'EMA_21': result.EMA_21 = ema(closes, 21).at(-1); break;
      case 'SMA_50': result.SMA_50 = sma(closes, 50); break;
      case 'SMA_200': result.SMA_200 = sma(closes, 200); break;
      case 'BB': result.BB = bollingerBands(closes, 20, 2); break;
      case 'ATR': result.ATR = computeATR(highs, lows, closes, 14); break;
    }
  }
  result.currentPrice = closes.at(-1);
  result.priceChange24h = ((closes.at(-1) - closes.at(-25)) / closes.at(-25) * 100).toFixed(2) + '%';
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
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = ema(macdLine.slice(-26), 9);
  return {
    macd: parseFloat(macdLine.at(-1).toFixed(4)),
    signal: parseFloat(signal.at(-1).toFixed(4)),
    histogram: parseFloat((macdLine.at(-1) - signal.at(-1)).toFixed(4)),
  };
}

function bollingerBands(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return { upper: parseFloat((mean + mult * std).toFixed(4)), middle: parseFloat(mean.toFixed(4)), lower: parseFloat((mean - mult * std).toFixed(4)), bandwidth: parseFloat((4 * std / mean * 100).toFixed(2)) };
}

function computeATR(highs, lows, closes, period = 14) {
  const trs = [];
  for (let i = 1; i < highs.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  return parseFloat(sma(trs, period)?.toFixed(4) ?? 0);
}
