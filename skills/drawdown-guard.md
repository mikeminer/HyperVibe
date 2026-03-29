---
name: drawdown-guard
description: Daily and weekly drawdown circuit breaker. Check at the start of every reasoning job and before any new entry.
tags: risk, drawdown, circuit-breaker
---

# Drawdown Guard

Run this check at the start of every session and before any new position entry.

## How to Calculate Drawdown

Fetch `get_fills` for today (days=1) and sum closed PnL:

```
daily_pnl = sum(fill.closedPnl for fill in today_fills)
daily_pnl_pct = daily_pnl / account_equity * 100
```

## Circuit Breakers

| Threshold | Action |
|---|---|
| Daily PnL > -1% | Green — trade normally |
| Daily PnL -1% to -2% | Yellow — reduce new position sizes by 50% |
| Daily PnL -2% to -3% | Orange — close any open positions, no new entries for 2 hours |
| Daily PnL < -3% | **RED — HALT all trading for the rest of the day** |

| Weekly PnL | Action |
|---|---|
| > -5% | Normal |
| -5% to -8% | Reduce size 50% for remainder of week |
| < -8% | Halt all trading until Monday |

## Consecutive Loss Rule

After 3 consecutive losing trades:
- Mandatory pause: wait for next candle close on the primary timeframe
- Reduce next position size by 50%
- Require grade A or higher (from OpenClaw Brain) to enter

Count consecutive losses from `get_fills`:
```
last_3 = fills[-3:]
if all(f.closedPnl < 0 for f in last_3):
  APPLY CONSECUTIVE LOSS RULES
```

## Win Rate Monitoring

Calculate from last 20 fills:
- Win rate < 40% → require grade A+ for new entries
- Win rate < 30% → halt, review strategy, add observation to journal

## Always Report

At the start of each reasoning job, include:
```
Drawdown check:
  Today PnL: $X.XX (X.X%) → [Green/Yellow/Orange/RED]
  Weekly PnL: $X.XX (X.X%)
  Consecutive losses: X
  Status: TRADING NORMAL | REDUCED SIZE | HALTED
```

If status is HALTED, do not queue any trade. Instead add an observation to Learnings explaining why trading was halted and what conditions need to be met to resume.
