/**
 * configure.js — Setup HyperVibe
 *
 * Scelte AI engine:
 *   [1] Anthropic API        — Claude cloud, a pagamento
 *   [2] Qwen 2.5 7B locale   — Ollama, gratis, ~5GB RAM ⭐ consigliato
 *   [3] Qwen 2.5 14B locale  — Ollama, gratis, ~9GB RAM
 *   [4] Gemma 4 26B locale   — Ollama, gratis, ~20GB RAM (richiede Ollama ≥0.20.1)
 *   [5] 🧠 Smart (Ollama + Anthropic fallback)  — Usa Ollama gratis, scala ad Anthropic solo se necessario
 */

import fs       from 'fs';
import path     from 'path';
import readline from 'readline';
import { execSync, spawnSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath   = path.join(__dirname, '.env');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

console.log('\n╔══════════════════════════════════════╗');
console.log('║     HyperVibe — Setup iniziale       ║');
console.log('╚══════════════════════════════════════╝\n');
console.log('Scegli il motore AI:\n');
console.log('  [1] ☁️   Anthropic API        — Claude cloud, a pagamento, qualità massima');
console.log('  [2] 💻  Qwen 2.5 7B locale    — Ollama, gratis, ~5GB RAM, veloce ⭐');
console.log('  [3] 💻  Qwen 2.5 14B locale   — Ollama, gratis, ~9GB RAM, tool calling solido');
console.log('  [4] 💻  Gemma 4 26B locale    — Ollama, gratis, ~20GB RAM (richiede Ollama ≥0.20.1)');
console.log('  [5] 🧠  Smart routing          — Ollama gratis + Anthropic solo se necessario\n');

let choice = '';
while (!['1', '2', '3', '4', '5'].includes(choice)) {
  choice = (await ask('Scelta [1/2/3/4/5]: ')).trim();
}

let envLines = [];

// ─── Anthropic only ───────────────────────────────────────────────────────────

if (choice === '1') {
  console.log('\n✔  Modalità: Anthropic API\n');
  envLines.push('PROVIDER=anthropic');
  envLines.push('CLAUDE_MODEL=claude-sonnet-4-20250514');

  const key = (await ask('Anthropic API Key (sk-ant-…): ')).trim();
  if (!key.startsWith('sk-')) console.warn('⚠️  Formato chiave insolito, salvata comunque.');
  envLines.push(`ANTHROPIC_API_KEY=${key}`);
}

// ─── Ollama (logic condivisa per scelte 2/3/4) ────────────────────────────────

async function setupOllama(model, label, requiresNewOllama = false) {
  console.log(`\n✔  Modalità: Ollama locale — ${label}\n`);

  if (requiresNewOllama) {
    console.log('⚠️  Nota: Gemma 4 richiede Ollama ≥ v0.20.1 per il tool calling.');
    console.log('   Aggiorna con: ollama --version  →  se < 0.20.1, scarica da ollama.com\n');
  }

  envLines.push('PROVIDER=ollama');
  envLines.push(`OLLAMA_MODEL=${model}`);
  envLines.push('OLLAMA_BASE_URL=http://localhost:11434');

  // Verifica Ollama installato
  try {
    execSync('ollama --version', { stdio: 'ignore' });
    console.log('✅ Ollama installato');
  } catch {
    console.warn('⚠️  Ollama non trovato. Installalo da: https://ollama.com/download');
    await ask("   Premi Invio dopo l'installazione…");
    try {
      execSync('ollama --version', { stdio: 'ignore' });
    } catch {
      console.error("❌ Ollama non trovato. Riesegui configure.js dopo l'installazione.");
      rl.close(); process.exit(1);
    }
  }

  // Avvia ollama serve se non attivo
  let running = false;
  try {
    const r = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
    running = r.ok;
  } catch { /* non attivo */ }

  if (!running) {
    console.log('🔄 Avvio Ollama in background…');
    spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' }).unref();
    await new Promise(r => setTimeout(r, 2500));
    console.log('✅ Ollama avviato');
  } else {
    console.log('✅ Ollama già in esecuzione');
  }

  // Scarica modello se mancante
  console.log(`\n🔍 Controllo ${model}...`);
  try {
    const json     = await (await fetch('http://localhost:11434/api/tags')).json();
    const hasModel = (json.models || []).some(m => m.name.startsWith(model.split(':')[0]));

    if (hasModel) {
      console.log(`✅ ${model} già installato`);
    } else {
      console.log(`\n📥 Download ${model} — attendere...\n`);
      const r = spawnSync('ollama', ['pull', model], { stdio: 'inherit' });
      if (r.status === 0) console.log(`\n✅ ${model} installato`);
      else console.warn(`\n⚠️  Download fallito. Esegui: ollama pull ${model}`);
    }
  } catch (e) {
    console.warn(`⚠️  Impossibile verificare: ${e.message}`);
    console.warn(`   Esegui: ollama pull ${model}`);
  }
}

if (choice === '2') await setupOllama('qwen2.5:7b',  'Qwen 2.5 7B');
if (choice === '3') await setupOllama('qwen2.5:14b', 'Qwen 2.5 14B');
if (choice === '4') await setupOllama('gemma4:26b',  'Gemma 4 26B MoE', true);

// ─── Smart routing ────────────────────────────────────────────────────────────

if (choice === '5') {
  console.log('\n✔  Modalità: 🧠 Smart routing\n');
  console.log('   • Ollama (Qwen 2.5 7B) per tutte le call di routine → gratis');
  console.log('   • Anthropic API solo se Ollama fallisce o produce risposta invalida\n');

  envLines.push('PROVIDER=smart');
  envLines.push('OLLAMA_MODEL=qwen2.5:7b');
  envLines.push('OLLAMA_BASE_URL=http://localhost:11434');
  envLines.push('SMART_ESCALATE_ON_TOOL_FAILURE=true');

  const key = (await ask('Anthropic API Key (sk-ant-…) — usata solo come fallback: ')).trim();
  if (!key.startsWith('sk-')) console.warn('⚠️  Formato chiave insolito, salvata comunque.');
  envLines.push(`ANTHROPIC_API_KEY=${key}`);
  envLines.push('CLAUDE_MODEL=claude-haiku-4-5-20251001');  // Haiku = più economico per fallback

  console.log('\n💡 Tip: il fallback usa claude-haiku (il più economico). Modifica CLAUDE_MODEL in .env per cambiarlo.');

  await setupOllama('qwen2.5:7b', 'Qwen 2.5 7B (provider principale)');
}

// ─── Hyperliquid ──────────────────────────────────────────────────────────────

console.log('\n─── Hyperliquid ─────────────────────────────────────────\n');

const walletAddress = (await ask('Wallet Address (0x…): ')).trim();
const privateKey    = (await ask('Private Key   (0x…): ')).trim();

if (!walletAddress.startsWith('0x') || walletAddress.length !== 42)
  console.warn('⚠️  Wallet address potrebbe non essere valido.');
if (!privateKey.startsWith('0x') || privateKey.length !== 66)
  console.warn('⚠️  Private key potrebbe non essere valida.');

envLines.push(`HL_WALLET_ADDRESS=${walletAddress}`);
envLines.push(`HL_PRIVATE_KEY=${privateKey}`);

const useVault = (await ask('Usi un vault Hyperliquid? (s/N): ')).toLowerCase();
if (useVault === 's' || useVault === 'y') {
  const vaultAddr = (await ask('Vault Address (0x…): ')).trim();
  envLines.push(`HL_VAULT_ADDRESS=${vaultAddr}`);
}

envLines.push('PORT=3001');

// ─── Scrivi .env ──────────────────────────────────────────────────────────────

fs.writeFileSync(envPath, envLines.join('\n') + '\n', 'utf8');
console.log('\n✅ .env salvato');
console.log('✨ Avvia HyperVibe con: node server.js\n');

rl.close();
