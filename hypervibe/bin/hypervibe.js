#!/usr/bin/env node
/**
 * HyperVibe CLI entry point
 * Usage: hypervibe  (or: node bin/hypervibe.js)
 */

import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carica sempre il .env dalla cartella del progetto (un livello sopra bin/)
config({ path: join(__dirname, '..', '.env') });

console.log('DEBUG PK:', process.env.HL_PRIVATE_KEY ? process.env.HL_PRIVATE_KEY.slice(0,10)+'...' : 'VUOTA');
console.log('DEBUG ENV:', new URL('../.env', import.meta.url).pathname);

import { createApp } from '../src/server.js';
import open from 'open';
import chalk from 'chalk';
import { existsSync, copyFileSync } from 'fs';

// ── Banner ────────────────────────────────────────────────────────────────────

console.log(chalk.cyan(`
  ██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗ ██╗   ██╗██╗██████╗ ███████╗
  ██║  ██║╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗██║   ██║██║██╔══██╗██╔════╝
  ███████║ ╚████╔╝ ██████╔╝█████╗  ██████╔╝██║   ██║██║██████╔╝█████╗
  ██╔══██║  ╚██╔╝  ██╔═══╝ ██╔══╝  ██╔══██╗╚██╗ ██╔╝██║██╔══██╗██╔══╝
  ██║  ██║   ██║   ██║     ███████╗██║  ██║ ╚████╔╝ ██║██████╔╝███████╗
  ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚═════╝ ╚══════╝
`));
console.log(chalk.gray('  The agentic harness for autonomous Hyperliquid trading\n'));

// ── Env setup ─────────────────────────────────────────────────────────────────

const envPath     = join(__dirname, '..', '.env');
const examplePath = join(__dirname, '..', '.env.example');

// Strip placeholder values (anything containing '...')
const isReal = (v) => v && !v.includes('...');

const {
  HL_NETWORK = 'mainnet',
  PORT = '3001',
} = process.env;

// ── Provider selection ────────────────────────────────────────────────────────

const PROVIDER = (process.env.PROVIDER || 'anthropic').toLowerCase();

const ANTHROPIC_API_KEY = isReal(process.env.ANTHROPIC_API_KEY) ? process.env.ANTHROPIC_API_KEY : null;
const HL_PRIVATE_KEY    = isReal(process.env.HL_PRIVATE_KEY)    ? process.env.HL_PRIVATE_KEY    : null;
const HL_WALLET_ADDRESS = isReal(process.env.HL_WALLET_ADDRESS) ? process.env.HL_WALLET_ADDRESS : null;
const HL_VAULT_ADDRESS  = isReal(process.env.HL_VAULT_ADDRESS)  ? process.env.HL_VAULT_ADDRESS  : null;

// Validazione chiave AI — solo se il provider lo richiede
if (PROVIDER === 'anthropic' && !ANTHROPIC_API_KEY) {
  console.error(chalk.red('  ✗  ANTHROPIC_API_KEY is required — set it in .env'));
  process.exit(1);
}

if (PROVIDER === 'ollama') {
  const ollamaModel = process.env.OLLAMA_MODEL;
  if (!ollamaModel) {
    console.error(chalk.red('  ✗  OLLAMA_MODEL is required — set it in .env (es: gemma4:26b)'));
    process.exit(1);
  }
  const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  console.log(chalk.gray(`  Provider: Ollama · Model: ${ollamaModel} · Base: ${ollamaBase}\n`));
}

if (!HL_WALLET_ADDRESS) {
  console.warn(chalk.yellow('  ⚠  HL_WALLET_ADDRESS not set — read-only mode (no account data)'));
}

if (!HL_PRIVATE_KEY) {
  console.warn(chalk.yellow('  ⚠  HL_PRIVATE_KEY not set — approvals will fail (read-only mode)'));
}

// ── Start server ──────────────────────────────────────────────────────────────

const port = parseInt(PORT);
const url  = `http://localhost:${port}`;

console.log(chalk.white(`  Starting HyperVibe on ${chalk.cyan(url)} ...\n`));

try {
  await createApp({
    port,
    anthropicKey:   ANTHROPIC_API_KEY,
    privateKey:     HL_PRIVATE_KEY,
    walletAddress:  HL_WALLET_ADDRESS,
    vaultAddress:   HL_VAULT_ADDRESS,
    network:        HL_NETWORK,
  });

  const lines = [
    `  ${chalk.green('✔')} HyperVibe running at ${chalk.cyan(url)}`,
    `  ${chalk.gray('─'.repeat(49))}`,
    `  ${chalk.gray('Provider: ')} ${chalk.white(PROVIDER)}`,
    `  ${chalk.gray('Wallet:   ')} ${chalk.white(HL_WALLET_ADDRESS ?? 'not configured')}`,
    `  ${chalk.gray('Network:  ')} ${chalk.white(HL_NETWORK)}`,
    `  ${chalk.gray('Vault:    ')} ${chalk.white(HL_VAULT_ADDRESS ?? 'none')}`,
    `  ${chalk.gray('Signer:   ')} ${chalk.white(HL_PRIVATE_KEY ? 'configured ✔' : 'not configured (read-only)')}`,
    `  ${chalk.gray('─'.repeat(49))}`,
    `  ${chalk.gray('Click ')}${chalk.cyan(url)}${chalk.gray(' if it doesn\'t open automatically')}`,
    `  ${chalk.gray('Press Ctrl+C to stop')}`,
    '',
  ];
  console.log(lines.join('\n'));

  setTimeout(() => open(url), 800);

} catch (err) {
  console.error(chalk.red(`\n  ✗  Failed to start: ${err.message}\n`));
  process.exit(1);
}
