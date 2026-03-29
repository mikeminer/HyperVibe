## BTC/ETH Trend Follower — Strategy Plan

**Objective:** Ride multi-day trends on BTC-PERP and ETH-PERP. Lower frequency, higher conviction. Holds 1–5 days.

---

### Allocation & Capital Rules

- **Total allocation:** $30 USDC
- **BTC slot:** $15 USDC max
- **ETH slot:** $15 USDC max
- **Max concurrent:** 2 (one per coin)
- **Leverage:** Max 2x BTC, max 2x ETH
- **Reserve:** $3 always free

---

### Trend Definition (Daily Chart)

**Uptrend (LONG bias):**
- Price > SMA_50 (daily)
- EMA_9 > EMA_21 (daily)
- Higher highs and higher lows on the last 5 daily candles

**Downtrend (SHORT bias):**
- Price < SMA_50 (daily)
- EMA_9 < EMA_21 (daily)
- Lower highs and lower lows on the last 5 daily candles

**No trend (FLAT) — do not trade:**
- Price oscillating around SMA_50
- EMA_9 and EMA_21 crossing back and forth

---

### Entry Timing (4h Chart)

Once daily trend is confirmed, wait for a 4h pullback entry:

**LONG entry:** Price pulls back to 4h EMA_21, RSI resets to 45–55, MACD holds positive. Enter on next candle close above the pullback high.

**SHORT entry:** Price rallies to 4h EMA_21, RSI bounces to 45–55, MACD stays negative. Enter on next candle close below the rally low.

This avoids chasing — we enter on the dip within the trend, not at extension.

---

### Sizing

```
risk_usdc = slot_allocation * 0.015  (1.5% of slot)
atr = ATR_daily
stop_distance = atr * 1.0  (1 ATR from entry)
size = risk_usdc / stop_distance
```

For BTC with ~$95k price and daily ATR ~$2,000:
- Risk = $15 * 0.015 = $0.225
- Size = $0.225 / $2,000 ≈ 0.0001 BTC

Always verify szDecimals for BTC and ETH — minimum size may apply.

---

### Exit Strategy

Swing trades use wider targets:

| Level | Distance | Size | Notes |
|---|---|---|---|
| TP1 | +1.5x ATR daily | 33% | First target |
| TP2 | +3.0x ATR daily | 33% | Main target |
| TP3 | trailing stop | 34% | Ride the trend |
| SL  | -1.0x ATR daily | 100% | Hard stop |

**Trail stop rule for TP3:** After TP2 hits, move stop to breakeven. Then trail 1 ATR below each new daily close.

**Time stop:** If trade is flat (< 0.5% move) after 72 hours, exit. Capital is better deployed elsewhere.

---

### Automation Triggers

1. **Daily Trend Check** — `time: 0 7 * * *` → `reasoning_job` — "Check BTC and ETH daily trend. Are we in uptrend or downtrend? Any 4h pullback entry available? Apply OpenClaw sizing."

2. **BTC Monitor** — `time: 0 */6 * * 1-5` (every 6h weekdays) → `reasoning_job` — "Review BTC position: check daily trend intact, update trailing stop if needed."

3. **ETH Monitor** — `time: 0 */6 * * 1-5` → `reasoning_job` — "Review ETH position: check daily trend intact, update trailing stop."

4. **Trend Break Alert** — `llm: "Has BTC or ETH broken below its 4h EMA_21 significantly?"` → `reasoning_job` — "Potential trend break. Evaluate whether to exit position early."

---

### Correlation Rule

BTC and ETH are highly correlated. If both are in the same trend direction, the combined position is effectively 2x BTC exposure. In this case:
- Reduce each position to 75% of normal size
- Maintain the same hard stops

If they diverge (BTC down, ETH up), the divergence is a signal — note it as an observation.

---

### Risk Rules

- **No leverage > 2x** on swing trades — gaps and overnight moves can be large
- **Never hold through major macro events** without tightening stop to 0.5 ATR
- **Weekend holds:** Reduce size by 50% on Friday if holding over weekend
- **Drawdown stop:** If BTC slot loses > 5% in a week, pause BTC trading for 5 days
