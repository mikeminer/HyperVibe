## Top Mover Breakout — Strategy Plan

**Objective:** Every morning, identify the strongest trending coin on Hyperliquid using top movers. Enter on a breakout of the opening range. Single position, simple rules.

---

### Allocation & Capital Rules

- **Total allocation:** $10 USDC
- **Single position only** — always
- **Risk per trade:** 1% of equity ($0.10–$0.18 depending on account size)
- **Leverage:** Max 2x
- **Reserve:** $1.50 always free

---

### Coin Selection (Daily, 08:00)

1. Fetch `get_top_movers` — get top 5 gainers by 24h change
2. Filter: 24h change > +5%, volume > $30M
3. Pick the coin with the best combination of: high gain % + high volume + RSI not yet overbought (< 72)
4. This is today's **focus coin**

If no coin passes all filters, wait until tomorrow. **No trade is better than a bad trade.**

---

### Opening Range Definition

The opening range is the high and low of the **first 4h candle** of the UTC day (00:00–04:00).

- **Breakout LONG:** Price closes a 1h candle above the opening range high
- **Breakout SHORT:** Price closes a 1h candle below the opening range low

Wait for the 4h candle to close before defining the range. Do not anticipate.

---

### Entry Confirmation (Required)

After breakout candle closes:
1. Volume on breakout candle > 120% of previous 3 candles average
2. RSI (1h) between 50–75 for long (40–60 for short)
3. Price not extended > 2x ATR from opening range boundary
4. Funding rate acceptable (apply funding-rate-filter skill)

If any condition fails: skip this trade. Wait for next day.

---

### Sizing

```
risk_usdc = min(equity * 0.01, $0.15)
entry_price = current mid price
stop = opening_range_low - (ATR_1h * 0.3)  for LONG
     = opening_range_high + (ATR_1h * 0.3) for SHORT
stop_distance = abs(entry - stop)
size = risk_usdc / stop_distance
size = max(size, min_size_for_coin)
```

---

### Exit Strategy

Simple and mechanical:

| Level | Target | Size | Notes |
|---|---|---|---|
| TP1 | +1.5x ATR_1h from entry | 50% | Lock profit fast |
| TP2 | Opening range size * 2 projected | 50% | Full measured move |
| SL  | Below opening range low (long) | 100% | If range breaks, thesis invalid |

**Time exit:** If no meaningful move by 16:00 UTC, close position. Don't hold overnight.

---

### Automation Triggers

1. **Morning Selection** — `time: 0 8 * * *` → `reasoning_job` — "Fetch top movers. Select today's focus coin using breakout criteria. Identify the opening range high/low from 00:00–04:00 UTC candle. Set up a code trigger for the breakout level."

2. **Breakout Trigger** (created dynamically by agent) — `code: prices["COIN"] >= OPENING_RANGE_HIGH * 1.001` → `reasoning_job` — "Opening range breakout detected. Confirm with volume and RSI. Run sizing. Queue entry for approval."

3. **EOD Close** — `time: 0 16 * * *` → `reasoning_job` — "4pm UTC check. If position open and not yet at TP1, evaluate closing. No overnight holds for breakout strategy."

---

### Journal Requirements

After every trade (win or loss), add an observation with:
- Which coin was selected and why
- Where the opening range was
- Whether breakout volume confirmed
- Entry, exit, P&L
- What you would do differently

This compounding journal is how the strategy improves over time.

---

### Risk Rules

- **One trade per day maximum** — once the daily coin is picked, no switching
- **No revenge trades** — losing day means losing day, tomorrow is a new scan
- **Never hold overnight** — this is a day trade strategy
- **Skip Sundays** — low volume, unreliable breakouts
