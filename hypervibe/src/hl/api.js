/**
 * Hyperliquid API client
 * Covers all info (read) and exchange (write) endpoints.
 */

const BASE_URL = {
  mainnet: 'https://api.hyperliquid.xyz',
  testnet: 'https://api.hyperliquid-testnet.xyz',
};

export class HyperliquidAPI {
  constructor(network = 'mainnet') {
    this.base = BASE_URL[network] ?? BASE_URL.mainnet;
    this._meta = null;        // cached perp metadata
    this._spotMeta = null;    // cached spot metadata
    this._metaTs = 0;
    this.CACHE_TTL = 60_000;  // 1 min cache for meta
  }

  async _info(body) {
    const res = await fetch(`${this.base}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Hyperliquid info API error: ${res.status}`);
    return res.json();
  }

  async _exchange(payload) {
    const res = await fetch(`${this.base}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Hyperliquid exchange API error: ${res.status}`);
    return res.json();
  }

  // ── Market meta ──────────────────────────────────────────────────────────

  async getMeta() {
    if (this._meta && Date.now() - this._metaTs < this.CACHE_TTL) return this._meta;
    const data = await this._info({ type: 'meta' });
    this._meta = data;
    this._metaTs = Date.now();
    return data;
  }

  async getAssetIndex(coin) {
    const meta = await this.getMeta();
    const idx = meta.universe.findIndex(u => u.name === coin);
    if (idx === -1) throw new Error(`Unknown coin: ${coin}`);
    return idx;
  }

  async getAssetInfo(coin) {
    const meta = await this.getMeta();
    const asset = meta.universe.find(u => u.name === coin);
    if (!asset) throw new Error(`Unknown coin: ${coin}`);
    return asset;
  }

  // ── Price data ────────────────────────────────────────────────────────────

  async getAllMids() {
    return this._info({ type: 'allMids' });
  }

  async getPrice(coin) {
    const mids = await this.getAllMids();
    const price = mids[coin];
    if (price === undefined) throw new Error(`No price for ${coin}`);
    return parseFloat(price);
  }

  async getPrices(coins) {
    const mids = await this.getAllMids();
    const result = {};
    for (const coin of coins) {
      result[coin] = mids[coin] ? parseFloat(mids[coin]) : null;
    }
    return result;
  }

  // ── L2 order book ─────────────────────────────────────────────────────────

  async getOrderbook(coin, nLevels = 10) {
    const data = await this._info({ type: 'l2Book', coin, nSigFigs: 5 });
    return {
      coin,
      bids: (data.levels[0] ?? []).slice(0, nLevels).map(([px, sz]) => ({ price: parseFloat(px), size: parseFloat(sz) })),
      asks: (data.levels[1] ?? []).slice(0, nLevels).map(([px, sz]) => ({ price: parseFloat(px), size: parseFloat(sz) })),
      timestamp: data.time,
    };
  }

  // ── OHLCV candles ─────────────────────────────────────────────────────────

  async getCandles(coin, interval = '1h', lookback = 200) {
    const now = Date.now();
    const intervalMs = {
      '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
      '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
    }[interval] ?? 3_600_000;

    const startTime = now - lookback * intervalMs;
    const data = await this._info({
      type: 'candleSnapshot',
      req: { coin, interval, startTime, endTime: now },
    });

    return data.map(c => ({
      t: c.t,
      o: parseFloat(c.o),
      h: parseFloat(c.h),
      l: parseFloat(c.l),
      c: parseFloat(c.c),
      v: parseFloat(c.v),
    }));
  }

  // ── Funding ───────────────────────────────────────────────────────────────

  async getFundingRate(coin) {
    const meta = await this.getMeta();
    const ctx = await this._info({ type: 'metaAndAssetCtxs' });
    const idx = meta.universe.findIndex(u => u.name === coin);
    if (idx === -1) throw new Error(`Unknown coin: ${coin}`);
    const assetCtx = ctx[1][idx];
    return {
      coin,
      fundingRate: parseFloat(assetCtx.funding),
      openInterest: parseFloat(assetCtx.openInterest),
      markPx: parseFloat(assetCtx.markPx),
      oraclePx: parseFloat(assetCtx.oraclePx),
      premium: parseFloat(assetCtx.premium),
    };
  }

  async getFundingHistory(coin, startTime, endTime = Date.now()) {
    return this._info({ type: 'fundingHistory', coin, startTime, endTime });
  }

  // ── Market overview ───────────────────────────────────────────────────────

  async getMarketInfo(coin) {
    const [meta, ctx, mids] = await Promise.all([
      this.getMeta(),
      this._info({ type: 'metaAndAssetCtxs' }),
      this.getAllMids(),
    ]);
    const idx = meta.universe.findIndex(u => u.name === coin);
    if (idx === -1) throw new Error(`Unknown coin: ${coin}`);
    const asset = meta.universe[idx];
    const assetCtx = ctx[1][idx];
    return {
      coin,
      maxLeverage: asset.maxLeverage,
      szDecimals: asset.szDecimals,
      midPx: parseFloat(mids[coin] ?? 0),
      markPx: parseFloat(assetCtx.markPx),
      oraclePx: parseFloat(assetCtx.oraclePx),
      fundingRate: parseFloat(assetCtx.funding),
      openInterest: parseFloat(assetCtx.openInterest),
      dayVolume: parseFloat(assetCtx.dayNtlVlm ?? 0),
    };
  }

