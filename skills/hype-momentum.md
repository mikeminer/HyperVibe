---
name: hype-momentum
description: Setup rules specific to HYPE perpetuals. Use when the coin being analyzed is HYPE.
tags: hype, momentum, strategy
---

# HYPE Momentum Strategy

Specialized rules for trading HYPE-PERP on Hyperliquid. HYPE has unique characteristics: it is Hyperliquid's native token and often leads the broader HL ecosystem.

## Entry Conditions — LONG

All 4 must be true:
1. Price > EMA_21 (4h) — trend confirmed
2. RSI (4h) between 40–70 — momentum without extreme overbought
3. MACD histogram positive and increasing — momentum building
4. Funding rate < 0.08%/hr — not too crowded

Bonus confirming signals (not required):
- Volume spike > 150% of 20-period average
- Price above previous day's high
- BTC in uptrend (EMA_9 > EMA_21 on 4h)

## Entry Conditions — SHORT

All 4 must be true:
1. Price < EMA_21 (4h)
2. RSI (4h) between 30–60
3. MACD histogram negative and decreasing
4. Funding rate > -0.08%/hr

## Specific HYPE Risk Rules

- Max leverage: 3x (HYPE can move 15–20% in a session)
- Stop loss: minimum 1.5x ATR from entry (HYPE is volatile)
- Never trade HYPE during Hyperliquid protocol announcements without confirmation
- If open interest > $500M and funding > 0.1%, treat as extreme crowding — halve position size

## Preferred Timeframes

- Signal: 4h candles for trend direction
- Entry: 1h candles for precise entry timing
- Always confirm 4h signal on 1h before entering

## Exit Rules (Harvester for HYPE)

Use tighter TP ladder given HYPE's volatility:
```
TP1 = entry + (ATR_4h * 0.8)   → 40% of position (quick profit)
TP2 = entry + (ATR_4h * 2.0)   → 40% of position (main target)
TP3 = entry + (ATR_4h * 3.5)   → 20% of position (runner)
SL  = entry - (ATR_4h * 1.5)   → full position
```

## Correlation Note

HYPE correlates with BTC ~60% of the time but diverges on HL-specific catalysts. Always check BTC trend before entering HYPE — if BTC is in sharp downtrend, wait for stabilization before longing HYPE.
