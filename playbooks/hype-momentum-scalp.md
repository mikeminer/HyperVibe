## HYPE Momentum Scalp — Strategy Plan

**Objective:** Capture short-term momentum moves on HYPE-PERP. In and out within 4–24 hours. Designed for small accounts ($15–$100 USDC).

---

### Allocation & Capital Rules

- **Total allocation:** $15 USDC
- **Max per trade:** 1% of account equity (never more than $0.30 on $15 account)
- **Max concurrent positions:** 1 (one position at a time)
- **Reserve:** Always keep $2 USDC free for fees — never deploy 100%
- **Leverage:** Max 2x. Prefer 1x for first trade of the day.

---

### Entry Rules — LONG

All conditions must be true on the **4h chart** before entering:

1. Price > EMA_21 (trending up)
2. RSI between 40–68 (momentum without overbought)
3. MACD histogram positive (bullish momentum)
4. Funding rate < 0.08%/hr (not crowded long)

Confirm on **1h chart** before executing:
- Price holding above 1h EMA_9
- No bearish divergence on 1h RSI

**Skip the trade if:** RSI > 75, funding > 0.12%/hr, or BTC is in sharp downtrend.

---

### Entry Rules — SHORT

1. Price < EMA_21 (trending down)
2. RSI between 32–60
3. MACD histogram negative
4. Funding rate > -0.08%/hr

**Skip if:** RSI < 25 (oversold bounce risk), or BTC holding major support.

---

### Position Sizing (OpenClaw Executor)

Always apply the OpenClaw sizing formula:
```
risk_usdc = min(equity * 0.01, $0.30)
stop_distance = ATR_4h * 1.5
size = risk_usdc / stop_distance  (round down to 2 decimals for HYPE)
```

Minimum tradeable size: 0.01 HYPE. If calculated size < 0.01, skip — position too small.

---

### Exit Strategy (OpenClaw Harvester)

Use ATR-based ladder from the 4h chart:

| Level | Distance | Size | Notes |
|---|---|---|---|
| TP1 | +0.8x ATR | 40% | Quick profit, guaranteed |
| TP2 | +2.0x ATR | 40% | Main target |
| TP3 | +3.5x ATR | 20% | Runner — trail stop after TP2 |
| SL  | -1.5x ATR | 100% | Hard stop, always set immediately |

Set hard_order triggers for SL and TP1 immediately after entry is confirmed.

---

### Automation (Heartbeat Triggers)

After setup, create these triggers:

1. **Morning Scan** — `time: 0 8 * * *` → `reasoning_job` — "Check HYPE setup on 4h. If conditions met, propose entry with full OpenClaw analysis."

2. **Position Monitor** — `time: 0 * * * *` (hourly) → `reasoning_job` — "Review open HYPE position: check RSI, funding, EMA. Update stops if needed."

3. **Funding Alert** — `llm: "Is HYPE funding rate above 0.12% per hour?"` → `reasoning_job` — "Funding is extreme. Evaluate whether to close long position early."

---

### State Management

- `scanning` — no position, looking for setup
- `position_open` — position active, monitors running
- `paused` — daily drawdown > 3% or 3 consecutive losses hit

---

### Risk Rules (Non-Negotiable)

- **Daily drawdown limit:** 3% of equity → pause all entries for the day
- **Consecutive losses:** 3 in a row → mandatory 2h pause, reduce next size by 50%
- **Never average down:** If trade moves against you, let the stop do its job
- **No FOMO entries:** If the move is already 2x ATR from the low, skip
