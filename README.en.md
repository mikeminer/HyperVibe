# HyperVibe 🚀

**HyperVibe is an AI agent that trades autonomously on Hyperliquid on your behalf.**

You tell it what you want. It analyzes markets, proposes trades, and waits for your approval before executing any order. No trade fires without your explicit consent.

---

## What does it actually do?

* **Analyzes** crypto markets 24/7 using real technical indicators (RSI, MACD, Bollinger Bands)
* **Proposes trades** with full reasoning: why to enter, where to set the stop, where to take profit
* **Waits for your approval** — every order appears as a card with an Approve / Reject button
* **Manages positions** automatically with native stop-loss and take-profit on the exchange
* **Learns** by recording every trade with its reasoning in a journal

Talk to it in chat like it's an expert trader:

> *"Analyze HYPE on the 4h chart and tell me if there's an opportunity"*
> *"Open a BTC long with stop at $90,000"*
> *"Monitor my positions every hour"*

---

## Tri-Hybrid Engine 🧠 — Intelligent AI Routing

HyperVibe includes a three-tier AI engine that routes each request to the cheapest model capable of responding with sufficient quality.

```
Every prompt → Value Score → Selected tier
────────────────────────────────────────────
score < 0.30  →  Local LLaMA   (free, instant)
score < 0.60  →  OpenAI GPT    (fast, cheap)
score ≥ 0.60  →  Anthropic Claude (max quality)
```

The **value score** measures four dimensions of the prompt:

| Metric | Weight | What it measures |
|---|---|---|
| `reasoning_depth` | 40% | How much reasoning the response requires |
| `uncertainty` | 30% | Ambiguity and open questions |
| `impact` | 20% | Financial / operational relevance |
| `complexity` | 10% | Technical and linguistic complexity |

If the selected model's response has **low confidence**, the system automatically escalates to the next tier. Every request's cost is logged to `tri_hybrid_engine/logs/engine.jsonl`.

### HTTP Bridge (native HyperVibe integration)

The bridge exposes a `/v1/messages` endpoint compatible with the Anthropic SDK. HyperVibe points to `http://localhost:3002` instead of `api.anthropic.com` — zero changes to the Node.js code.

```
HyperVibe (Node.js :3001)
        │
        │  POST /v1/messages
        ▼
Tri-Hybrid Bridge (:3002)
        │
        ├─ LLaMA  (local Ollama)
        ├─ OpenAI GPT
        └─ Claude
```

**Available endpoints:**

| Endpoint | Description |
|---|---|
| `POST /v1/messages` | Anthropic-compatible — used by HyperVibe |
| `GET  /v1/health` | Status of all three tiers |
| `GET  /v1/stats` | Session statistics and costs |
| `POST /v1/score` | Compute the value score of a prompt |

---

## Playbooks 📋 — Your trading strategy

A Playbook is like an **instruction card** you give the agent containing everything it needs to know about you and your strategy:

> *"Hi, I want to trade HYPE. Never risk more than 1% per trade. Always use a stop loss. If I lose more than 3% in a day, stop trading."*

The agent reads this card **every time** it wakes up — so it always behaves consistently with your strategy, without you having to re-explain everything.

**Playbooks available in the Playbook Store:**

| Playbook | Strategy |
|---|---|
| HYPE Momentum Scalp | Fast HYPE trades, long bias, small accounts |
| Funding Rate Arbitrage | Fading extreme funding rates, market neutral |
| BTC/ETH Trend Follower | Macro swing trades, 1-5 days |
| OpenClaw Autonomous | Full automatic pipeline |
| Top Mover Breakout | Morning scan, breakout of the day |

---

## Skills 🛠️ — Agent techniques

A Skill is a **technical manual** you teach the agent once.

**Skills available in the Skill Store:**

| Skill | What it does |
|---|---|
| OpenClaw 3-Agent Pipeline | Monte Carlo analysis + Kelly criterion + exit ladder |
| Funding Rate Filter | When to avoid trades due to high funding |
| Unified Account Sizing | Position sizing for Unified Account |
| HYPE Momentum | Specific rules for trading HYPE |
| Drawdown Guard | When to stop trading to protect capital |

---

## What you need

| What | Where to get it |
|---|---|
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) |
| **Hyperliquid wallet** | [app.hyperliquid.xyz](https://app.hyperliquid.xyz) |
| **Windows PC** with internet | — |
| *(optional)* **OpenAI API key** | [platform.openai.com](https://platform.openai.com) — for Tri-Hybrid mid tier |
| *(optional)* **Ollama** | [ollama.ai](https://ollama.ai) — for free local tier |

---

## Installation — one command

Open **Command Prompt (CMD)** and paste this:

```
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/mikeminer/HyperVibe/main/installer.bat' -OutFile install-hypervibe.bat" && install-hypervibe.bat
```

The program handles everything automatically:

1. Installs Node.js if not present
2. Installs Git if not present
3. Downloads HyperVibe from GitHub
4. Asks for credentials (API key, wallet, private key)
5. **AI engine choice:** Anthropic / local Qwen / local Gemma / **Tri-Hybrid** ← new
6. Starts the app and opens the browser

---

## The Six Primitives

| # | Primitive | Role |
|---|---|---|
| 01 | **Market Tooling** | 20 tools: live prices, candles, indicators, funding, orderbook, positions |
| 02 | **Heartbeat** | Monitoring loop every 30s |
| 03 | **Triggers** | Condition + action: automatic stop-losses, morning scans, alerts |
| 04 | **Permissions** | Approval gate — no trade without your consent |
| 05 | **Playbooks** | Strategy document loaded on every agent run |
| 06 | **Learnings** | Immutable journal of every trade with full reasoning |

---

## Security

* Your private key **never leaves your computer**
* All orders require your explicit consent
* No trade fires automatically without you pressing Approve
* Data is saved locally only (`~/.hypervibe/`)

---

## After installation

The browser opens at **http://localhost:3001**

To restart HyperVibe: double-click **INSTALL_v3.4.bat** in the repo folder.

---

*HyperVibe is open source — [github.com/mikeminer/HyperVibe](https://github.com/mikeminer/HyperVibe)*
