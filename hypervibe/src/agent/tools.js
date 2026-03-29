/**
 * HyperVibe — 21 tools for Claude
 * Read tools: no approval. Write tools: approval gate.
 */

import { HyperliquidSigner } from '../hl/signer.js';
import { Permissions } from '../primitives/permissions.js';
import { Playbooks } from '../primitives/playbooks.js';
import { Triggers, scheduleCronTrigger } from '../primitives/triggers.js';
import { Learnings } from '../primitives/learnings.js';

// ── Tool definitions ───────────────────────────────────────────────────────────

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
        coin: { type: 'string' },
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
        coin: { type: 'string' },
        interval: { type: 'string', enum: ['1m','5m','15m','30m','1h','4h','1d'] },
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
  {
    name: 'place_order',
    description: 'Queue a trade for approval. Not executed until user approves.',
    input_schema: {
      type: 'object',
      properties: {
        coin: { type: 'string' },
        side: { type: 'string', enum: ['BUY','SELL'] },
        size: { type: 'number', description: 'Size in coin units' },
        order_type: { type: 'string', enum: ['MARKET','LIMIT'], default: 'MARKET' },
        price: { type: 'number' },
        reduce_only: { type: 'boolean', default: false },
        reasoning: { type: 'string' },
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
        coin: { type: 'string' },
        position_side: { type: 'string', enum: ['LONG','SHORT'] },
        total_size: { type: 'number' },
        stop_loss_price: { type: 'number' },
        tp1_price: { type: 'number' },
        tp1_size: { type: 'number' },
        tp2_price: { type: 'number' },
        tp2_size: { type: 'number' },
        tp3_price: { type: 'number' },
        tp3_size: { type: 'number' },
        reasoning: { type: 'string' },
      },
      required: ['coin','position_side','total_size','stop_loss_price','tp1_price','tp1_size','reasoning'],
    },
  },
  {
    name: 'cancel_order',
    description: 'Cancel a pending open order by order ID.',
    input_schema: {
      type: 'object',
      properties: { coin: { type: 'string' }, order_id: { type: 'number' }, reasoning: { type: 'string' } },
      required: ['coin','order_id','reasoning'],
    },
  },
  {
    name: 'set_leverage',
    description: 'Set leverage for a coin.',
    input_schema: {
      type: 'object',
      properties: { coin: { type: 'string' }, leverage: { type: 'number', minimum: 1, maximum: 50 }, cross: { type: 'boolean', default: true }, reasoning: { type: 'string' } },
      required: ['coin','leverage','reasoning'],
    },
  },
  {
    name: 'create_trigger',
    description: 'Create a Heartbeat trigger — condition + action evaluated every 30s.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        playbook_id: { type: 'string' },
        watch_coins: { type: 'array', items: { type: 'string' } },
        condition_mode: { type: 'string', enum: ['code','time','llm'] },
        condition_expr: { type: 'string' },
        action_type: { type: 'string', enum: ['hard_order','reasoning_job'] },
        action_args: { type: 'object' },
        context: { type: 'string' },
        expires_at: { type: 'number' },
      },
      required: ['name','condition_mode','condition_expr','action_type'],
    },
  },
  {
    name: 'create_playbook',
    description: 'Create a new trading playbook.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, description: { type: 'string' }, allocation: { type: 'number' }, plan: { type: 'string' } },
      required: ['name','plan'],
    },
  },
  {
    name: 'add_observation',
    description: 'Log an observation to the trade journal.',
    input_schema: {
      type: 'object',
      properties: { content: { type: 'string' }, playbook_id: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
      required: ['content'],
    },
  },
];

// ── Tool handler ───────────────────────────────────────────────────────────────

