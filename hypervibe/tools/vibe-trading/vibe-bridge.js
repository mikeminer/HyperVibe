#!/usr/bin/env node

/**
 * vibe-bridge.js
 * HyperVibe <-> Vibe-Trading integration bridge
 *
 * Gestisce il ciclo di vita del server Python Vibe-Trading come child process.
 * Il server viene avviato automaticamente alla prima chiamata a runSwarm()
 * e rimane attivo per tutta la sessione di HyperVibe.
 *
 * Swarm supportati:
 *   crypto_trading_desk  — funding + liquidation + onchain + risk manager
 *   risk_committee       — drawdown + tail risk + regime + head of risk
 *
 * Usage (da tools.js):
 *   import { runSwarm, stopServer, getServerStatus } from '../tools/vibe-trading/vibe-bridge.js';
 *   const result = await runSwarm('crypto_trading_desk', { target: 'HYPE-USDT', timeframe: 'intraday' });
 */

import { spawn } from 'child_process';
import path      from 'path';
import fs        from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────

const VIBE_BASE_URL  = process.env.VIBE_TRADING_URL || 'http://localhost:8000';
const VIBE_PORT      = parseInt(new URL(VIBE_BASE_URL).port || '8000');
const VIBE_HOST      = new URL(VIBE_BASE_URL).hostname;

// Cerca vibe-trading in posizioni standard relative a HyperVibe
const POSSIBLE_DIRS = [
  process.env.VIBE_TRADING_DIR,                                         // override esplicito
  path.join(__dirname, '..', '..', '..', '..', 'vibe-trading', 'agent'), // ../HyperVibe/vibe-trading/agent
  path.join(__dirname, '..', '..', '..', 'vibe-trading', 'agent'),
  path.join(__dirname, '..', '..', 'vibe-trading', 'agent'),
].filter(Boolean);

function findVibeDir() {
  for (const dir of POSSIBLE_DIRS) {
    if (dir && fs.existsSync(path.join(dir, 'api_server.py'))) return dir;
  }
  return null;
}

// ─── Logger ───────────────────────────────────────────────────────────────────

function log(msg, level = 'info') {
  const ts = new Date().toTimeString().slice(0, 8);
  const prefix = {
    info:  `\x1b[90m${ts}\x1b[0m [\x1b[36mVIBE\x1b[0m]`,
    ok:    `\x1b[90m${ts}\x1b[0m [\x1b[32mVIBE\x1b[0m]`,
    warn:  `\x1b[90m${ts}\x1b[0m [\x1b[33mVIBE\x1b[0m]`,
    error: `\x1b[90m${ts}\x1b[0m [\x1b[31mVIBE\x1b[0m]`,
    swarm: `\x1b[90m${ts}\x1b[0m [\x1b[35mSWARM\x1b[0m]`,
  }[level] ?? `[VIBE]`;
  console.log(`${prefix} ${msg}`);
}

// ─── Server lifecycle ─────────────────────────────────────────────────────────

let _serverProcess = null;
let _serverState   = 'stopped'; // stopped | starting | running | error
let _startPromise  = null;

/**
 * Controlla se il server è raggiungibile via HTTP.
 */
async function isServerHealthy() {
  try {
    const resp = await fetch(`${VIBE_BASE_URL}/docs`, {
      signal: AbortSignal.timeout(3000),
    });
    return resp.ok || resp.status === 200;
  } catch {
    return false;
  }
}

/**
 * Avvia il server Vibe-Trading come child process.
 * Ritorna quando il server è pronto ad accettare richieste.
 */
async function startServer() {
  // Se già in avvio, aspetta quel promise
  if (_startPromise) return _startPromise;
  // Se già running, controlla che sia ancora healthy
  if (_serverState === 'running') {
    if (await isServerHealthy()) return;
    log('Server non risponde — riavvio...', 'warn');
    await stopServer();
  }

  _startPromise = _doStartServer();
  try {
    await _startPromise;
  } finally {
    _startPromise = null;
  }
}