  async getTopMovers(n = 10) {
    const [mids, ctx, meta] = await Promise.all([
      this.getAllMids(),
      this._info({ type: 'metaAndAssetCtxs' }),
      this.getMeta(),
    ]);
    const coins = meta.universe.map((u, i) => ({
      coin: u.name,
      price: parseFloat(mids[u.name] ?? 0),
      prevDayPx: parseFloat(ctx[1][i]?.prevDayPx ?? 0),
      openInterest: parseFloat(ctx[1][i]?.openInterest ?? 0),
      dayVolume: parseFloat(ctx[1][i]?.dayNtlVlm ?? 0),
      fundingRate: parseFloat(ctx[1][i]?.funding ?? 0),
    }));
    for (const c of coins) {
      c.change24h = c.prevDayPx > 0 ? ((c.price - c.prevDayPx) / c.prevDayPx) * 100 : 0;
    }
    const sorted = [...coins].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
    return { gainers: sorted.filter(c => c.change24h > 0).slice(0, n), losers: sorted.filter(c => c.change24h < 0).slice(0, n) };
  }

  async searchCoins(query) {
    const meta = await this.getMeta();
    const q = query.toLowerCase();
    return meta.universe
      .filter(u => u.name.toLowerCase().includes(q))
      .slice(0, 10)
      .map(u => ({ coin: u.name, maxLeverage: u.maxLeverage, szDecimals: u.szDecimals }));
  }

  // ── Account / User ────────────────────────────────────────────────────────

  async getClearinghouseState(address) {
    return this._info({ type: 'clearinghouseState', user: address });
  }

  async getPositions(address) {
    const state = await this.getClearinghouseState(address);
    const positions = (state.assetPositions ?? [])
      .filter(ap => ap.position && parseFloat(ap.position.szi) !== 0)
      .map(ap => {
        const p = ap.position;
        const szi = parseFloat(p.szi);
        const entryPx = parseFloat(p.entryPx ?? 0);
        const markPx = parseFloat(p.positionValue) / Math.abs(szi);
        const unrealizedPnl = parseFloat(p.unrealizedPnl ?? 0);
        const leverage = parseFloat(p.leverage?.value ?? 1);
        return {
          coin: p.coin,
          side: szi > 0 ? 'LONG' : 'SHORT',
          size: Math.abs(szi),
          entryPx,
          markPx,
          unrealizedPnl,
          returnOnEquity: parseFloat(p.returnOnEquity ?? 0) * 100,
          leverage,
          liquidationPx: parseFloat(p.liquidationPx ?? 0),
          positionValue: Math.abs(parseFloat(p.positionValue ?? 0)),
          marginUsed: parseFloat(p.marginUsed ?? 0),
        };
      });
    return positions;
  }

  async getAccountValue(address) {
    const state = await this.getClearinghouseState(address);
    return {
      accountValue: parseFloat(state.marginSummary?.accountValue ?? 0),
      totalMarginUsed: parseFloat(state.marginSummary?.totalMarginUsed ?? 0),
      totalNtlPos: parseFloat(state.marginSummary?.totalNtlPos ?? 0),
      withdrawable: parseFloat(state.withdrawable ?? 0),
      crossMaintenanceMarginUsed: parseFloat(state.crossMaintenanceMarginUsed ?? 0),
    };
  }

  async getOpenOrders(address) {
    const orders = await this._info({ type: 'openOrders', user: address });
    return (orders ?? []).map(o => ({
      oid: o.oid,
      coin: o.coin,
      side: o.side === 'B' ? 'BUY' : 'SELL',
      limitPx: parseFloat(o.limitPx),
      sz: parseFloat(o.sz),
      origSz: parseFloat(o.origSz),
      timestamp: o.timestamp,
      orderType: o.orderType,
      reduceOnly: o.reduceOnly,
    }));
  }

  async getFills(address, startTime = Date.now() - 7 * 86_400_000) {
    const fills = await this._info({ type: 'userFills', user: address, startTime });
    return (fills ?? []).slice(0, 50).map(f => ({
      coin: f.coin,
      side: f.side === 'B' ? 'BUY' : 'SELL',
      px: parseFloat(f.px),
      sz: parseFloat(f.sz),
      fee: parseFloat(f.fee),
      time: f.time,
      tid: f.tid,
      oid: f.oid,
      closedPnl: parseFloat(f.closedPnl ?? 0),
    }));
  }

  async getFundingPayments(address, startTime = Date.now() - 7 * 86_400_000) {
    const data = await this._info({ type: 'userFunding', user: address, startTime });
    return (data ?? []).map(f => ({
      coin: f.delta.coin,
      payment: parseFloat(f.delta.fundingRate ?? 0),
      time: f.time,
    }));
  }

  // ── Vault ─────────────────────────────────────────────────────────────────

  async getVaultDetails(vaultAddress) {
    const data = await this._info({ type: 'vaultDetails', vaultAddress });
    return {
      name: data.name,
      leader: data.leader,
      description: data.description,
      portfolio: data.portfolio,
      followers: data.followers?.length ?? 0,
      tvl: parseFloat(data.portfolio?.[data.portfolio?.length - 1]?.[1]?.accountValue ?? 0),
    };
  }

  // ── Exchange actions (need signing) ───────────────────────────────────────

  async submitAction(action, nonce, signature, vaultAddress = null) {
    const payload = {
      action,
      nonce,
      signature,
    };
    if (vaultAddress) payload.vaultAddress = vaultAddress;
    return this._exchange(payload);
  }
}