export async function handleTool(name, input, { api, signer, walletAddress, vaultAddress, playbookContext }) {
  switch (name) {
    case 'get_price':           return api.getPrices(input.coins);
    case 'get_all_mids':        return api.getAllMids();
    case 'get_positions':       return api.getPositions(walletAddress);
    case 'get_account_value':   return api.getAccountValue(walletAddress);
    case 'get_open_orders':     return api.getOpenOrders(walletAddress);
    case 'get_fills':           return api.getFills(walletAddress, Date.now() - (input.days ?? 7) * 86_400_000);
    case 'get_funding_payments':return api.getFundingPayments(walletAddress, Date.now() - (input.days ?? 7) * 86_400_000);
    case 'get_candles':         return api.getCandles(input.coin, input.interval ?? '1h', input.lookback ?? 100);
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

    case 'place_order': {
      const approval = Permissions.queue({
        playbookId: input.playbook_id ?? playbookContext?.id ?? null,
        coin: input.coin, side: input.side, size: input.size,
        orderType: input.order_type ?? 'MARKET',
        price: input.price ?? null, reduceOnly: input.reduce_only ?? false,
        reasoning: input.reasoning,
      });
      return { queued: true, approval_id: approval.id, message: `Trade queued — ${input.side} ${input.size} ${input.coin}. Awaiting approval.` };
    }

    case 'place_exit_orders': {
      const approval = Permissions.queue({
        playbookId: playbookContext?.id ?? null,
        coin: input.coin, side: 'EXIT_ORDERS', size: String(input.total_size),
        orderType: 'EXIT_ORDERS',
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
      const approval = Permissions.queue({ coin: input.coin, side: 'CANCEL', size: String(input.order_id), orderType: 'CANCEL', reasoning: input.reasoning });
      return { queued: true, approval_id: approval.id };
    }

    case 'set_leverage': {
      const approval = Permissions.queue({ coin: input.coin, side: 'SET_LEVERAGE', size: String(input.leverage), orderType: 'SET_LEVERAGE', reasoning: input.reasoning });
      return { queued: true, approval_id: approval.id };
    }

    case 'create_trigger': {
      const trigger = Triggers.create({
        name: input.name, playbookId: input.playbook_id ?? null,
        watchCoins: input.watch_coins ?? [], conditionMode: input.condition_mode,
        conditionExpr: input.condition_expr, actionType: input.action_type,
        actionArgs: input.action_args ?? {}, context: input.context ?? '',
        expiresAt: input.expires_at ?? null,
      });
      if (trigger.conditionMode === 'time') scheduleCronTrigger(trigger, () => {});
      return { created: true, trigger };
    }

    case 'create_playbook': {
      const pb = Playbooks.create({ name: input.name, description: input.description ?? '', allocation: input.allocation ?? 0, plan: input.plan });
      return { created: true, playbook: pb };
    }

    case 'add_observation': {
      const id = Learnings.addObservation({ playbookId: input.playbook_id ?? null, content: input.content, tags: input.tags ?? [] });
      return { logged: true, id };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Execute approved order ─────────────────────────────────────────────────────

export async function executeApprovedOrder(approval, { api, signer, vaultAddress }) {
  if (!signer) throw new Error('No signer — add HL_PRIVATE_KEY in Settings');

  // ── Exit orders (TP as limit orders + SL as HyperVibe trigger) ─────────────
  if (approval.order_type === 'EXIT_ORDERS') {
    const params = JSON.parse(approval.price);
    const { coin, position_side, total_size, stop_loss_price, tp1_price, tp1_size, tp2_price, tp2_size, tp3_price, tp3_size } = params;

    const assetIndex = await api.getAssetIndex(coin);
    const asset      = await api.getAssetInfo(coin);
    const isLong     = position_side === 'LONG';
    const exitIsBuy  = !isLong;
    const fmt        = (sz) => HyperliquidSigner.formatSize(parseFloat(sz), asset.szDecimals);
    // Normalize price: strip trailing zeros to match Hyperliquid's Python normalization
    // e.g. "40.480" → "40.48", "41.730" → "41.73"
    const px5        = (p) => {
      const s = parseFloat(p).toPrecision(5);
      return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
    };

    console.log(`[exit] ${position_side} ${total_size} ${coin} | SL:$${stop_loss_price} TP1:$${tp1_price}`);

    const results = [];
    const errors  = [];

    // Helper: place a single limit order using the same path as entry orders
    const submitLimit = async (price, size, label) => {
      await new Promise(r => setTimeout(r, 80));
      const payload = await signer.buildOrderAction({
        assetIndex,
        isBuy:       exitIsBuy,
        price:       px5(price),
        size:        fmt(size),
        reduceOnly:  true,
        tif:         'Gtc',
        vaultAddress: vaultAddress ?? null,
      });
      const res = await api.submitAction(payload.action, payload.nonce, payload.signature, payload.vaultAddress);
      console.log(`[exit] ${label} response:`, JSON.stringify(res));
      if (res?.status === 'err') throw new Error(String(res.response));
      const statusErr = res?.response?.data?.statuses?.[0]?.error;
      if (statusErr) throw new Error(statusErr);
      return res;
    };

    // Consolidate TPs — Hyperliquid minimum $11 per order
    const MIN_NOTIONAL = 11.5;
    const tpCandidates = [
      tp1_price && tp1_size ? { price: parseFloat(tp1_price), size: parseFloat(tp1_size), label: 'TP1' } : null,
      tp2_price && tp2_size ? { price: parseFloat(tp2_price), size: parseFloat(tp2_size), label: 'TP2' } : null,
      tp3_price && tp3_size ? { price: parseFloat(tp3_price), size: parseFloat(tp3_size), label: 'TP3' } : null,
    ].filter(Boolean);

    const tpOrders = [];
    let acc = null;
    for (const tp of tpCandidates) {
      if (!acc) {
        acc = { price: tp.price, size: tp.size, label: tp.label };
      } else {
        acc.size  += tp.size;
        acc.label += '+' + tp.label;
      }
      if (acc.size * acc.price >= MIN_NOTIONAL) {
        tpOrders.push({ ...acc });
        acc = null;
      }
    }
    if (acc) {
      if (tpOrders.length > 0) {
        tpOrders[tpOrders.length - 1].size += acc.size;
        tpOrders[tpOrders.length - 1].label += '+' + acc.label;
      } else {
        tpOrders.push(acc);
      }
    }

    console.log(`[exit] TPs: ${tpCandidates.map(t => t.label + '@' + t.price).join(', ')}`);
    console.log(`[exit] After merge: ${tpOrders.map(t => t.label + '×' + t.size.toFixed(2) + '@$' + t.price).join(', ')}`);

    for (const tp of tpOrders) {
      try {
        const r   = await submitLimit(tp.price, tp.size, tp.label);
        const oid = r?.response?.data?.statuses?.[0]?.resting?.oid;
        results.push({ type: tp.label, price: tp.price, oid });
        console.log(`[exit] ${tp.label} placed oid=${oid} notional=$${(tp.size * tp.price).toFixed(2)}`);
      } catch(e) {
        errors.push(`${tp.label}: ${e.message}`);
        console.error(`[exit] ${tp.label} failed:`, e.message);
      }
    }

    // SL as HyperVibe Heartbeat trigger (30s monitoring → market order)
    try {
      const slExpr = isLong
        ? `prices["${coin}"] <= ${stop_loss_price}`
        : `prices["${coin}"] >= ${stop_loss_price}`;

      Triggers.create({
        name: `SL ${coin} @ $${stop_loss_price}`,
        watchCoins: [coin], conditionMode: 'code', conditionExpr: slExpr,
        actionType: 'hard_order',
        actionArgs: { coin, side: exitIsBuy ? 'BUY' : 'SELL', size: fmt(total_size), order_type: 'MARKET', reduce_only: true },
        context: `Auto SL: ${position_side} ${total_size} ${coin}. Market order when price hits $${stop_loss_price}.`,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });
      results.push({ type: 'SL', price: stop_loss_price, mode: 'HyperVibe 30s' });
      console.log(`[exit] SL trigger: ${slExpr}`);
    } catch(e) {
      errors.push(`SL: ${e.message}`);
      console.error('[exit] SL trigger failed:', e.message);
    }

    console.log(`[exit] done — placed: [${results.map(r => r.type).join(', ')}] errors: [${errors.join('; ')}]`);

    if (results.length === 0) throw new Error(`All exit orders failed:\n${errors.join('\n')}`);

    return {
      status: errors.length === 0 ? 'ok' : 'partial',
      placed: results, errors,
      response: { data: { statuses: [{ resting: { oid: results[0]?.oid, note: results.map(r => r.type + '@$' + r.price).join(', ') } }] } },
    };
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────
  if (approval.order_type === 'CANCEL') {
    const oid = parseInt(approval.size);
    const assetIndex = await api.getAssetIndex(approval.coin);
    const payload = await signer.buildCancelAction([{ assetIndex, oid }], vaultAddress);
    return api.submitAction(payload.action, payload.nonce, payload.signature, payload.vaultAddress);
  }

  // ── Set leverage ────────────────────────────────────────────────────────────
  if (approval.order_type === 'SET_LEVERAGE') {
    const leverage = parseInt(approval.size);
    const assetIndex = await api.getAssetIndex(approval.coin);
    const payload = await signer.buildSetLeverageAction(assetIndex, leverage, true, vaultAddress);
    return api.submitAction(payload.action, payload.nonce, payload.signature, payload.vaultAddress);
  }

  // ── Regular order ───────────────────────────────────────────────────────────
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
    tif: isMarket ? 'Ioc' : 'Gtc',
    vaultAddress,
  });

  const result = await api.submitAction(payload.action, payload.nonce, payload.signature, payload.vaultAddress);
  console.log('[execute] response:', JSON.stringify(result));

  if (result?.status === 'err') throw new Error(`Hyperliquid rejected order: ${JSON.stringify(result.response)}`);
  const statuses = result?.response?.data?.statuses ?? [];
  for (const s of statuses) {
    if (s.error) throw new Error(`Order error: ${s.error}`);
  }
  return result;
}

// ── Signer test ────────────────────────────────────────────────────────────────

export async function testSigner(signer, api, coin = 'BTC') {
  if (!signer) return { ok: false, error: 'No signer configured' };
  try {
    const assetIndex = await api.getAssetIndex(coin);
    const midPx = await api.getPrice(coin);
    const price = HyperliquidSigner.marketPrice(midPx, true);
    const payload = await signer.buildOrderAction({ assetIndex, isBuy: true, price, size: '0.001', reduceOnly: false, tif: 'Ioc', vaultAddress: null });
    return { ok: true, signerAddress: signer.address, testCoin: coin, assetIndex, signatureR: payload.signature.r.slice(0, 12) + '…' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Technical indicators ───────────────────────────────────────────────────────

function computeIndicators(candles, indicators) {
  if (!candles || candles.length < 2) return { error: 'Not enough candle data' };
  const closes = candles.map(c => c.c);
  const highs  = candles.map(c => c.h);
  const lows   = candles.map(c => c.l);
  const result = { candles: candles.length, currentPrice: closes.at(-1) };

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
    upper: parseFloat((mean + mult * std).toFixed(4)),
    middle: parseFloat(mean.toFixed(4)),
    lower: parseFloat((mean - mult * std).toFixed(4)),
    bandwidth: parseFloat((4 * std / mean * 100).toFixed(2)),
  };
}

function computeATR(highs, lows, closes, period = 14) {
  const trs = [];
  for (let i = 1; i < highs.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  return parseFloat(sma(trs, period)?.toFixed(4) ?? 0);
}