async function _doStartServer() {
  _serverState = 'starting';

  // Controlla se qualcosa è già in ascolto sulla porta (server esterno)
  if (await isServerHealthy()) {
    log(`Server già attivo su ${VIBE_BASE_URL} (avviato esternamente)`, 'ok');
    _serverState = 'running';
    return;
  }

  const vibeDir = findVibeDir();
  if (!vibeDir) {
    _serverState = 'error';
    throw new Error(
      `Vibe-Trading non trovato. Clona il repo accanto a HyperVibe:\n` +
      `  git clone https://github.com/HKUDS/Vibe-Trading.git vibe-trading\n` +
      `Oppure imposta VIBE_TRADING_DIR nel .env di HyperVibe.\n` +
      `Cartelle cercate:\n${POSSIBLE_DIRS.map(d => `  ${d}`).join('\n')}`
    );
  }

  // Verifica .env di Vibe-Trading
  const envPath = path.join(vibeDir, '.env');
  if (!fs.existsSync(envPath)) {
    _serverState = 'error';
    throw new Error(
      `File .env mancante in: ${vibeDir}\n` +
      `Crea ${envPath} con almeno:\n` +
      `  LANGCHAIN_PROVIDER=ollama\n` +
      `  LANGCHAIN_MODEL_NAME=qwen2.5:7b\n` +
      `  OLLAMA_BASE_URL=http://localhost:11434/v1`
    );
  }

  log(`Avvio Vibe-Trading da: ${vibeDir}`, 'info');

  _serverProcess = spawn(
    'python',
    ['api_server.py', '--host', VIBE_HOST, '--port', String(VIBE_PORT)],
    {
      cwd:      vibeDir,
      detached: false,
      stdio:    ['ignore', 'pipe', 'pipe'],
      shell:    process.platform === 'win32',
    }
  );

  // Log stdout/stderr del server con prefisso [VIBE-SRV]
  const srvPrefix = '\x1b[90m[VIBE-SRV]\x1b[0m';
  _serverProcess.stdout?.on('data', (d) => {
    d.toString().split('\n').filter(Boolean).forEach(l => console.log(`${srvPrefix} ${l}`));
  });
  _serverProcess.stderr?.on('data', (d) => {
    d.toString().split('\n').filter(Boolean).forEach(l => console.log(`${srvPrefix} ${l}`));
  });

  _serverProcess.on('exit', (code, signal) => {
    if (_serverState !== 'stopped') {
      log(`Server terminato (code=${code}, signal=${signal})`, code === 0 ? 'info' : 'warn');
    }
    _serverProcess = null;
    _serverState   = 'stopped';
  });

  _serverProcess.on('error', (err) => {
    log(`Errore avvio server: ${err.message}`, 'error');
    _serverState = 'error';
  });

  // Aspetta che il server sia healthy (max 60 secondi)
  const TIMEOUT    = 60_000;
  const POLL       = 1_500;
  const deadline   = Date.now() + TIMEOUT;

  log('Attendo che il server sia pronto...', 'info');

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL));
    if (_serverState === 'error') throw new Error('Server Vibe-Trading fallito in avvio.');
    if (await isServerHealthy()) {
      _serverState = 'running';
      log(`Server pronto su ${VIBE_BASE_URL}`, 'ok');
      return;
    }
  }

  await stopServer();
  _serverState = 'error';
  throw new Error(`Vibe-Trading non risponde dopo ${TIMEOUT / 1000}s. Controlla i log sopra.`);
}

/**
 * Ferma il server Python.
 */
export async function stopServer() {
  if (!_serverProcess) { _serverState = 'stopped'; return; }
  _serverState = 'stopped';
  _serverProcess.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
  if (_serverProcess) _serverProcess.kill('SIGKILL');
  _serverProcess = null;
  log('Server fermato.', 'info');
}

/**
 * Stato attuale del server.
 */
export function getServerStatus() {
  return {
    state:   _serverState,
    url:     VIBE_BASE_URL,
    pid:     _serverProcess?.pid ?? null,
    vibeDir: findVibeDir(),
  };
}

// ─── Swarm runner ─────────────────────────────────────────────────────────────

const SWARM_CONFIGS = {
  crypto_trading_desk: {
    required_vars: ['target', 'timeframe'],
    description:   'Funding + Liquidation + OnChain + Risk Manager → piano esecutivo',
    typical_minutes: '3–8',
  },
  risk_committee: {
    required_vars: ['goal'],
    description:   'Drawdown + Tail Risk + Regime → risk audit completo',
    typical_minutes: '4–10',
  },
};

/**
 * Esegui uno swarm Vibe-Trading e aspetta il risultato.
 *
 * @param {string} presetName  - 'crypto_trading_desk' | 'risk_committee'
 * @param {object} userVars    - variabili richieste dallo swarm
 * @param {object} options
 * @param {number} options.timeoutSeconds - timeout polling (default 300)
 * @returns {object} { swarm, run_id, status, agents_completed, report }
 */
