// tools/hyperliquid.js
// Aggiungi questo file al tuo progetto HyperVibe e registra i tool nell'agent.

const HL_RPC = 'https://rpc.hyperliquid.xyz/evm';
const HL_API = 'https://api.hyperliquid.xyz/info';
const ASSISTANCE_FUND = '0xfefefefefefefefefefefefefefefefefefefefe';
const BURN_ADDRESS    = '0x0000000000000000000000000000000000000000';

// ── Utility ──────────────────────────────────────────────────────────────────

async function rpc(method, params) {
  const res = await fetch(HL_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  return data.result;
}

async function hlApi(body) {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

function hexToInt(hex) { return parseInt(hex, 16); }
function toHex(n)      { return '0x' + n.toString(16); }
function pad32(addr)   { return '0x000000000000000000000000' + addr.replace('0x', '').toLowerCase(); }

// ── Tool 1: get_hype_fees ────────────────────────────────────────────────────

/**
 * Fetches USDC inflows and HYPE burns from the Assistance Fund
 * for the last N minutes (default 30).
 */
async function get_hype_fees({ minutes = 30 } = {}) {
  try {
    // 1. Current block
    const currentBlockHex = await rpc('eth_blockNumber', []);
    const currentBlock = hexToInt(currentBlockHex);
    const blocksBack   = Math.floor((minutes * 60) / 2); // 2s/block
    const startBlock   = Math.max(0, currentBlock - blocksBack);

    // 2. Transfer event logs
    const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const logs = await rpc('eth_getLogs', [{
      fromBlock: toHex(startBlock),
      toBlock:   toHex(currentBlock),
      topics:    [TRANSFER_TOPIC],
    }]);

    // 3. Filter logs
    const fundPadded = pad32(ASSISTANCE_FUND);
    const burnPadded = pad32(BURN_ADDRESS);

    const inflow_logs = logs.filter(l =>
      l.topics[2] && l.topics[2].toLowerCase() === fundPadded
    );
    const burn_logs = logs.filter(l =>
      l.topics[1] && l.topics[1].toLowerCase() === fundPadded &&
      l.topics[2] && l.topics[2].toLowerCase() === burnPadded
    );

    // 4. Sum values
    const usdc_raw = inflow_logs.reduce((s, l) => s + hexToInt(l.data), 0);
    const burn_raw = burn_logs.reduce((s, l)  => s + hexToInt(l.data), 0);

    const usdc_inflow_30m = usdc_raw / 1e6;
    const hype_burned_30m = burn_raw / 1e8;

    // 5. HYPE mid price
    const mids = await hlApi({ type: 'allMids' });
    const hype_price = parseFloat(mids['HYPE'] || 0);

    const fee_rate_per_hour = usdc_inflow_30m * (60 / minutes);
    const hype_bought = hype_price > 0 ? (usdc_inflow_30m / hype_price) * 0.85 : 0;

    return {
      ok: true,
      period_minutes:    minutes,
      block_start:       startBlock,
      block_end:         currentBlock,
      usdc_inflow:       usdc_inflow_30m,
      hype_burned:       hype_burned_30m,
      hype_bought:       hype_bought,
      fee_rate_per_hour: fee_rate_per_hour,
      hype_price:        hype_price,
      inflow_tx_count:   inflow_logs.length,
      burn_tx_count:     burn_logs.length,
      low_activity:      inflow_logs.length === 0,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Tool 2: get_hype_orderbook ────────────────────────────────────────────────

/**
 * Fetches the live L2 order book for a Hyperliquid perp
 * and calculates depth + imbalance.
 */
async function get_hype_orderbook({ coin = 'HYPE', depth_pct = 5 } = {}) {
  try {
    const data = await hlApi({ type: 'l2Book', coin });

    if (!data.levels || !data.levels[0] || !data.levels[1]) {
      throw new Error('Empty levels in l2Book response');
    }

    const bids = data.levels[0].flat ? data.levels[0].flat() : data.levels[0][0] || [];
    const asks = data.levels[1].flat ? data.levels[1].flat() : data.levels[1][0] || [];

    if (!bids.length || !asks.length) throw new Error('No bid/ask levels');

    const best_bid = parseFloat(bids[0].px);
    const best_ask = parseFloat(asks[0].px);
    const mid      = (best_bid + best_ask) / 2;
    const spread_bps = ((best_ask - best_bid) / mid) * 10000;

    const bid_depth = bids
      .filter(l => parseFloat(l.px) >= mid * (1 - depth_pct / 100))
      .reduce((s, l) => s + parseFloat(l.sz), 0);

    const ask_depth = asks
      .filter(l => parseFloat(l.px) <= mid * (1 + depth_pct / 100))
      .reduce((s, l) => s + parseFloat(l.sz), 0);

    const total = bid_depth + ask_depth;
    const book_imbalance = total > 0 ? (bid_depth - ask_depth) / total : 0;

    return {
      ok:              true,
      coin,
      mid_price:       mid,
      best_bid,
      best_ask,
      spread_bps:      spread_bps.toFixed(2),
      bid_depth,
      ask_depth,
      book_imbalance:  parseFloat(book_imbalance.toFixed(4)),
      imbalance_label: book_imbalance > 0.15 ? 'bid-heavy' : book_imbalance < -0.15 ? 'ask-heavy' : 'neutral',
    };
  } catch (err) {
    // Fallback: use metaAndAssetCtxs for mid price only
    try {
      const meta = await hlApi({ type: 'metaAndAssetCtxs' });
      const universe = meta[0]?.universe || [];
      const ctxs     = meta[1] || [];
      const idx = universe.findIndex(u => u.name === coin);
      const mid = idx >= 0 ? parseFloat(ctxs[idx]?.markPx || 0) : 0;
      return { ok: true, coin, mid_price: mid, book_imbalance: null, imbalance_label: 'unavailable', partial: true, error: err.message };
    } catch (e2) {
      return { ok: false, error: err.message };
    }
  }
}

// ── Tool 3: get_hype_signal ───────────────────────────────────────────────────

/**
 * Runs the full fee monitor cycle: fees + orderbook + signal classification.
 * This is the main tool the agent should call for the fee monitor playbook.
 */
async function get_hype_signal({ minutes = 30 } = {}) {
  const [fees, book] = await Promise.all([
    get_hype_fees({ minutes }),
    get_hype_orderbook({ coin: 'HYPE' }),
  ]);

  if (!fees.ok) return { ok: false, error: `Fee fetch failed: ${fees.error}` };

  const fee_change = 0; // requires previous cycle stored in state — agent tracks this
  const imbalance  = book.ok ? book.book_imbalance : null;

  let signal = 'NEUTRAL';
  if (fees.hype_burned > 0 && fees.usdc_inflow > 0) {
    if (imbalance !== null && imbalance > 0.15) signal = 'BOUNCE_HIGH';
    else if (imbalance !== null && imbalance > 0.05) signal = 'BOUNCE_MED';
  }
  if (fees.usdc_inflow === 0 && fees.low_activity) signal = 'NEUTRAL';

  const circulating = 333_000_000; // approximate — update as needed
  const supply_reduction_1h  = fees.hype_price > 0
    ? ((fees.hype_burned * (60 / minutes)) / circulating) * 100
    : 0;
  const elasticity = 2.5;
  const price_t1h  = fees.hype_price * (1 + supply_reduction_1h        * elasticity);
  const price_t4h  = fees.hype_price * (1 + supply_reduction_1h * 4    * elasticity);
  const price_t24h = fees.hype_price * (1 + supply_reduction_1h * 24   * elasticity);

  return {
    ok: true,
    signal,
    fees,
    book: book.ok ? book : null,
    price_estimates: {
      current: fees.hype_price,
      t1h:     parseFloat(price_t1h.toFixed(4)),
      t4h:     parseFloat(price_t4h.toFixed(4)),
      t24h:    parseFloat(price_t24h.toFixed(4)),
      supply_reduction_pct_1h: supply_reduction_1h.toFixed(6),
    },
  };
}

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = { get_hype_fees, get_hype_orderbook, get_hype_signal };

// ── Tool definitions (for agent registration) ─────────────────────────────────

module.exports.toolDefinitions = [
  {
    name: 'get_hype_fees',
    description: 'Fetches USDC inflows and HYPE burn data from the Hyperliquid Assistance Fund onchain via HyperEVM RPC. Returns usdc_inflow, hype_burned, fee_rate_per_hour, hype_price.',
    input_schema: {
      type: 'object',
      properties: {
        minutes: { type: 'number', description: 'Lookback period in minutes (default 30)' },
      },
    },
  },
  {
    name: 'get_hype_orderbook',
    description: 'Fetches live L2 order book for a Hyperliquid perpetual. Returns mid_price, spread_bps, bid_depth, ask_depth, book_imbalance (-1 to +1).',
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
    description: 'Runs the full HYPE fee monitor cycle: fetches onchain fees + live orderbook, classifies signal (BOUNCE_HIGH/BOUNCE_MED/NEUTRAL/FEE_DROP/BURN_SPIKE), and returns price estimates at T+1h, T+4h, T+24h.',
    input_schema: {
      type: 'object',
      properties: {
        minutes: { type: 'number', description: 'Fee lookback period in minutes (default 30)' },
      },
    },
  },
];
