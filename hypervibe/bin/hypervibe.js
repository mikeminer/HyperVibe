#!/usr/bin/env node
/**
 * HyperVibe CLI entry point
 * Usage: hypervibe  (or: node bin/hypervibe.js)
 */

import 'dotenv/config';
import { createApp } from '../src/server.js';
import open from 'open';
import chalk from 'chalk';
import { homedir } from 'os';
import { existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Banner ─────────────────────────────────────────────────────────────────

console.log(chalk.cyan(`
  ██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗ ██╗   ██╗██╗██████╗ ███████╗
  ██║  ██║╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗██║   ██║██║██╔══██╗██╔════╝
  ███████║ ╚████╔╝ ██████╔╝█████╗  ██████╔╝██║   ██║██║██████╔╝█████╗  
  ██╔══██║  ╚██╔╝  ██╔═══╝ ██╔══╝  ██╔══██╗╚██╗ ██╔╝██║██╔══██╗██╔══╝  
  ██║  ██║   ██║   ██║     ███████╗██║  ██║ ╚████╔╝ ██║██████╔╝███████╗
  ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚═════╝ ╚══════╝
`));
console.log(chalk.gray('  The agentic harness for autonomous Hyperliquid trading\n'));

// ── Env setup ──────────────────────────────────────────────────────────────

const envPath = join(process.cwd(), '.env');
if (!existsSync(envPath)) {
  const examplePath = join(__dirname, '..', '.env.example');
  if (existsSync(examplePath)) {
    copyFileSync(examplePath, envPath);
    console.log(chalk.yellow('  ✦  Created .env — add your ANTHROPIC_API_KEY and HL credentials\n'));
    process.exit(0);
  }
}

const {
  ANTHROPIC_API_KEY,
  HL_PRIVATE_KEY,
  HL_WALLET_ADDRESS,
  HL_VAULT_ADDRESS,
  HL_NETWORK = 'mainnet',
  PORT = '3001',
} = process.env;

if (!ANTHROPIC_API_KEY) {
  console.error(chalk.red('  ✗  ANTHROPIC_API_KEY is required — set it in .env'));
  process.exit(1);
}

if (!HL_WALLET_ADDRESS) {
  console.warn(chalk.yellow('  ⚠  HL_WALLET_ADDRESS not set — read-only mode (no account data)'));
}

if (!HL_PRIVATE_KEY) {
  console.warn(chalk.yellow('  ⚠  HL_PRIVATE_KEY not set — approvals will fail (read-only mode)'));
}

// ── Start server ───────────────────────────────────────────────────────────

const port = parseInt(PORT);
const url = `http://localhost:${port}`;

console.log(chalk.white(`  Starting HyperVibe on ${chalk.cyan(url)} ...\n`));

try {
  await createApp({
    port,
    anthropicKey: ANTHROPIC_API_KEY,
    privateKey: HL_PRIVATE_KEY,
    walletAddress: HL_WALLET_ADDRESS,
    vaultAddress: HL_VAULT_ADDRESS,
    network: HL_NETWORK,
  });

  const lines = [
    `  ${chalk.green('✓')} HyperVibe running at ${chalk.cyan(url)}`,
    `  ${chalk.gray('─────────────────────────────────────────────────')}`,
    `  ${chalk.gray('Wallet:   ')} ${chalk.white(HL_WALLET_ADDRESS ?? 'not configured')}`,
    `  ${chalk.gray('Network:  ')} ${chalk.white(HL_NETWORK)}`,
    `  ${chalk.gray('Vault:    ')} ${chalk.white(HL_VAULT_ADDRESS ?? 'none')}`,
    `  ${chalk.gray('Signer:   ')} ${chalk.white(HL_PRIVATE_KEY ? 'configured ✓' : 'not configured (read-only)')}`,
    `  ${chalk.gray('Data:     ')} ${chalk.white(`~/.hypervibe/hypervibe.db`)}`,
    `  ${chalk.gray('─────────────────────────────────────────────────')}`,
    `  ${chalk.gray('Click ')}${chalk.cyan(url)}${chalk.gray(' if it doesn\'t open automatically')}`,
    `  ${chalk.gray('Press Ctrl+C to stop')}`,
    '',
  ];
  console.log(lines.join('\n'));

  // Open browser
  setTimeout(() => open(url), 800);

} catch (err) {
  console.error(chalk.red(`\n  ✗  Failed to start: ${err.message}\n`));
  process.exit(1);
}