export async function runSwarm(presetName, userVars = {}, options = {}) {
  const config = SWARM_CONFIGS[presetName];
  if (!config) {
    throw new Error(
      `Swarm non supportato: "${presetName}". ` +
      `Disponibili: ${Object.keys(SWARM_CONFIGS).join(', ')}`
    );
  }

  // Validazione variabili richieste
  const missing = config.required_vars.filter(v => !userVars[v]);
  if (missing.length > 0) {
    throw new Error(
      `Swarm "${presetName}" richiede: ${missing.join(', ')}.\n` +
      `Ricevuto: ${JSON.stringify(userVars)}`
    );
  }

  // Avvia il server se non è già running
  await startServer();

  const timeoutMs    = (options.timeoutSeconds || 300) * 1000;
  const POLL_INTERVAL = 5_000;

  log(`Avvio swarm "${presetName}" — ${config.description}`, 'swarm');
  log(`Variabili: ${JSON.stringify(userVars)}`, 'info');
  log(`Timeout: ${timeoutMs / 1000}s | Tempo tipico: ~${config.typical_minutes} min`, 'info');

  // Step 1: crea il run
  const startResp = await fetch(`${VIBE_BASE_URL}/swarm/runs`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ preset_name: presetName, user_vars: userVars }),
    signal:  AbortSignal.timeout(15_000),
  });

  if (!startResp.ok) {
    const txt = await startResp.text();
    throw new Error(`Vibe-Trading API error ${startResp.status}: ${txt}`);
  }

  const { id: runId, status: initStatus } = await startResp.json();
  log(`Run avviato — id: ${runId} | status: ${initStatus}`, 'ok');

  // Step 2: polling
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    let run;
    try {
      const pollResp = await fetch(`${VIBE_BASE_URL}/swarm/runs/${runId}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!pollResp.ok) { log(`Poll HTTP ${pollResp.status} — retry`, 'warn'); continue; }
      run = await pollResp.json();
    } catch (err) {
      log(`Poll error: ${err.message} — retry`, 'warn');
      continue;
    }

    const completed = (run.tasks || []).filter(t => t.status === 'completed').length;
    const total     = (run.tasks || []).length;
    const remaining = Math.round((deadline - Date.now()) / 1000);

    log(`[${runId.slice(0,8)}] status: ${run.status} | tasks: ${completed}/${total} | rimangono: ${remaining}s`, 'swarm');

    if (run.status === 'completed') {
      const tasks       = run.tasks || [];
      const finalTask   = [...tasks].reverse().find(t => t.status === 'completed');
      const report      = run.final_report
                       || finalTask?.output
                       || tasks.map(t => t.output || '').filter(Boolean).join('\n\n---\n\n')
                       || 'Nessun report generato.';

      log(`Swarm completato — ${completed} agenti`, 'ok');
      return {
        swarm:             presetName,
        run_id:            runId,
        status:            'completed',
        agents_completed:  completed,
        agents_total:      total,
        report,
      };
    }

    if (run.status === 'failed' || run.status === 'cancelled') {
      throw new Error(
        `Swarm "${presetName}" terminato con status: ${run.status}\n` +
        `run_id: ${runId} — controlla i log del server Vibe-Trading.`
      );
    }
  }

  throw new Error(
    `Swarm "${presetName}" timeout dopo ${timeoutMs / 1000}s.\n` +
    `run_id: ${runId} — prova ad aumentare poll_timeout_seconds o usa un modello LLM più veloce.`
  );
}

// ─── Cleanup on process exit ──────────────────────────────────────────────────

process.on('exit',    () => { if (_serverProcess) _serverProcess.kill('SIGTERM'); });
process.on('SIGINT',  () => { stopServer().then(() => process.exit(0)); });
process.on('SIGTERM', () => { stopServer().then(() => process.exit(0)); });

// ─── CLI standalone ───────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  (async () => {
    const args = process.argv.slice(2);
    const swarm = args[0];

    if (!swarm || swarm === '--help') {
      console.log(`
Uso: node vibe-bridge.js <swarm> [key=value ...]

Swarm disponibili:
  crypto_trading_desk  target=HYPE-USDT timeframe=intraday
  risk_committee       goal="HYPE long 500 USDC"

Esempi:
  node vibe-bridge.js crypto_trading_desk target=HYPE-USDT timeframe=intraday
  node vibe-bridge.js risk_committee goal="HYPE long position 500 USDC"
  node vibe-bridge.js status
`);
      process.exit(0);
    }

    if (swarm === 'status') {
      console.log(getServerStatus());
      process.exit(0);
    }

    // Parse key=value args
    const userVars = {};
    for (const arg of args.slice(1)) {
      const [k, ...v] = arg.split('=');
      if (k && v.length) userVars[k] = v.join('=');
    }

    try {
      const result = await runSwarm(swarm, userVars, { timeoutSeconds: 600 });
      console.log('\n' + '═'.repeat(60));
      console.log('REPORT FINALE');
      console.log('═'.repeat(60));
      console.log(result.report);
      console.log('═'.repeat(60));
      console.log(`\nAgenti completati: ${result.agents_completed}/${result.agents_total}`);
      console.log(`Run ID: ${result.run_id}`);
    } catch (err) {
      console.error(`\n[ERRORE] ${err.message}`);
      process.exit(1);
    } finally {
      await stopServer();
    }
  })();
}
