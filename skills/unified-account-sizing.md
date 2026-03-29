---
name: unified-account-sizing
description: Position sizing rules for Hyperliquid Unified Account. Use when calculating position size — spot USDC counts as margin.
tags: sizing, unified-account, margin
---

# Unified Account Sizing

Hyperliquid Unified Account merges spot USDC and perp equity into a single margin pool. Standard sizing formulas need adjustment.

## Fetching True Equity

Always use `get_account_value` which returns:
- `perpEquity` — open position value
- `spotUsdc` — USDC in spot account
- `accountValue` — **total = perpEquity + spotUsdc** ← use this for sizing

## Sizing Formula

```
total_equity = accountValue  (spot USDC + perp equity)
risk_per_trade = total_equity * 0.01   (1% rule)
risk_per_trade = min(risk_per_trade, total_equity * 0.02)  (hard cap 2%)

position_size = risk_per_trade / stop_distance_in_price_units
```

## Margin Availability Check

Before entering, verify available margin:
```
used_margin = totalMarginUsed
free_margin = total_equity - used_margin
position_required_margin = notional / leverage

if position_required_margin > free_margin * 0.8:
  ABORT — not enough free margin (leaving 20% buffer)
```

## Leverage Rules for Unified Account

With Unified Account, spot USDC is at 1:1 — it provides margin but no leverage. Effective leverage is lower than nominal:

```
effective_leverage = total_notional / total_equity
```

Keep effective leverage < 2x across all open positions combined.

## Small Account Adjustments ($10–$50 equity)

For accounts under $50 USDC:
- Minimum position: check `szDecimals` — must be > 0 after rounding
- If 1% risk gives size = 0 after rounding, use minimum tick size or skip trade
- Maximum 1 open position at a time
- No leverage above 2x
- Always leave $2 USDC free for fees

## Always Report

```
Equity breakdown: perp=$X.XX + spot=$X.XX = total $X.XX
Risk per trade: $X.XX (X% of equity)
Free margin: $X.XX
Effective leverage after entry: X.Xx
```
