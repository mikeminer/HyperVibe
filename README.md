# HyperVibe 🚀

> The agentic harness for autonomous Hyperliquid perpetuals trading.

Six primitives that give Claude everything it needs to trade on your behalf — and nothing more than you've authorised.

```
$ npm start

  ✓ HyperVibe running at http://localhost:3001
```

---

## What is HyperVibe?

HyperVibe is a **harness** — a structured environment that lets a large language model reason about markets, act on your behalf, and accumulate judgement over time, without you having to babysit it.

The core insight is that LLMs are already capable of sophisticated market reasoning. What they lack is **infrastructure**: a live connection to the market, a sense of time, a memory that persists across sessions, a monitoring loop that doesn't cost a fortune, and a trust model that ensures nothing happens without your consent. HyperVibe supplies all of it.

The result is a trading agent you can give a strategy to in plain English — and then leave alone.

---

## The Six Primitives

| # | Primitive | Role |
|---|-----------|------|
| 01 | **Market Tooling** | 20 tools: live prices, candles, indicators, funding rates, orderbook, positions, account value, vault data |
| 02 | **Heartbeat** | 30s monitoring loop. Evaluates code/time/LLM triggers cheaply. Only wakes the agent when something fires. |
| 03 | **Triggers** | Condition + action pairs. `hard_order` for stops/targets. `reasoning_job` for anything needing analysis. |
| 04 | **Permissions** | Code-level approval gate. Every trade is a structured card you approve or reject. |
| 05 | **Playbooks** | Persistent strategy documents loaded as context on every agent run. |
| 06 | **Learnings** | Immutable trade journal. Every fill logged with full reasoning. |

---

## The 20 Tools

### Read tools (no approval required)

| Tool | What it does |
|------|-------------|
| `get_price` | Live mid price for one or more coins |
| `get_all_mids` | All perpetual mid prices in one call |
| `get_positions` | Open positions with unrealized PnL, entry price, mark price, leverage, liquidation price |
| `get_account_value` | Total equity, margin used, withdrawable balance |
| `get_open_orders` | Pending limit orders |
| `get_fills` | Recent trade history with fees and closed PnL |
| `get_funding_payments` | Historical funding payments received / paid |
| `get_candles` | OHLCV data from 1m to 1d |
| `compute_indicators` | RSI, MACD, EMA, SMA, Bollinger Bands, ATR — computed from live OHLCV |
| `get_funding_rate` | Current and predicted funding rate + Open Interest |
| `get_orderbook` | L2 bid/ask depth with quantities |
| `get_market_info` | Max leverage, size decimals, 24h volume, open interest |
| `get_top_movers` | Biggest 24h gainers and losers across all perps |
| `search_coins` | Find perpetual markets by name or symbol |
| `get_vault_details` | Vault TVL, leader address, follower count, performance history |

### Write tools (approval required)

| Tool | What it does |
|------|-------------|
| `place_order` | Queue a market or limit order for user approval |
| `cancel_order` | Queue cancellation of a pending order |
| `set_leverage` | Queue a leverage change for a coin |

### Primitive management

| Tool | What it does |
|------|-------------|
| `create_trigger` | Create a Heartbeat trigger (code / time / llm) |
| `create_playbook` | Create a new strategy playbook |
| `add_observation` | Log an observation to the trade journal |

---

## Installation

### Requirements

