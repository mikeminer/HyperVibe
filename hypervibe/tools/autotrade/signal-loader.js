#!/usr/bin/env node

/**
 * signal-loader.js
 * HyperVibe — Autotrade Signal Loader
 * Compatible: @nktkas/hyperliquid ^0.32.2, ethers ^6.x
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import { HttpTransport, InfoClient, ExchangeClient } from "@nktkas/hyperliquid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  WALLET_ADDRESS:   process.env.HL_WALLET_ADDRESS ?? "",
  PRIVATE_KEY:      process.env.HL_PRIVATE_KEY    ?? "",
  VAULT_ADDRESS:    process.env.HL_VAULT_ADDRESS  ?? "",
  USE_VAULT:        process.env.HL_USE_VAULT      === "true",
  SIGNALS_DIR:      process.env.SIGNALS_DIR       ?? path.join(__dirname, "..", "..", "playbooks", "signals"),
  DRY_RUN:          process.env.DRY_RUN           !== "false",
  POLL_INTERVAL_MS: Number(process.env.POLL_MS    ?? 5000),
};

function log(msg, level = "info") {
  const ts = new Date().toTimeString().slice(0, 8);
  const prefix = {
    info:  `\x1b[90m${ts}\x1b[0m [\x1b[36mINFO\x1b[0m]`,
    ok:    `\x1b[90m${ts}\x1b[0m [\x1b[32m OK \x1b[0m]`,
    warn:  `\x1b[90m${ts}\x1b[0m [\x1b[33mWARN\x1b[0m]`,
    error: `\x1b[90m${ts}\x1b[0m [\x1b[31mERR \x1b[0m]`,
    trade: `\x1b[90m${ts}\x1b[0m [\x1b[35mTRADE\x1b[0m]`,
    dry:   `\x1b[90m${ts}\x1b[0m [\x1b[33m DRY\x1b[0m]`,
  }[level] ?? `[${level}]`;
  console.log(`${prefix} ${msg}`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      args[key] = (!next || next.startsWith("--")) ? true : argv[++i];
    } else { args._.push(argv[i]); }
  }
  return args;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function roundToDecimals(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.floor(value * factor) / factor;
}

function loadSignal(signalPath) {
  if (!fs.existsSync(signalPath)) throw new Error(`Signal non trovato: ${signalPath}`);
  const signal = JSON.parse(fs.readFileSync(signalPath, "utf-8"));
  if (!signal.coin) throw new Error("Signal mancante: coin");
  if (!signal.signal_params) throw new Error("Signal mancante: signal_params");
  if (!signal.ready_for_live) {
    log("Signal NON ready_for_live — DRY_RUN forzato.", "warn");
    signal.warnings?.forEach((w) => log(`  ⚠ ${w}`, "warn"));
    CONFIG.DRY_RUN = true;
  }
  return signal;
}

function findLatestSignal(coin) {
  if (!fs.existsSync(CONFIG.SIGNALS_DIR)) throw new Error(`Cartella signals non trovata: ${CONFIG.SIGNALS_DIR}`);
  const files = fs.readdirSync(CONFIG.SIGNALS_DIR)
    .filter((f) => f.endsWith(".json") && f.startsWith("signal_") && (!coin || f.includes(coin.toLowerCase())))
    .map((f) => ({ file: f, mtime: fs.statSync(path.join(CONFIG.SIGNALS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) throw new Error(`Nessun signal trovato per ${coin ?? "qualsiasi coin"}`);
  const latest = path.join(CONFIG.SIGNALS_DIR, files[0].file);
  log(`Signal caricato: ${files[0].file}`, "info");
  return latest;
}

function buildClients() {
  if (!CONFIG.PRIVATE_KEY)    throw new Error("HL_PRIVATE_KEY non impostato.");
  if (!CONFIG.WALLET_ADDRESS) throw new Error("HL_WALLET_ADDRESS non impostato.");
  const transport      = new HttpTransport();
  const infoClient     = new InfoClient({ transport });
  const wallet         = new ethers.Wallet(CONFIG.PRIVATE_KEY);
  const exchangeClient = new ExchangeClient({
    wallet, transport,
    ...(CONFIG.USE_VAULT && CONFIG.VAULT_ADDRESS ? { vaultAddress: CONFIG.VAULT_ADDRESS } : {}),
  });
  return { infoClient, exchangeClient };
}

async function getMarketInfo(infoClient, coin) {
  const [meta, ctxs] = await infoClient.metaAndAssetCtxs();
  const idx = meta.universe.findIndex((m) => m.name === coin.toUpperCase());
  if (idx === -1) throw new Error(`Coin ${coin} non trovato su Hyperliquid.`);
  return {
    assetIndex: idx,
    name:       meta.universe[idx].name,
    szDecimals: meta.universe[idx].szDecimals,
    markPrice:  parseFloat(ctxs[idx].markPx),
    funding:    parseFloat(ctxs[idx].funding),
  };
}

async function getAccountBalance(infoClient, address) {
  const state = await infoClient.clearinghouseState({ user: address });
  return {
    equity:    parseFloat(state.crossMarginSummary?.accountValue ?? 0),
    available: parseFloat(state.withdrawable ?? 0),
  };
}

async function getOpenPositions(infoClient, address, coin) {
  const state = await infoClient.clearinghouseState({ user: address });
  return (state.assetPositions ?? [])
    .filter((p) => parseFloat(p.position?.szi ?? 0) !== 0)
    .filter((p) => !coin || p.position?.coin === coin.toUpperCase())
    .map((p) => ({
      coin:          p.position.coin,
      size:          parseFloat(p.position.szi),
      entryPrice:    parseFloat(p.position.entryPx),
      unrealizedPnl: parseFloat(p.position.unrealizedPnl),
      leverage:      parseFloat(p.position.leverage?.value ?? 1),
    }));
}

async function executeSignal(signal, dryRun) {
  const { coin, signal_params } = signal;
  const risk  = signal_params.risk;
  const isBuy = true;

  log("═══════════════════════════════════════════", "info");
  log(`Coin       : ${coin}`,                                              "info");
  log(`Timeframe  : ${signal.timeframe}`,                                  "info");
  log(`Strategia  : ${signal.strategy_file}`,                              "info");
  log(`PF         : ${signal.backtest_metrics.profit_factor}`,             "info");
  log(`Max DD     : ${signal.backtest_metrics.max_drawdown_pct}%`,         "info");
  log(`Leverage   : ${risk.max_leverage}x`,                                "info");
  log(`SL         : -${risk.stop_loss_pct}%`,                              "info");
  log(`TP         : +${risk.take_profit_pct}%`,                            "info");
  log(`Size       : ${risk.position_size_pct}% equity`,                    "info");
  log(`Modalità   : ${dryRun ? "\x1b[33mDRY RUN\x1b[0m" : "\x1b[32mLIVE\x1b[0m"}`, "info");
  log("═══════════════════════════════════════════", "info");

  const { infoClient, exchangeClient } = buildClients();
  const addr    = CONFIG.USE_VAULT ? CONFIG.VAULT_ADDRESS : CONFIG.WALLET_ADDRESS;
  const market  = await getMarketInfo(infoClient, coin);
  const balance = await getAccountBalance(infoClient, addr);

  log(`Mark price : $${market.markPrice}`,                                          "info");
  log(`Account    : $${balance.equity.toFixed(2)} eq | $${balance.available.toFixed(2)} avail`, "info");
  log(`Funding    : ${(market.funding * 100).toFixed(4)}%`,                         "info");

  const existing = await getOpenPositions(infoClient, addr, coin);
  if (existing.length > 0) {
    log(`Posizione ${coin} già aperta (size=${existing[0].size}) — skip.`, "warn");
    return;
  }

  const size    = roundToDecimals((balance.available * risk.position_size_pct / 100 * risk.max_leverage) / market.markPrice, market.szDecimals);
  const slPrice = market.markPrice * (1 - risk.stop_loss_pct  / 100);
  const tpPrice = market.markPrice * (1 + risk.take_profit_pct / 100);

  log(`Order size : ${size} ${coin} (~$${(size * market.markPrice).toFixed(2)})`, "info");
  log(`SL price   : $${slPrice.toFixed(4)}`, "info");
  log(`TP price   : $${tpPrice.toFixed(4)}`, "info");

  if (size <= 0) { log("Size = 0 — balance insufficiente.", "error"); return; }

  if (dryRun) {
    log("DRY RUN — nessun ordine piazzato. Usa --dry-run false per andare live.", "dry");
    log(`Would: SET leverage ${risk.max_leverage}x`,                   "dry");
    log(`Would: BUY ${size} ${coin} @ market (~$${market.markPrice})`, "dry");
    log(`Would: SET SL @ $${slPrice.toFixed(4)}`,                     "dry");
    log(`Would: SET TP @ $${tpPrice.toFixed(4)}`,                     "dry");
    return;
  }

  // LIVE
  log("Imposto leverage...", "trade");
  await exchangeClient.updateLeverage({ asset: market.assetIndex, isCross: true, leverage: risk.max_leverage });
  await sleep(300);

  log("Entry order...", "trade");
  const entryResult = await exchangeClient.order({
    orders: [{ a: market.assetIndex, b: isBuy, p: "0", s: String(size), r: false, t: { market: {} } }],
    grouping: "na",
  });
  log(`Entry OK: ${JSON.stringify(entryResult?.response?.data ?? entryResult)}`, "ok");
  await sleep(1500);

  log("Stop-loss...", "trade");
  const slResult = await exchangeClient.order({
    orders: [{ a: market.assetIndex, b: !isBuy, p: String(slPrice.toFixed(4)), s: String(size), r: true,
      t: { trigger: { isMarket: true, triggerPx: String(slPrice.toFixed(4)), tpsl: "sl" } } }],
    grouping: "na",
  });
  log(`SL OK: ${JSON.stringify(slResult?.response?.data ?? slResult)}`, "ok");
  await sleep(300);

  log("Take-profit...", "trade");
  const tpResult = await exchangeClient.order({
    orders: [{ a: market.assetIndex, b: !isBuy, p: String(tpPrice.toFixed(4)), s: String(size), r: true,
      t: { trigger: { isMarket: true, triggerPx: String(tpPrice.toFixed(4)), tpsl: "tp" } } }],
    grouping: "na",
  });
  log(`TP OK: ${JSON.stringify(tpResult?.response?.data ?? tpResult)}`, "ok");

  if (!fs.existsSync(CONFIG.SIGNALS_DIR)) fs.mkdirSync(CONFIG.SIGNALS_DIR, { recursive: true });
  const execLog = { signal_file: signal._sourcePath, coin, executed_at: new Date().toISOString(),
    mark_price_at_entry: market.markPrice, size, sl_price: slPrice, tp_price: tpPrice,
    leverage: risk.max_leverage, entry_result: entryResult, sl_result: slResult, tp_result: tpResult };
  const logPath = path.join(CONFIG.SIGNALS_DIR, `exec_${coin.toLowerCase()}_${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify(execLog, null, 2));
  log(`Execution log: ${logPath}`, "ok");
  log("════════════════ DONE ════════════════", "ok");
}

async function monitorPosition(coin) {
  log(`Monitor ${coin} ogni ${CONFIG.POLL_INTERVAL_MS / 1000}s (Ctrl+C per fermare)`, "info");
  const { infoClient } = buildClients();
  const addr = CONFIG.USE_VAULT ? CONFIG.VAULT_ADDRESS : CONFIG.WALLET_ADDRESS;
  while (true) {
    try {
      const positions = await getOpenPositions(infoClient, addr, coin);
      if (positions.length === 0) {
        log(`Nessuna posizione aperta su ${coin}.`, "warn");
      } else {
        const p = positions[0];
        const color = p.unrealizedPnl >= 0 ? "\x1b[32m" : "\x1b[31m";
        log(`${coin} | size: ${p.size} | entry: $${p.entryPrice} | PnL: ${color}$${p.unrealizedPnl.toFixed(2)}\x1b[0m | lev: ${p.leverage}x`, "info");
      }
    } catch (e) { log(`Errore: ${e.message}`, "error"); }
    await sleep(CONFIG.POLL_INTERVAL_MS);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.dryRun === "false" || args.dryRun === false) CONFIG.DRY_RUN = false;

  if (args.monitor) {
    const coin = args.coin ?? args._[0];
    if (!coin) throw new Error("--coin richiesto per --monitor");
    return monitorPosition(coin);
  }

  let signalPath;
  if (args.signal)      signalPath = path.resolve(args.signal);
  else if (args.latest) signalPath = findLatestSignal(args.coin ?? null);
  else {
    console.log(`
Uso: node signal-loader.js [opzioni]

  --signal <path>      Carica signal JSON specifico
  --latest             Usa l'ultimo signal disponibile
  --coin <ticker>      Filtra per coin (SOL, BTC, HYPE...)
  --dry-run false      Va LIVE (default: dry run)
  --monitor            Monitora posizione aperta (richiede --coin)

Esempi:
  node signal-loader.js --latest --coin SOL
  node signal-loader.js --latest --coin BTC --dry-run false
  node signal-loader.js --monitor --coin HYPE
    `);
    return;
  }

  const signal = loadSignal(signalPath);
  signal._sourcePath = signalPath;
  await executeSignal(signal, CONFIG.DRY_RUN);
}

main().catch((err) => { log(err.message, "error"); process.exit(1); });
