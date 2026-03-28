# HyperVibe

> The agentic harness for autonomous Hyperliquid perpetuals trading.

Six primitives that give Claude everything it needs to trade on your behalf — and nothing more than you've authorised.

```
$ hypervibe

  ✓ HyperVibe running at http://localhost:3001
```

---

## What is HyperVibe?

HyperVibe is [VibeTrade](https://vibetrade-ai.github.io/docs/) — but for **Hyperliquid perps**.

Same harness. Same six primitives. Built for a 24/7 decentralised perps exchange instead of Indian equities.

You describe what you want to trade. The agent figures out how. The harness makes sure it runs reliably, accountably, and only as far as you've permitted.

---

## The Six Primitives

| # | Primitive | Role |
|---|-----------|------|
| 01 | **Market Tooling** | 20 tools: prices, candles, indicators, funding rates, orderbook, positions, account value, vault data |
| 02 | **Heartbeat** | 30s monitoring loop. Evaluates code/time/LLM triggers cheaply. Only wakes the agent when something fires. |
| 03 | **Triggers** | Condition + action pairs. `hard_order` for stops/targets. `reasoning_job` for anything needing analysis. |
| 04 | **Permissions** | Code-level approval gate. Every trade is a structured card you approve or reject. |
| 05 | **Playbooks** | Persistent strategy documents loaded as context on every agent run. |
| 06 | **Learnings** | Immutable trade journal. Every fill logged with reasoning. |

---

## The 20 Tools

### Read tools (no approval)
| Tool | What it does |
|------|-------------|
| `get_price` | Live mid price for any coin(s) |
| `get_all_mids` | All perpetual mid prices |
| `get_positions` | Open positions with unrealized PnL |
| `get_account_value` | Equity, margin used, withdrawable |
| `get_open_orders` | Pending limit orders |
| `get_fills` | Recent trade history |
| `get_funding_payments` | Historical funding P&L |
| `get_candles` | OHLCV data (1m to 1d) |
| `compute_indicators` | RSI, MACD, EMA, SMA, BB, ATR |
| `get_funding_rate` | Current + predicted funding + OI |
| `get_orderbook` | L2 bid/ask depth |
| `get_market_info` | Max leverage, size decimals, 24h volume |
| `get_top_movers` | Biggest 24h movers |
| `search_coins` | Find coins by name |
| `get_vault_details` | Vault TVL, leader, performance |

### Write tools (approval required)
| Tool | What it does |
|------|-------------|
| `place_order` | Queue a market or limit order for approval |
| `cancel_order` | Queue an order cancellation |
| `set_leverage` | Queue a leverage change |

### Primitive management
| Tool | What it does |
|------|-------------|
| `create_trigger` | Create a Heartbeat trigger (code/time/llm) |
| `create_playbook` | Create a new strategy playbook |
| `add_observation` | Log an observation to the journal |

---

## Install and Run

### Requirements
- Node.js ≥ 20
- Anthropic API key (Claude Sonnet for reasoning, Haiku for trigger evaluation)
- Hyperliquid wallet (private key + address for trading)

### Setup

```bash
# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your keys

# Run
npm start
# or: node bin/hypervibe.js
```

### .env configuration

```env
ANTHROPIC_API_KEY=sk-ant-...
HL_PRIVATE_KEY=0x...         # Your wallet private key (never shared, local only)
HL_WALLET_ADDRESS=0x...      # Your wallet address
HL_NETWORK=mainnet           # or: testnet
# HL_VAULT_ADDRESS=0x...     # Optional: trade via a vault
PORT=3001
```

All data is stored locally at `~/.hypervibe/hypervibe.db`. Nothing leaves your machine.

---

## Architecture

```
hypervibe/
├── bin/hypervibe.js          CLI entry point
├── src/
│   ├── server.js             Express + WebSocket server
│   ├── hl/
│   │   ├── api.js            Hyperliquid info + exchange API client
│   │   └── signer.js         EIP-712 action signing (ethers v6 + msgpackr)
│   ├── primitives/
│   │   ├── heartbeat.js      30s monitoring loop
│   │   ├── triggers.js       Trigger CRUD + evaluation
│   │   ├── permissions.js    Approval gate
│   │   ├── playbooks.js      Playbook CRUD + context injection
│   │   └── learnings.js      Trade journal + observations
│   ├── agent/
│   │   ├── tools.js          20 tool definitions + handlers + indicators
│   │   └── agent.js          Claude Sonnet integration
│   └── store/db.js           SQLite (better-sqlite3)
└── public/index.html         Web UI
```

### Signing

HyperVibe implements Hyperliquid's L1 action signing from scratch:
1. Msgpack-encode the action
2. Concatenate with uint64BE nonce and optional vault address  
3. keccak256 hash
4. Sign as EIP-712 `Agent` type with chainId 1337

### Heartbeat evaluation modes

| Mode | Evaluator | Cost | Example |
|------|-----------|------|---------|
| `code` | Pure JS | Zero | `prices["BTC"] <= 90000` |
| `time` | node-cron | Zero | `0 9 * * 1-5` |
| `llm` | Claude Haiku (yes/no) | Minimal | `"Is BTC showing unusual volatility?"` |

---

## Usage Examples

### Ask the agent about your portfolio
> "What are my current positions and unrealized PnL?"

### Get a technical analysis
> "Run RSI, MACD, and Bollinger Bands on HYPE at the 4h timeframe."

### Create a playbook through chat
> "Create a momentum playbook for HYPE. Long bias, 2x leverage, never risk more than 1% of equity per trade, close all positions if daily drawdown exceeds 3%."

### Let the agent trade
> "The HYPE 4h RSI just crossed below 35 with high volume. I think it's oversold. Set up a long with appropriate stops."

### Trigger a morning scan
> Create a time trigger: `0 9 * * 1-5` → `reasoning_job` → "Scan top movers and identify the best setup for the day."

---

## Differences from VibeTrade

| VibeTrade | HyperVibe |
|-----------|-----------|
| NSE / Dhan (Indian equities) | Hyperliquid perps |
| Market hours only | 24/7 |
| INR-denominated | USDC-settled |
| NSE instruments | 100+ perp markets |
| Dhan broker API | Direct on-chain wallet signing |
| P/E, fundamentals, news | Funding rates, OI, vault data |
| Haiku condition eval | Same |
| Telegram approval (WIP) | Same (WIP) |

---

## License

MIT
