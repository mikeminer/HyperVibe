---
name: funding-rate-filter
description: Check funding rate before any entry. Use this skill before opening any leveraged position to filter out dangerous funding conditions.
tags: filter, funding, risk
---

# Funding Rate Filter

Always run this check before any trade entry. Fetch `get_funding_rate` for the coin before proceeding.

## Rules

### Longs — Avoid or Fade

| Funding Rate (hourly) | Action |
|---|---|
| < 0.03% | Green — proceed normally |
| 0.03% – 0.08% | Yellow — note it, proceed with reduced size (75%) |
| 0.08% – 0.15% | Orange — require grade A or higher to enter long |
| > 0.15% | Red — DO NOT open long. Consider short fade instead. |

### Shorts — Avoid or Fade

| Funding Rate (hourly) | Action |
|---|---|
| > -0.03% | Green — proceed normally |
| -0.03% – -0.08% | Yellow — note it, proceed with reduced size (75%) |
| -0.08% – -0.15% | Orange — require grade A or higher to enter short |
| < -0.15% | Red — DO NOT open short. Consider long fade instead. |

## Contrarian Fade Signal

When funding is extreme (> 0.15% or < -0.15%), the market is heavily one-sided. This is often a fade opportunity:

- Extreme positive funding → longs paying heavily → look for short entry on technical confirmation
- Extreme negative funding → shorts paying heavily → look for long entry on technical confirmation

Require RSI confirmation (> 70 for short fade, < 30 for long fade) before entering contrarian position.

## Overnight Hold Adjustment

If a position will be held through multiple funding periods:
- Calculate expected funding cost: `funding_rate * hours_held * position_notional`
- If expected funding cost > 0.5% of position notional, factor into R:R calculation
- Adjust TP targets upward (for longs) or downward (for shorts) to compensate

## Always Report

Include in reasoning:
```
Funding check: X.XXX% / hr → [Green/Yellow/Orange/Red]
Expected 8hr funding cost: $X.XX
```
