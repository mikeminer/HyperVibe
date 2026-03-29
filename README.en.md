# HyperVibe 🚀

**HyperVibe is an AI agent that trades autonomously on Hyperliquid on your behalf.**

You tell it what you want to do. It analyses the markets, proposes trades, and waits for your approval before executing any order. No trade goes through without your explicit consent.

---

## What does it actually do?

- **Analyses** crypto markets 24/7 using real technical indicators (RSI, MACD, Bollinger Bands)
- **Proposes trades** with full reasoning: why to enter, where to put the stop, where to take profit
- **Waits for your approval** — every order appears as a card with an Approve / Reject button
- **Manages positions** automatically with native stop-loss and take-profit orders on the exchange
- **Learns** by logging every trade with its reasoning in a trade journal

You talk to it in chat like a professional trader:
> *"Analyse HYPE on the 4h chart and tell me if there's an opportunity"*
> *"Open a long on BTC with a stop at $90,000"*
> *"Monitor my positions every hour"*

---

## Playbooks 📋 — Your trading strategy

A Playbook is like an **instruction card** you give the agent with everything it needs to know about you and your strategy:

> *"Hi, I want to trade HYPE. Never risk more than 1% per trade. Always use a stop loss. If I lose more than 3% in a day, stop trading."*

The agent reads this card **every time it wakes up** — so it always behaves consistently with your strategy, without you having to explain everything again from scratch.

You can have multiple playbooks: one for HYPE, one for BTC, one for funding arbitrage — each with its own rules and capital allocation.

**Playbooks available in the Playbook Store:**
| Playbook | Strategy |
|---|---|
| HYPE Momentum Scalp | Quick trades on HYPE, long bias, small accounts |
| Funding Rate Arbitrage | Fading extreme funding rates, market neutral |
| BTC/ETH Trend Follower | Macro swing trades, 1-5 days |
| OpenClaw Autonomous | Full autonomous pipeline |
| Top Mover Breakout | Morning scan, daily breakout |

---

## Skills 🛠️ — The agent's techniques

A Skill is a **technical manual** you teach the agent once. Every time it needs to do that thing, it opens the manual and follows it exactly.

The difference: the **Playbook** says *what* to do, the **Skill** says *how* to do it.

**Skills available in the Skill Store:**
| Skill | What it does |
|---|---|
| OpenClaw 3-Agent Pipeline | Monte Carlo analysis + Kelly criterion + exit ladder before every trade |
| Funding Rate Filter | When to avoid trades due to extreme funding |
| Unified Account Sizing | Position sizing rules for Hyperliquid Unified Account |
| HYPE Momentum | Specific rules for trading HYPE perpetuals |
| Drawdown Guard | When to stop trading to protect capital |

---

## What you need

| What | Where to get it |
|------|-----------------|
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) |
| **Hyperliquid wallet** | [app.hyperliquid.xyz](https://app.hyperliquid.xyz) |
| **Windows PC** with internet | — |

---

## Installation — one single command

Open **Command Prompt (CMD)** and paste this:

```
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/mikeminer/HyperVibe/main/installer.bat' -OutFile install-hypervibe.bat" && install-hypervibe.bat
```

**How to open CMD:** press **Windows + R** → type `cmd` → press Enter → paste the command.

The installer does everything automatically:
1. Installs Node.js if you don't have it
2. Installs Git if you don't have it
3. Downloads HyperVibe from GitHub
4. Asks for your credentials (API key, wallet address, private key)
5. Launches the app and opens your browser

---

## The Six Primitives

| # | Primitive | Role |
|---|---|---|
| 01 | **Market Tooling** | 20 tools: live prices, candles, indicators, funding, orderbook, positions |
| 02 | **Heartbeat** | 30s monitoring loop — wakes the agent only when something fires |
| 03 | **Triggers** | Condition + action: automatic stop-losses, morning scans, alerts |
| 04 | **Permissions** | Approval gate — no trade without your consent |
| 05 | **Playbooks** | Strategy document loaded on every agent run |
| 06 | **Learnings** | Immutable journal of every trade with full reasoning |

---

## Security

- Your private key **never leaves your computer**
- Every order requires your explicit approval
- No trade executes automatically without you pressing Approve
- All data is stored locally only (`~/.hypervibe/`)

---

## After installation

Your browser opens at **http://localhost:3001**

To restart HyperVibe: double-click **StartHyperVibe.bat** in the same folder as the installer.

---

*HyperVibe is open source — [github.com/mikeminer/HyperVibe](https://github.com/mikeminer/HyperVibe)*