- **Node.js ≥ 20** → download from [nodejs.org](https://nodejs.org)
- **Anthropic API key** → get from [console.anthropic.com](https://console.anthropic.com)
- **Hyperliquid wallet** → private key + public address

### Step 1 — Clone the repository

```bash
git clone https://github.com/mikeminer/HyperVibe.git
cd HyperVibe/hypervibe
```

### Step 2 — Install dependencies

```bash
npm install
```

> ⚠️ **Windows:** `better-sqlite3` is a native module and requires C++ build tools.
> If installation fails, first install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and select **"Desktop development with C++"**.

### Step 3 — Configure credentials

```bash
# Linux / macOS
cp .env.example .env

# Windows
copy .env.example .env
```

Open `.env` in any text editor and fill in your values:

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Required to see account data
HL_WALLET_ADDRESS=0x...

# Required to execute trades
HL_PRIVATE_KEY=0x...

# Network: mainnet (default) or testnet
HL_NETWORK=mainnet

# Optional: trade via a vault address
# HL_VAULT_ADDRESS=0x...

# Server port (default: 3001)
PORT=3001
```

> 🔒 **Security:** your private key never leaves your machine. Order signing happens locally before the signed payload is sent to Hyperliquid's exchange endpoint. All data is stored in `~/.hypervibe/hypervibe.db`.

### Step 4 — Run

```bash
npm start
```

The browser opens automatically at **http://localhost:3001**.
Documentation is available at **http://localhost:3001/docs.html**.

---

## Usage Examples

### Talk to your portfolio
> *"What are my current positions and unrealized PnL?"*

### Technical analysis
> *"Run RSI, MACD, and Bollinger Bands on HYPE at the 4h timeframe."*

### Create a playbook through chat
> *"Create a momentum playbook for HYPE. Long bias, 2x leverage, never risk more than 1% of equity per trade, close all positions if daily drawdown exceeds 3%."*

### Let the agent trade
> *"The HYPE 4h RSI just crossed below 35 with high volume. I think it's oversold. Set up a long with appropriate stops."*

### Automated morning scan
> Create a time trigger: `0 8 * * *` → `reasoning_job` → *"Scan top movers and identify the best setup for the day."*

---

## How the Heartbeat Works

The Heartbeat is a cheap monitoring loop that runs every 30 seconds. It evaluates trigger conditions without waking Claude Sonnet — the main agent only runs when a condition actually fires.

| Mode | Evaluated by | Cost per tick | Example |
|------|-------------|----------------|---------|
| `code` | Pure JavaScript | ~$0 | `prices["BTC"] <= 90000` |
| `time` | node-cron | ~$0 | `0 8 * * *` (every morning at 8am) |
| `llm` | Claude Haiku (yes/no only) | Minimal | *"Is HYPE funding above 0.1% per hour?"* |

### Trigger action types

| Type | What happens | Agent involved? | Typical use |
|------|-------------|----------------|-------------|
| `hard_order` | Trade executes immediately in pure code — no reasoning, no approval queue. Pre-authorised at trigger creation. | No | Stop-losses, take-profits, emergency closes |
| `reasoning_job` | Claude Sonnet wakes with trigger context and Playbook loaded, analyses the situation, and may queue approvals. | Yes | Morning scans, position reviews, event-driven analysis |

---

## The Approval Gate

Every trade the agent proposes appears in the UI as a **structured approval card** showing:
- Coin, direction (BUY/SELL), size, order type
- The complete reasoning that led to the recommendation
- Every signal that fired

One click to **Approve** or **Reject**. No trade executes without explicit consent.

`hard_order` triggers (stop-losses, targets) are pre-authorised at trigger creation time — consent is given when you define the exact condition and order parameters upfront.

---

## Architecture

```
hypervibe/
├── bin/hypervibe.js          CLI entry point
├── public/
│   ├── index.html            Chat UI + approval cards
│   └── docs.html             Documentation
├── src/
│   ├── server.js             Express + WebSocket server
│   ├── hl/
│   │   ├── api.js            Hyperliquid REST client (info + exchange)
│   │   └── signer.js         EIP-712 action signing (ethers v6 + msgpackr)
│   ├── primitives/
│   │   ├── heartbeat.js      30s monitoring loop
│   │   ├── triggers.js       Trigger CRUD + evaluation + node-cron
│   │   ├── permissions.js    Approval gate
│   │   ├── playbooks.js      Playbook CRUD + context injection
│   │   └── learnings.js      Trade journal + observations
│   ├── agent/
│   │   ├── tools.js          20 tool definitions + technical indicators
│   │   └── agent.js          Claude Sonnet integration
│   └── store/db.js           Local SQLite (better-sqlite3)
```

### On-chain Signing

HyperVibe implements Hyperliquid's L1 action signing from scratch:
1. Msgpack-encode the action object
2. Concatenate with uint64BE nonce and optional vault address
3. keccak256 hash the result
4. Sign as EIP-712 `Agent` type against Hyperliquid's L1 domain (chainId 1337)

The private key never leaves the local machine.

---

## Troubleshooting

### `better-sqlite3` fails to install (Windows)
```powershell
# From PowerShell as Administrator
npm install --global windows-build-tools
npm install
```
Or install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) manually.

### Git push fails — credentials rejected
GitHub no longer accepts passwords if 2FA is enabled. Generate a **Personal Access Token**:
- GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
- Required scope: `repo`
- Use the token as your password when git prompts you

### Browser doesn't open automatically
Open manually: **http://localhost:3001**

### Read-only mode — approvals fail
If `HL_PRIVATE_KEY` is not set in `.env`, the app runs in read-only mode: you can view positions, prices, and analysis, but approvals will fail. Add your private key to enable live trading.

### Node.js version error
```bash
node --version   # must be >= 20.0.0
```
If it's older, download the LTS version from [nodejs.org](https://nodejs.org).

---

## Differences from VibeTrade

| VibeTrade | HyperVibe |
|-----------|-----------|
| NSE / Dhan (Indian equities) | Hyperliquid perpetuals |
| Market hours only | 24/7 |
| INR-denominated | USDC-settled |
| NSE instruments | 100+ perp markets |
| Dhan broker API | Direct on-chain wallet signing |
| P/E, fundamentals, news feeds | Funding rates, Open Interest, vault data |
| Haiku trigger evaluation | Same |
| Telegram approval push (WIP) | Same (WIP) |

---

## License

MIT — free to use, modify, and distribute.
