---
name: openclaw-3-agent
description: Use this skill when analyzing any potential trade entry. Runs the full OpenClaw 3-agent pipeline: Monte Carlo probability → Kelly sizing → Harvester exit ladder. Always apply before queuing a place_order.
tags: analysis, sizing, exit, monte-carlo, kelly
---

# OpenClaw — 3-Agent Trading Pipeline

Every trade decision runs through three sequential agents. Do not skip any phase.

---

## AGENT_01 · BRAIN — Monte Carlo Analysis

**Trigger:** Any potential trade setup detected.

**Process:**
1. Fetch candles (4h preferred, minimum 100 bars) + compute RSI, MACD, EMA_9, EMA_21, SMA_50, BB, ATR
2. Fetch current funding rate and open interest
3. Fetch L2 orderbook (top 10 levels) — identify bid/ask imbalance
4. Run mental Monte Carlo simulation (10,000 scenarios):
   - Bullish scenario: price > EMA_21, RSI 40–65, MACD histogram positive, funding < 0.05%/hr → weight +1
   - Bearish scenario: price < EMA_21, RSI > 75 or < 25, funding > 0.1%/hr → weight -1
   - Neutral: conflicting signals → weight 0
   - Volatility multiplier: if ATR > 2% of price, widen confidence interval by 30%
5. Output probability distribution:
   - **Bull probability** = (bullish weights) / total scenarios
   - **Bear probability** = (bearish weights) / total scenarios
   - **Confidence grade:** A+ (>75%), A (65–75%), B+ (55–65%), B (50–55%), C (<50% — DO NOT TRADE)

**Output format:**
```
BRAIN OUTPUT:
  Direction: LONG | SHORT | NO TRADE
  Bull prob: XX%  Bear prob: XX%
  Grade: A+ | A | B+ | B | C
  Key signals: [list what fired]
  Disqualifiers: [list what almost stopped the trade]
```

**Rules:**
- Grade C = abort entire pipeline. Do NOT proceed to Agent_02.
- If funding rate > 0.15%/hr and direction is LONG, downgrade grade by one level.
- If RSI > 80 and direction is LONG, note extreme overbought — require A+ grade to proceed.

---

## AGENT_02 · EXECUTOR — Kelly Sizing

**Trigger:** Only if Agent_01 grade is B or higher.

**Process:**
1. Fetch account value (spot + perp equity combined for Unified Account)
2. Calculate Kelly fraction:
   ```
   edge = bull_prob - bear_prob          # e.g. 0.73 - 0.27 = 0.46
   kelly = edge / (bull_prob / bear_prob) # full Kelly
   half_kelly = kelly * 0.5              # always use half-Kelly for safety
   ```
3. Calculate position size:
   ```
   risk_usdc = account_equity * half_kelly
   risk_usdc = min(risk_usdc, account_equity * 0.02)  # hard cap: 2% equity
   stop_distance = ATR * 1.5            # stop loss distance in price units
   position_size = risk_usdc / stop_distance
   position_size = round down to szDecimals
   ```
4. Calculate optimal leverage:
   ```
   notional = position_size * current_price
   leverage = notional / risk_usdc
   leverage = min(leverage, 3)          # hard cap: 3x for safety
   leverage = max(leverage, 1)
   ```
5. Assign trade grade:
   - A+ → proceed, full half-Kelly sizing
   - A  → proceed, 75% of half-Kelly
   - B+ → proceed, 50% of half-Kelly
   - B  → proceed, 25% of half-Kelly, requires explicit note in reasoning

**Output format:**
```
EXECUTOR OUTPUT:
  Direction: LONG | SHORT
  Size: X.XX COIN (at Y.Y x leverage)
  Notional: $XX.XX
  Kelly fraction: XX% (half-Kelly applied)
  Risk: $X.XX (Z% of equity)
  Stop loss price: $XX.XX
  Grade confirmed: A+ | A | B+ | B
```

**Hard rules:**
- NEVER risk more than 2% of account equity on a single trade.
- If calculated size rounds to 0 after szDecimals formatting, abort — position too small.
- Always verify margin availability before queuing.

---

## AGENT_03 · HARVESTER — Exit Ladder

**Trigger:** Immediately after Agent_02 confirms sizing.

**Process:**
1. Calculate exit ladder from entry price and ATR:
   ```
   For LONG:
     TP1 = entry + (ATR * 1.0)   # 33% of position, quick scalp
     TP2 = entry + (ATR * 2.5)   # 33% of position, main target
     TP3 = entry + (ATR * 4.0)   # 34% of position, runner
     SL  = entry - (ATR * 1.5)   # full position stop

   For SHORT:
     TP1 = entry - (ATR * 1.0)
     TP2 = entry - (ATR * 2.5)
     TP3 = entry - (ATR * 4.0)
     SL  = entry + (ATR * 1.5)
   ```
2. Calculate R:R ratio:
   ```
   reward = (TP2 - entry) for LONG   # use TP2 as main target
   risk   = (entry - SL)  for LONG
   rr     = reward / risk
   ```
   Minimum acceptable R:R = 1.5:1. If below, widen TP2 or abort.

3. Calculate expected ROI:
   ```
   exp_roi = (bull_prob * reward - bear_prob * risk) / risk_usdc * 100
   ```

**Output format:**
```
HARVESTER OUTPUT:
  Entry: $XX.XX
  TP1:   $XX.XX (33% size, +X.X ATR)
  TP2:   $XX.XX (33% size, +X.X ATR)  ← main target
  TP3:   $XX.XX (34% size, +X.X ATR)  ← runner
  SL:    $XX.XX (full size, -X.X ATR)
  R:R:   1:X.X
  Exp ROI: +XX%
```

4. Create triggers immediately after trade is approved:
   - `hard_order` trigger for SL at SL price (code condition: `prices["COIN"] <= SL` for LONG)
   - `hard_order` trigger for TP1 (reduce-only, 1/3 size)
   - Optional: `reasoning_job` trigger for TP2/TP3 management

---

## Final Trade Assembly

After all 3 agents complete, assemble the `place_order` call with this reasoning format:

```
[OPENCLAW PIPELINE]

BRAIN (Agent 01):
  Bull: XX% | Bear: XX% | Grade: X+
  Signals: ...

EXECUTOR (Agent 02):
  Half-Kelly: XX% | Risk: $X.XX (X% equity)
  Leverage: Xx

HARVESTER (Agent 03):
  SL: $XX.XX | TP1: $XX | TP2: $XX | TP3: $XX
  R:R: 1:X.X | Exp ROI: +XX%
```

---

## Abort Conditions — Stop the Pipeline Immediately

- Agent_01 grade = C (probability < 50%)
- Calculated position size = 0 after rounding
- R:R < 1.5:1
- Account equity cannot be fetched (no wallet configured)
- Funding rate > 0.2%/hr in direction of trade
- Any open position already using > 50% of available margin
- Daily drawdown already > 3% (check fills for today's closed PnL)
