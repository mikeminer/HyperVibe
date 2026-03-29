## Funding Rate Arbitrage — Strategy Plan

**Objective:** Fade extreme funding rates on Hyperliquid perpetuals. When the market is overwhelmingly one-sided, positioning against the crowd during funding normalization.

---

### Allocation & Capital Rules

- **Total allocation:** $20 USDC
- **Max per trade:** 1.5% of equity
- **Max concurrent positions:** 2 (different coins only)
- **Reserve:** $3 USDC always free
- **Leverage:** Max 2x — funding arb is a carry trade, not a momentum trade

---

### Core Logic

Extreme funding means one side is paying the other heavily. This creates:
1. **Carry income** if you're on the receiving side
2. **Mean reversion pressure** as the crowded side eventually unwinds

Both are exploitable. This playbook does both.

---

### Entry Signal — Short Fade (Fade Extreme Longs)

Trigger when funding rate > 0.15%/hr on any coin:

1. Check RSI — require RSI > 65 on 4h (overbought confirms crowding)
2. Check OI — open interest should be near 30-day highs
3. Enter SHORT with 1.5x leverage
4. You receive funding every hour while short

**Best candidates:** HYPE, BTC, ETH, SOL when all three conditions align.

---

### Entry Signal — Long Fade (Fade Extreme Shorts)

Trigger when funding rate < -0.12%/hr:

1. RSI < 35 on 4h (oversold confirms panic)
2. OI near highs (crowded short)
3. Enter LONG with 1.5x leverage
4. You receive funding every hour while long

---

### Sizing Formula

```
funding_income_per_hr = funding_rate * notional
expected_hold_hours = 8  (typical reversion window)
expected_carry = funding_income_per_hr * expected_hold_hours

risk_usdc = equity * 0.015
stop_distance = ATR_4h * 2.0  (wider stops — this is a carry trade)
size = risk_usdc / stop_distance
```

---

### Exit Strategy

**Primary exit — funding normalization:**
- Exit when funding rate returns to < 0.05%/hr (for short fade) or > -0.05%/hr (for long fade)
- This is the signal that the imbalance has resolved

**Secondary exit — price target:**
| Level | Distance | Size |
|---|---|---|
| TP1 | +1.0x ATR | 50% |
| TP2 | +2.5x ATR | 50% |
| SL  | -2.0x ATR | 100% |

**Hard stop:** Always set. Funding carry does not justify holding through large adverse moves.

---

### Automation Triggers

1. **Funding Scanner** — `llm: "Is any coin's funding rate above 0.15% per hour or below -0.12% per hour?"` → `reasoning_job` — "Extreme funding detected. Identify coin, confirm RSI/OI conditions, and propose fade entry."

2. **Funding Monitor** — `time: 0 */4 * * *` (every 4h) → `reasoning_job` — "Check funding rates on all open positions. Exit if funding has normalized."

3. **Daily Review** — `time: 0 20 * * *` → `reasoning_job` — "Review today's funding P&L and any open carry positions."

---

### Risk Rules

- **Never fight a trending market:** If price is moving strongly against your fade, the stop is sacred
- **2-coin max:** Diversify across coins, never two fades on same asset
- **Funding check before hold:** If you're paying > 0.1%/hr on your position direction, exit — carry is negative
- **Weekend caution:** Funding can stay extreme over weekends — tighten stops or reduce size on Fridays
