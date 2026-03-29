## OpenClaw Autonomous — Strategy Plan

**Objective:** Fully autonomous multi-coin trading using the complete OpenClaw 3-agent pipeline. The agent scans, analyses, sizes, and manages positions without manual input. Every decision is logged.

**Required skills:** openclaw-3-agent, funding-rate-filter, drawdown-guard, unified-account-sizing

---

### Allocation & Capital Rules

- **Total allocation:** $15 USDC (full account for small accounts)
- **Max concurrent positions:** 2
- **Max per position:** 1% equity risk
- **Leverage:** Max 3x (OpenClaw Executor enforces this)
- **Universe:** Top 10 coins by 24h volume on Hyperliquid

---

### Autonomous Operation Loop

This playbook runs on automatic triggers. Human input only required for approvals.

**Morning Scan (08:00 daily):**
1. Fetch top movers and top volume coins
2. Run BRAIN (Agent_01) on top 3 candidates
3. If any grade ≥ B+, run full EXECUTOR + HARVESTER pipeline
4. Queue approval for best setup

**Hourly Monitor:**
1. Check open positions: RSI, MACD, funding rate
2. If exit conditions met: queue reduce/close
3. If position healthy: update trailing stop in journal note
4. Check drawdown guard — halt if limits hit

**Event-Driven:**
- Funding extreme alert → fade analysis
- Price breaks key level (code trigger) → reassess

---

### Coin Selection Criteria

For each candidate coin, before running OpenClaw:
1. 24h volume > $50M (liquidity check)
2. Not USDC, USDT, or stablecoins
3. Not already in open position
4. Fetch market info: max leverage ≥ 5x (confirms liquidity)

Preferred coins (in order): HYPE, BTC, ETH, SOL, AVAX, BNB

---

### Full Pipeline (per trade)

**BRAIN output required:**
- Grade ≥ B+ (skip grade B and C)
- Bull or bear probability ≥ 60%

**EXECUTOR output:**
- Size respects unified-account-sizing rules
- Position fits within free margin (20% buffer)

**HARVESTER output:**
- R:R ≥ 1.8:1 (slightly higher than standard — autonomous requires edge)
- SL and TP1 triggers created immediately

---

### Automation Triggers to Create at Setup

Create all these triggers after activating the playbook:

```
1. Morning Scan
   type: time
   expr: 0 8 * * *
   action: reasoning_job
   context: "Morning autonomous scan. Fetch top movers. Run full OpenClaw pipeline on top 3 candidates by volume. Grade ≥ B+ required. Queue best setup for approval."

2. Hourly Position Review
   type: time
   expr: 0 * * * *
   action: reasoning_job
   context: "Hourly review. Check all open positions: RSI, MACD trend, funding rate. Apply drawdown-guard. Exit if exit conditions met. Update journal."

3. Funding Extreme Alert
   type: llm
   expr: "Is any coin's funding rate above 0.15% or below -0.12%?"
   action: reasoning_job
   context: "Extreme funding detected. Identify coin. Run OpenClaw fade analysis. Queue approval if grade ≥ B+."

4. Evening Review
   type: time
   expr: 0 21 * * *
   action: reasoning_job
   context: "End of day review. Summarize: trades taken, P&L, drawdown, what worked and what didn't. Add key observations to Learnings. Update playbook state."
```

---

### State Machine

| State | Meaning | Next action |
|---|---|---|
| `scanning` | No position, looking | Run morning scan or event trigger |
| `position_open` | 1 position active | Run hourly monitor |
| `two_positions` | Max positions reached | Monitor only, no new entries |
| `paused` | Drawdown limit hit | Wait for reset condition |
| `review` | End-of-day review mode | Log observations, reset to scanning |

---

### Approval Philosophy

This playbook is designed for minimal interruption. The agent does the work; you approve or reject. Expected approval frequency: 1–3 per day.

If you're unavailable: pending approvals expire after 30 minutes for market orders. The agent will note the expired approval in Learnings and rescan on the next trigger.

---

### Risk Rules (Hard Limits — Agent Cannot Override)

- Daily drawdown > 3% → `paused` state, no entries
- 3 consecutive losses → mandatory 2h pause, next size -50%
- Funding cost > 0.3% per position per day → close position
- Never trade 30 minutes before/after major macro events (Fed, CPI)
- Always leave $2 USDC free — never fully deploy
