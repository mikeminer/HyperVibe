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

You talk to it in chat like it's an expert trader:

> *"Analyze HYPE on the 4h chart and tell me if there's an opportunity"*
> *"Open a long on BTC with stop at $90,000"*
> *"Research a strategy on SOL with autotrade, 1h timeframe, 20 iterations"*
> *"Monitor my positions every hour"*

---

## Playbooks 📋 — Your trading strategy

A Playbook is like an **instruction card** you give the agent with everything it needs to know about you and your strategy:

> *"Hi, I want to trade HYPE. Never risk more than 1% per trade. Always use stop loss. If I lose more than 3% in a day, stop trading."*

The agent reads this card **every time it wakes up** — so it always behaves consistently with your strategy, without you having to re-explain everything from scratch.

You can have multiple playbooks: one for HYPE, one for BTC, one for funding arbitrage — each with its own rules and capital allocation.

**Available playbooks in the Playbook Store:**

| Playbook | Strategy |
|---|---|
| HYPE Momentum Scalp | Fast trades on HYPE, long bias, small accounts |
| Funding Rate Arbitrage | Fading extreme funding rates, market neutral |
| BTC/ETH Trend Follower | Macro swing trades, 1-5 days |
| OpenClaw Autonomous | Full autonomous pipeline |
| Top Mover Breakout | Morning scan, breakout of the day |
| HYPE Fee Monitor & Burn Predictor | Onchain HAF fee monitor, buyback/burn calculation, BOUNCE_HIGH / BURN_SPIKE signals |
| **Autotrade Strategy Research** ⭐ | Autonomous strategy research via LLM backtesting on any HL perpetual |

---

## Autotrade Strategy Research 🔬

The **Autotrade Strategy Research** playbook integrates [autotrade](https://github.com/rv64m/autotrade) into HyperVibe as an autonomous research pipeline.

```
autotrade (LLM backtesting) ──▶ autotrade-bridge.js ──▶ signal JSON ──▶ signal-loader.js ──▶ Hyperliquid
```

**How it works:**
1. You tell it in chat which coin and timeframe you want to study
2. Claude Code autonomously iterates strategies, backtests them on real Hyperliquid data
3. The bridge selects the best strategy and generates a signal JSON
4. The signal is proposed for approval before any live order

**Supported coins:** any perpetual on Hyperliquid (BTC, ETH, SOL, HYPE, SUI, AVAX, TAO...)

**Available timeframes:**

| Timeframe | Available history on HL |
|-----------|-------------------------|
| 15m | ~52 days |
| 1h | ~208 days |
| 4h | ~833 days |
| 1d | ~13 years |

**Requires:** Claude Code CLI (`npm install -g @anthropic-ai/claude-code`) — installed automatically by the v3.2 installer.

---

## Skills 🛠️ — The agent's techniques

A Skill is a **technical manual** you teach the agent once. Every time it needs to do that thing, it opens the manual and follows it to the letter.

The difference: the **Playbook** says *what* to do, the **Skill** says *how* to do it.

**Available skills in the Skill Store:**

| Skill | What it does |
|---|---|
| OpenClaw 3-Agent Pipeline | Monte Carlo analysis + Kelly criterion + exit ladder before every trade |
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

## Repository structure

```
HyperVibe/
├── hypervibe/                    ← main Node.js app
│   ├── tools/
│   │   └── autotrade/            ← strategy research module
│   │       ├── autotrade-bridge.js
│   │       ├── signal-loader.js
│   │       └── autotrade/        ← submodule rv64m/autotrade
│   └── playbooks/
│       └── signals/              ← generated signal JSONs
├── playbooks/                    ← playbook .md files for the Playbook Store
├── skills/                       ← skill .md files for the Skill Store
├── playbooks-registry.json       ← playbook registry
├── skills-registry.json          ← skill registry
└── installer.bat                 ← installer v3.2
```

---

*HyperVibe is open source — [github.com/mikeminer/HyperVibe](https://github.com/mikeminer/HyperVibe)*
