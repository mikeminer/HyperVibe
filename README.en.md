![HyperVibe](https://private-user-images.githubusercontent.com/7491777/571052171-159736d3-af69-4499-a7bb-215ffe463ff6.png)

# HyperVibe by pappardelle.eth 🚀

**HyperVibe is an AI agent that trades autonomously on Hyperliquid on your behalf.**

You tell it what you want. It analyzes markets, proposes trades, and waits for your approval before executing any order. No trade goes through without your explicit consent.

> 🇮🇹 [Versione italiana → README.md](./README.md)

---

## What does it do?

- **Analyzes** crypto markets 24/7 using real technical indicators (RSI, MACD, Bollinger Bands)
- **Proposes trades** with full reasoning: why to enter, where to set the stop, where to take profit
- **Waits for your approval** — every order appears as a card with an Approve / Reject button
- **Manages positions** automatically with native stop-loss and take-profit on the exchange
- **Researches strategies** via autonomous LLM-driven backtesting on any Hyperliquid perpetual
- **Learns** by recording every trade with its full reasoning in a journal

---

## How to talk to the agent

Open your browser at **http://localhost:3001** and chat with it like an expert trader.

### 📊 Market analysis
```
Analyze HYPE on the 4h chart and tell me if there's an opportunity
```
```
Compute RSI, MACD and Bollinger Bands on SOL 1h
```
```
Show me today's top movers on Hyperliquid
```
```
Check the funding rate on ETH and BTC
```
```
What is my total account value?
```

### 📈 Trading
```
Open a long on BTC with stop at $90,000
```
```
Close 50% of my HYPE position
```
```
Set 3x leverage on SOL
```
```
Show me my open positions and PnL
```
```
Cancel all open orders on ETH
```

### 🔬 Autotrade Strategy Research
```
Research a strategy on SOL, timeframe 1h, 20 iterations
```
```
Run autotrade on BTC 4h with 30 iterations and minimum profit factor 1.3
```
```
Run an autonomous backtest on HYPE timeframe 1h
```
```
Show me the research result for SOL
```
```
Load the latest signal for ETH and propose the trade
```
```
Run autotrade on ETH 1h with max drawdown -20% and max leverage 2x
```

### ⏰ Monitoring and automation
```
Monitor my positions every hour
```
```
Create an alert if HYPE drops below $15
```
```
Create a trigger that scans markets every morning at 8:00
```
```
Show me my trade journal for the last 7 days
```

### 📋 Playbooks and strategies
```
Load the HYPE Momentum Scalp playbook
```
```
Activate the Autotrade Strategy Research playbook on SOL
```
```
Create a new playbook for funding arbitrage on HYPE
```

---

## Autotrade Strategy Research 🔬

Integrates [autotrade](https://github.com/rv64m/autotrade) into HyperVibe as an autonomous research pipeline.

```
autotrade (LLM backtesting) ──▶ signal JSON ──▶ trade proposal ──▶ your approval ──▶ Hyperliquid
```

### Full workflow from chat

**Step 1 — Start research:**
```
Research a strategy on SOL, timeframe 1h, 20 iterations
```
> Agent replies: *"Research started on SOL (1h, 20 iterations). Estimated time: ~50 minutes."*

**Step 2 — Load the result:**
```
Show me the research result for SOL
```
> Agent shows: Profit Factor, Max Drawdown, Sharpe, SL%, TP%, Leverage, Size.

**Step 3 — Trade proposal:**
```
Propose the trade based on the SOL signal
```
> Card appears with **Approve / Reject** button.

**Step 4 — You approve → trade goes live.**

### Available timeframes and history

| Timeframe | Available history on HL |
|-----------|-------------------------|
| 15m | ~52 days |
| 1h | ~208 days |
| 4h | ~833 days |
| 1d | ~13 years |

---

## Playbooks 📋

**Available playbooks in the Playbook Store:**

| Playbook | Strategy |
|---|---|
| HYPE Momentum Scalp | Fast trades on HYPE, long bias, small accounts |
| Funding Rate Arbitrage | Fading extreme funding rates, market neutral |
| BTC/ETH Trend Follower | Macro swing trades, 1-5 days |
| OpenClaw Autonomous | Full autonomous pipeline |
| Top Mover Breakout | Morning scan, breakout of the day |
| HYPE Fee Monitor & Burn Predictor | Onchain HAF fee monitor, BOUNCE_HIGH / BURN_SPIKE signals |
| **Autotrade Strategy Research** ⭐ | Autonomous strategy research via LLM backtesting on any HL perpetual |

---

## Skills 🛠️

**Available skills in the Skill Store:**

| Skill | What it does |
|---|---|
| OpenClaw 3-Agent Pipeline | Monte Carlo analysis + Kelly criterion + exit ladder |
| Funding Rate Filter | When to avoid trades due to high funding |
| Unified Account Sizing | Position sizing calculation for Unified Account |
| HYPE Momentum | Specific rules for trading HYPE |
| Drawdown Guard | When to stop trading to protect capital |

---

## What you need

| What | Where to get it |
|---|---|
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) |
| **Hyperliquid wallet** | [app.hyperliquid.xyz](https://app.hyperliquid.xyz) |
| **Windows PC** with internet | — |
| **Claude Code CLI** *(for Autotrade)* | Installed automatically by the installer |

---

## Installation — one command

Open the **Command Prompt (CMD)** and paste this:

```
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/mikeminer/HyperVibe/main/installer.bat' -OutFile installer.bat" && installer.bat
```

**How to open CMD:** press **Windows + R** → type `cmd` → press Enter → paste the command.

The v3.2 installer does everything automatically:

1. Installs Node.js if you don't have it
2. Installs Git if you don't have it
3. Downloads HyperVibe from GitHub (with autotrade submodule)
4. Asks if you want to install the **Autotrade Strategy Research** module *(optional, ~200MB)*
5. Installs Claude Code CLI for the LLM loop *(if Autotrade is selected)*
6. Choice of AI engine: Anthropic API, local Qwen 2.5 14B, or local Gemma 4 26B
7. Asks for credentials (API key, wallet, private key)
8. Starts the app and opens the browser

---

## The Six Primitives

| # | Primitive | Role |
|---|---|---|
| 01 | **Market Tooling** | 20 tools: live prices, candles, indicators, funding, orderbook, positions |
| 02 | **Heartbeat** | Monitoring loop every 30s — wakes the agent only when needed |
| 03 | **Triggers** | Condition + action: automatic stop-losses, morning scans, alerts |
| 04 | **Permissions** | Approval gate — no trade without your consent |
| 05 | **Playbooks** | Strategy document loaded at every agent run |
| 06 | **Learnings** | Immutable journal of every trade with full reasoning |

---

## Supported AI engines

| Engine | Type | Notes |
|---|---|---|
| **Anthropic API** | Cloud | Claude Sonnet, maximum quality, paid |
| **Qwen 2.5 14B** | Local | Free, ~9GB RAM, recommended for daily use |
| **Gemma 4 26B MoE** | Local | Free, ~20GB RAM, high quality |

---

## Security

- Your private key **never leaves your computer**
- All orders require your explicit consent
- No trade executes automatically without you pressing Approve
- Data is saved locally only
- For Autotrade: always use the Hyperliquid **API wallet**, never your main key

---

## After installation

The browser opens at **http://localhost:3001**

To restart HyperVibe: double-click **StartHyperVibe.bat** in the installation folder.

---

*HyperVibe is open source — [github.com/mikeminer/HyperVibe](https://github.com/mikeminer/HyperVibe)*
