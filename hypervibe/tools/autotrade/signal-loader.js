#!/usr/bin/env node

/**
 * signal-loader.js
 * HyperVibe — Autotrade Signal Loader
 *
 * Reads a signal JSON produced by autotrade-bridge.js and executes
 * the strategy live on Hyperliquid: entry order + stop-loss + take-profit.
 *
 * Integrates with HyperVibe's existing signer.js and tools architecture.
 *
 * Usage:
 *   node signal-loader.js --signal ./playbooks/signals/signal_sol_1h_xxx.json
 *   node signal-loader.js --signal ./playbooks/signals/signal_sol_1h_xxx.json --dry-run false
 *   node signal-loader.js --latest --coin SOL
 *   node signal-loader.js --monitor --position-id <id>
 *
 * SAFETY: DRY_RUN=true by default. Set --dry-run false explicitly to go live.
 *
 * Dependencies (add to package.json):
 *   "@nktkas/hyperliquid": "^0.x"   ← official HL TypeScript SDK (works in Node)
 *   "ethers": "^6.x"                ← for wallet/signing
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

// Hyperliquid SDK — install: npm install @nktkas/hyperliquid ethers
// Docs: https://github.com/nktkas/hyperliquid
import * as hl from "@nktkas/hyperliquid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIG = {
  // Override via .env or env vars
  WALLET_ADDRESS:   process.env.HL_WALLET_ADDRESS   ?? "",
  PRIVATE_KEY:      process.env.HL_PRIVATE_KEY       ?? "",
  VAULT_ADDRESS:    process.env.HL_VAULT_ADDRESS     ?? "",  // optional, set if using vault
  USE_VAULT:        process.env.HL_USE_VAULT         === "true",
  SIGNALS_DIR:      process.env.SIGNALS_DIR          ?? path.join(__dirname, "playbooks", "signals"),
  DRY_RUN:          process.env.DRY_RUN              !== "false", // default TRUE
  SLIPPAGE_BPS:     Number(process.env.SLIPPAGE_BPS  ?? 30),     // 0.3% default
  POLL_INTERVAL_MS: Number(process.env.POLL_MS       ?? 5000),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg, level = "info") {
  const ts = new Date().toTimeString().slice(0, 8);
  const prefix = {
    info:  `\x1b[90m${ts}\x1b[0m [\x1b[36mINFO\x1b[0m]`,
    ok:    `\x1b[90m${ts}\x1b[0m [\x1b[32m OK \x1b[0m]`,
    warn:  `\x1b[90m${ts}\x1b[0m [\x1b[33mWARN\x1b[0m]`,
    error: `\x1b[90m${ts}\x1b[0m [\x1b[31mERR \x1b[0m]`,
    trade: `\x1b[90m${ts}\x1b[0m [\x1b[35mTRADE\x1b[0m]`,
    dry:   `\x1b[90m${ts}\x1b[0m [\x1b[33m DRY\x1b[0m]`,
  }[level] ?? `[${level.toUpperCase()}]`;
  console.log(`${prefix} ${msg}`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      args[key] = (!next || next.startsWith("--")) ? true : argv[++i];
    } else {
      args._.push(argv[i]);
    }
  }
  return args;
}

function roundToTick(price, tickSize) {
  const precision = Math.round(-Math.log10(tickSize));
  return parseFloat(price.toFixed(precision));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Signal loader ────────────────────────────────────────────────────────────

function loadSignal(signalPath) {
  if (!fs.existsSync(signalPath)) throw new Error(`Signal not found: ${signalPath}`);
  const signal = JSON.parse(fs.readFileSync(signalPath, "utf-8"));

  // Validate
  if (!signal.coin)          throw new Error("Signal missing 'coin'");
  if (!signal.signal_params) throw new Error("Signal missing 'signal_params'");
  if (!signal.ready_for_live) {
    log("Signal is NOT marked ready_for_live.", "warn");
    signal.warnings?.forEach((w) => log(`  ⚠ ${w}`, "warn"));
    log("Proceeding with caution — DRY_RUN will be forced.", "warn");
    CONFIG.DRY_RUN = true;
  }

  return signal;
}

function findLatestSignal(coin) {
  const dir = CONFIG.SIGNALS_DIR;
  if (!fs.existsSync(dir)) throw new Error(`Signals dir not found: ${dir}`);

  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json") && (!coin || f.includes(coin.toLowerCase())))
    .map((f) => ({ file: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) throw new Error(`No signal files found in ${dir}${coin ? ` for ${coin}` : ""}`);
  const latest = path.join(dir, files[0].file);
  log(`Using latest signal: ${files[0].file}`, "info");
  return latest;
}

// ─── Hyperliquid client ───────────────────────────────────────────────────────

async function buildClients() {
  if (!CONFIG.PRIVATE_KEY) throw new Error("HL_PRIVATE_KEY not set in environment.");
  if (!CONFIG.WALLET_ADDRESS) throw new Error("HL_WALLET_ADDRESS not set in environment.");

  const transport = new hl.HttpTransport(); // mainnet
  const infoClient = new hl.PublicClient({ transport });

  const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY);
  const walletClient = new hl.WalletClient({
    wallet,
    transport,
    ...(CONFIG.USE_VAULT && CONFIG.VAULT_ADDRESS
      ? { vaultAddress: CONFIG.VAULT_ADDRESS }
      : {}),
  });

  return { infoClient, walletClient };
}

// ─── Market data ──────────────────────────────────────────────────────────────

async function getMarketInfo(infoClient, coin) {
  const meta = await infoClient.metaAndAssetCtxs();
  const universe = meta[0].universe;
  const ctxs = meta[1];

  const idx = universe.findIndex((m) => m.name === coin.toUpperCase());
  if (idx === -1) throw new Error(`Coin ${coin} not found on Hyperliquid. Check ticker.`);

  const asset = universe[idx];
  const ctx = ctxs[idx];

  return {
    assetIndex: idx,
    name: asset.name,
    szDecimals: asset.szDecimals,
    tickSize: parseFloat(ctx.markPx) > 0 ? 0.01 : 0.0001, // simplified — use meta for real tick
    markPrice: parseFloat(ctx.markPx),
    openInterest: parseFloat(ctx.openInterest),
    funding: parseFloat(ctx.funding),
  };
}

async function getAccountBalance(infoClient, address) {
  const state = await infoClient.clearinghouseState({ user: address });
  const equity = parseFloat(state.crossMarginSummary?.accountValue ?? 0);
  const available = parseFloat(state.withdrawable ?? 0);
  return { equity, available };
}

async function getOpenPositions(infoClient, address, coin) {
  const state = await infoClient.clearinghouseState({ user: address });
  const positions = state.assetPositions ?? [];
  return positions
    .filter((p) => parseFloat(p.position?.szi ?? 0) !== 0)
    .filter((p) => !coin || p.position?.coin === coin.toUpperCase())
    .map((p) => ({
      coin: p.position.coin,
      size: parseFloat(p.position.szi),
      entryPrice: parseFloat(p.position.entryPx),
      unrealizedPnl: parseFloat(p.position.unrealizedPnl),
      leverage: parseFloat(p.position.leverage?.value ?? 1),
    }));
}

// ─── Order execution ──────────────────────────────────────────────────────────

function calcPositionSize(balance, positionSizePct, markPrice, leverage, szDecimals) {
  const capitalAlloc = balance * (positionSizePct / 100);
  const notional = capitalAlloc * leverage;
  const rawSize = notional / markPrice;
  // Round down to szDecimals
  const factor = Math.pow(10, szDecimals);
  return Math.floor(rawSize * factor) / factor;
}

async function placeMarketOrder(walletClient, assetIndex, isBuy, size, slippageBps) {
  // HL doesn't support true market orders — simulate with aggressive limit
  // (CCXT does the same internally)
  log(`Placing ${isBuy ? "BUY" : "SELL"} market order: size=${size}`, "trade");
  // slippage is handled by tpsl type orders and IOC limit in practice
  const result = await walletClient.order({
    orders: [{
      a: assetIndex,
      b: isBuy,
      p: "0",          // price 0 = market (HL SDK handles this as aggressive limit)
      s: String(size),
      r: false,        // not reduce-only
      t: { market: {} },
    }],
    grouping: "na",
  });
  return result;
}

async function placeStopLoss(walletClient, assetIndex, isBuy, size, triggerPrice, tickSize) {
  const tp = roundToTick(triggerPrice, tickSize);
  log(`Placing stop-loss @ ${tp}`, "trade");
  const result = await walletClient.order({
    orders: [{
      a: assetIndex,
      b: !isBuy,       // opposite side to close
      p: String(tp),
      s: String(size),
      r: true,         // reduce-only
      t: {
        trigger: {
          isMarket: true,
          triggerPx: String(tp),
          tpsl: "sl",
        },
      },
    }],
    grouping: "na",
  });
  return result;
}

async function placeTakeProfit(walletClient, assetIndex, isBuy, size, triggerPrice, tickSize) {
  const tp = roundToTick(triggerPrice, tickSize);
  log(`Placing take-profit @ ${tp}`, "trade");
  const result = await walletClient.order({
    orders: [{
      a: assetIndex,
      b: !isBuy,
      p: String(tp),
      s: String(size),
      r: true,
      t: {
        trigger: {
          isMarket: true,
          triggerPx: String(tp),
          tpsl: "tp",
        },
      },
    }],
    grouping: "na",
  });
  return result;
}

async function setLeverage(walletClient, assetIndex, leverage) {
  log(`Setting leverage: ${leverage}x`, "info");
  return walletClient.updateLeverage({
    asset: assetIndex,
    isCross: true,
    leverage,
  });
}

// ─── Main execution flow ──────────────────────────────────────────────────────

async function executeSignal(signal, dryRun) {
  const { coin, signal_params } = signal;
  const risk = signal_params.risk;

  const isBuy = true; // autotrade strategies are typically long-biased for perps
  // TODO: parse entry_conditions.direction if strategy exports it

  log(`═══════════════════════════════════════════`, "info");
  log(`Signal Loader — HyperVibe`, "info");
  log(`Coin       : ${coin}`, "info");
  log(`Timeframe  : ${signal.timeframe}`, "info");
  log(`Strategy   : ${signal.strategy_file}`, "info");
  log(`Backtest PF: ${signal.backtest_metrics.profit_factor}`, "info");
  log(`Max DD     : ${signal.backtest_metrics.max_drawdown_pct}%`, "info");
  log(`Leverage   : ${risk.max_leverage}x`, "info");
  log(`SL         : -${risk.stop_loss_pct}%`, "info");
  log(`TP         : +${risk.take_profit_pct}%`, "info");
  log(`Size       : ${risk.position_size_pct}% of equity`, "info");
  log(`Mode       : ${dryRun ? "\x1b[33mDRY RUN\x1b[0m" : "\x1b[32mLIVE\x1b[0m"}`, "info");
  log(`═══════════════════════════════════════════`, "info");

  const { infoClient, walletClient } = await buildClients();
  const effectiveAddress = CONFIG.USE_VAULT ? CONFIG.VAULT_ADDRESS : CONFIG.WALLET_ADDRESS;

  // Fetch market data
  const market = await getMarketInfo(infoClient, coin);
  const balance = await getAccountBalance(infoClient, effectiveAddress);
  log(`Mark price : $${market.markPrice}`, "info");
  log(`Account    : $${balance.equity.toFixed(2)} equity | $${balance.available.toFixed(2)} available`, "info");

  // Check for existing position
  const existing = await getOpenPositions(infoClient, effectiveAddress, coin);
  if (existing.length > 0) {
    log(`Already have a ${coin} position: ${JSON.stringify(existing[0])}`, "warn");
    log("Skipping entry — close existing position first.", "warn");
    return;
  }

  // Calculate order params
  const size = calcPositionSize(
    balance.available,
    risk.position_size_pct,
    market.markPrice,
    risk.max_leverage,
    market.szDecimals,
  );

  const slPrice = isBuy
    ? market.markPrice * (1 - risk.stop_loss_pct / 100)
    : market.markPrice * (1 + risk.stop_loss_pct / 100);

  const tpPrice = isBuy
    ? market.markPrice * (1 + risk.take_profit_pct / 100)
    : market.markPrice * (1 - risk.take_profit_pct / 100);

  log(`Order size : ${size} ${coin} (notional ~$${(size * market.markPrice).toFixed(2)})`, "info");
  log(`SL price   : $${slPrice.toFixed(4)}`, "info");
  log(`TP price   : $${tpPrice.toFixed(4)}`, "info");

  if (size <= 0) {
    log("Position size is 0 — insufficient balance or size too small.", "error");
    return;
  }

  if (dryRun) {
    log("DRY RUN — no orders placed. Set --dry-run false to go live.", "dry");
    log(`Would: SET leverage ${risk.max_leverage}x`, "dry");
    log(`Would: BUY ${size} ${coin} @ market (~$${market.markPrice})`, "dry");
    log(`Would: SET SL @ $${slPrice.toFixed(4)}`, "dry");
    log(`Would: SET TP @ $${tpPrice.toFixed(4)}`, "dry");
    return;
  }

  // ── LIVE EXECUTION ──

  // 1. Set leverage
  await setLeverage(walletClient, market.assetIndex, risk.max_leverage);
  await sleep(300);

  // 2. Entry order
  const entryResult = await placeMarketOrder(
    walletClient, market.assetIndex, isBuy, size, CONFIG.SLIPPAGE_BPS
  );
  log(`Entry order placed: ${JSON.stringify(entryResult?.response?.data ?? entryResult)}`, "ok");
  await sleep(1000);

  // 3. Verify fill before placing SL/TP
  const position = await getOpenPositions(infoClient, effectiveAddress, coin);
  if (position.length === 0) {
    log("Entry order not filled yet. Waiting 3s...", "warn");
    await sleep(3000);
  }

  // 4. Stop-loss
  const slResult = await placeStopLoss(
    walletClient, market.assetIndex, isBuy, size, slPrice, market.tickSize
  );
  log(`SL placed: ${JSON.stringify(slResult?.response?.data ?? slResult)}`, "ok");
  await sleep(300);

  // 5. Take-profit
  const tpResult = await placeTakeProfit(
    walletClient, market.assetIndex, isBuy, size, tpPrice, market.tickSize
  );
  log(`TP placed: ${JSON.stringify(tpResult?.response?.data ?? tpResult)}`, "ok");

  // 6. Write execution log
  const execLog = {
    signal_file: signal._sourcePath,
    coin,
    executed_at: new Date().toISOString(),
    mark_price_at_entry: market.markPrice,
    size,
    sl_price: slPrice,
    tp_price: tpPrice,
    leverage: risk.max_leverage,
    dry_run: false,
    entry_result: entryResult,
    sl_result: slResult,
    tp_result: tpResult,
  };

  const logPath = path.join(
    CONFIG.SIGNALS_DIR,
    `exec_${coin.toLowerCase()}_${Date.now()}.json`
  );
  fs.writeFileSync(logPath, JSON.stringify(execLog, null, 2));
  log(`Execution log saved: ${logPath}`, "ok");
  log("═══════════════ DONE ═══════════════", "ok");
}

// ─── Monitor mode ─────────────────────────────────────────────────────────────

async function monitorPosition(coin) {
  log(`Monitoring ${coin} position (Ctrl+C to stop)`, "info");
  const { infoClient } = await buildClients();
  const effectiveAddress = CONFIG.USE_VAULT ? CONFIG.VAULT_ADDRESS : CONFIG.WALLET_ADDRESS;

  while (true) {
    try {
      const positions = await getOpenPositions(infoClient, effectiveAddress, coin);
      if (positions.length === 0) {
        log(`No open ${coin} position.`, "warn");
      } else {
        const p = positions[0];
        const pnlColor = p.unrealizedPnl >= 0 ? "\x1b[32m" : "\x1b[31m";
        log(
          `${coin} | size: ${p.size} | entry: $${p.entryPrice} | PnL: ${pnlColor}$${p.unrealizedPnl.toFixed(2)}\x1b[0m | lev: ${p.leverage}x`,
          "info"
        );
      }
    } catch (e) {
      log(`Monitor error: ${e.message}`, "error");
    }
    await sleep(CONFIG.POLL_INTERVAL_MS);
  }
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  // Override DRY_RUN from CLI
  if (args.dryRun === "false" || args.dryRun === false) CONFIG.DRY_RUN = false;

  // Monitor mode
  if (args.monitor) {
    const coin = args.coin ?? args._[0];
    if (!coin) throw new Error("--coin required for --monitor");
    return monitorPosition(coin);
  }

  // Resolve signal path
  let signalPath;
  if (args.signal) {
    signalPath = path.resolve(args.signal);
  } else if (args.latest) {
    signalPath = findLatestSignal(args.coin ?? null);
  } else {
    console.log(`
Usage: node signal-loader.js [options]

Modes:
  --signal <path>     Load a specific signal JSON file
  --latest            Load the most recent signal (optionally filtered by --coin)
  --monitor           Monitor an open position (requires --coin)

Options:
  --coin <ticker>     Filter latest signal or monitor by coin (e.g. SOL, BTC, HYPE)
  --dry-run false     Disable dry-run and go LIVE (default: true = dry run)

Environment variables (required for live trading):
  HL_WALLET_ADDRESS   Your Hyperliquid master wallet address
  HL_PRIVATE_KEY      API wallet private key (from app.hyperliquid.xyz/API)
  HL_VAULT_ADDRESS    (optional) Vault address to trade from
  HL_USE_VAULT        Set to "true" to trade via vault
  DRY_RUN             Set to "false" to enable live trading
  SIGNALS_DIR         Path to signals directory (default: ./playbooks/signals)

Examples:
  # Dry run with latest SOL signal
  node signal-loader.js --latest --coin SOL

  # Live trade with specific signal file
  HL_WALLET_ADDRESS=0x... HL_PRIVATE_KEY=0x... \\
    node signal-loader.js --signal ./playbooks/signals/signal_btc_1h_xxx.json --dry-run false

  # Monitor open BTC position
  node signal-loader.js --monitor --coin BTC

Safety notes:
  - DRY_RUN is true by default. You must explicitly pass --dry-run false to place real orders.
  - Use HL API wallet (generated at app.hyperliquid.xyz/API) — never your main wallet key.
  - Signals not marked ready_for_live will force DRY_RUN=true regardless.
  - Always verify parameters in dry run first before going live.
    `);
    return;
  }

  const signal = loadSignal(signalPath);
  signal._sourcePath = signalPath;

  await executeSignal(signal, CONFIG.DRY_RUN);
}

main().catch((err) => {
  log(err.message, "error");
  console.error(err);
  process.exit(1);
});
