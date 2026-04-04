/**

- configure.js — Setup HyperVibe
- Tre scelte: Anthropic API | qwen2.5:14b | gemma4:26b
  */

import fs   from ‘fs’;
import path from ‘path’;
import readline from ‘readline’;
import { execSync, spawnSync, spawn } from ‘child_process’;
import { fileURLToPath } from ‘url’;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath   = path.join(__dirname, ‘.env’);

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

console.log(’\n╔══════════════════════════════════════╗’);
console.log(‘║     HyperVibe — Setup iniziale       ║’);
console.log(‘╚══════════════════════════════════════╝\n’);
console.log(‘Scegli il motore AI:\n’);
console.log(’  [1] ☁️   Anthropic API  — Claude cloud, a pagamento, qualità massima’);
console.log(’  [2] 💻  Qwen 2.5 14B   — Locale, gratuito, ~9GB RAM, tool calling solido ⭐’);
console.log(’  [3] 💻  Gemma 4 26B    — Locale, gratuito, ~20GB RAM, Google MoE (richiede Ollama ≥0.20.1)\n’);

let choice = ‘’;
while (![‘1’, ‘2’, ‘3’].includes(choice)) {
choice = (await ask(’Scelta [1/2/3]: ’)).trim();
}

let envLines = [];

// ─── Anthropic ────────────────────────────────────────────────────────────────

if (choice === ‘1’) {
console.log(’\n✔  Modalità: Anthropic API\n’);
envLines.push(‘PROVIDER=anthropic’);
envLines.push(‘CLAUDE_MODEL=claude-sonnet-4-20250514’);

const key = (await ask(’Anthropic API Key (sk-ant-…): ’)).trim();
if (!key.startsWith(‘sk-’)) console.warn(‘⚠️  Formato chiave insolito, salvata comunque.’);
envLines.push(`ANTHROPIC_API_KEY=${key}`);
}

// ─── Ollama (shared logic) ────────────────────────────────────────────────────

if (choice === ‘2’ || choice === ‘3’) {
const model = choice === ‘2’ ? ‘qwen2.5:14b’ : ‘gemma4:26b’;
const label = choice === ‘2’ ? ‘Qwen 2.5 14B’ : ‘Gemma 4 26B MoE’;

console.log(`\n✔  Modalità: Ollama locale — ${label}\n`);

if (choice === ‘3’) {
console.log(‘⚠️  Nota: Gemma 4 richiede Ollama ≥ v0.20.1 per il tool calling.’);
console.log(’   Aggiorna con: ollama –version  →  se < 0.20.1, scarica da ollama.com\n’);
}

envLines.push(‘PROVIDER=ollama’);
envLines.push(`OLLAMA_MODEL=${model}`);
envLines.push(‘OLLAMA_BASE_URL=http://localhost:11434’);

// Verifica Ollama installato
try {
execSync(‘ollama –version’, { stdio: ‘ignore’ });
console.log(‘✅ Ollama installato’);
} catch {
console.warn(‘⚠️  Ollama non trovato. Installalo da: https://ollama.com/download’);
await ask(’   Premi Invio dopo l'installazione…’);
try {
execSync(‘ollama –version’, { stdio: ‘ignore’ });
} catch {
console.error(‘❌ Ollama non trovato. Riesegui configure.js dopo l'installazione.’);
rl.close(); process.exit(1);
}
}

// Avvia ollama serve se non attivo
let running = false;
try {
const { default: fetch } = await import(‘node-fetch’);
const r = await fetch(‘http://localhost:11434/api/tags’, { signal: AbortSignal.timeout(2000) });
running = r.ok;
} catch { /* non attivo */ }

if (!running) {
console.log(‘🔄 Avvio Ollama in background…’);
spawn(‘ollama’, [‘serve’], { detached: true, stdio: ‘ignore’ }).unref();
await new Promise(r => setTimeout(r, 2500));
console.log(‘✅ Ollama avviato’);
} else {
console.log(‘✅ Ollama già in esecuzione’);
}

// Scarica modello se mancante
console.log(`\n🔍 Controllo ${model}...`);
try {
const { default: fetch } = await import(‘node-fetch’);
const json     = await (await fetch(‘http://localhost:11434/api/tags’)).json();
const hasModel = (json.models || []).some(m => m.name.startsWith(model.split(’:’)[0]));

```
if (hasModel) {
  console.log(`✅ ${model} già installato`);
} else {
  console.log(`\n📥 Download ${model} — attendere...\n`);
  const r = spawnSync('ollama', ['pull', model], { stdio: 'inherit' });
  if (r.status === 0) console.log(`\n✅ ${model} installato`);
  else console.warn(`\n⚠️  Download fallito. Esegui: ollama pull ${model}`);
}
```

} catch (e) {
console.warn(`⚠️  Impossibile verificare: ${e.message}`);
console.warn(`   Esegui: ollama pull ${model}`);
}
}

// ─── Hyperliquid ──────────────────────────────────────────────────────────────

console.log(’\n─── Hyperliquid ─────────────────────────────────────────\n’);

const walletAddress = (await ask(’Wallet Address (0x…): ’)).trim();
const privateKey    = (await ask(’Private Key   (0x…): ’)).trim();

if (!walletAddress.startsWith(‘0x’) || walletAddress.length !== 42)
console.warn(‘⚠️  Wallet address potrebbe non essere valido.’);
if (!privateKey.startsWith(‘0x’) || privateKey.length !== 66)
console.warn(‘⚠️  Private key potrebbe non essere valida.’);

envLines.push(`HL_WALLET_ADDRESS=${walletAddress}`);
envLines.push(`HL_PRIVATE_KEY=${privateKey}`);

const useVault = (await ask(’Usi un vault Hyperliquid? (s/N): ’)).toLowerCase();
if (useVault === ‘s’ || useVault === ‘y’) {
const vaultAddr = (await ask(’Vault Address (0x…): ’)).trim();
envLines.push(`HL_VAULT_ADDRESS=${vaultAddr}`);
}

envLines.push(‘PORT=3001’);

// ─── Scrivi .env ──────────────────────────────────────────────────────────────

fs.writeFileSync(envPath, envLines.join(’\n’) + ‘\n’, ‘utf8’);
console.log(’\n✅ .env salvato’);
console.log(‘✨ Avvia HyperVibe con: node server.js\n’);

rl.close();