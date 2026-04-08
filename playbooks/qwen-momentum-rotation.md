## Qwen x Multi-Asset Momentum Rotation — Plan

**Objective:** Monitor BTC, ETH, SOL, and HYPE perpetuals. At each cycle, rank assets by relative momentum. Allocate capital to the strongest asset. Rotate when another asset overtakes the leader. Never hold more than one position at a time.

**Allocation:** 200 USDC total. Maximum position size: 180 USDC. Minimum order size: 11 USDC.

**Frequency:** Analyze every 60 minutes.

**Approval:** All orders require Telegram approval before execution.

**AI Engine:** Ollama — Qwen 2.5 7B. Follow the Qwen Trader Protocol skill exactly.

---

### Step 1 — Fetch live data

For each asset (BTC, ETH, SOL, HYPE), call:
- `get_price` → current mid price
- `get_market_info` → 24h change %, volume, funding rate

Also call:
- `get_positions` → check current open position
- `get_account_value` → verify available margin

---

### Step 2 — Rank momentum

Score each asset using this formula:

```
score = 24h_change_pct * 0.6 + sign(funding_rate) * 0.4
```

Rules:
- If funding_rate > 0.05% → subtract 0.5 from score (crowded long, avoid)
- If funding_rate < -0.03% → add 0.3 to score (short squeeze potential)
- If 24h_volume is the lowest among the four → subtract 0.2 (low liquidity)

Rank all four assets by final score. The asset with the highest score is the **leader**.

---

### Step 3 — Checklist

Answer YES or NO:

1. Is the leader score > 0.5? (meaningful momentum)
2. Is the leader's 24h change > +1% (long) or < -1% (short)?
3. Is available margin > 50 USDC?
4. Am I already in a position?

If 1, 2, 3 = YES and 4 = NO → go to Step 4 (new entry).
If 1, 2, 3 = YES and 4 = YES → go to Step 5 (check rotation).
If any of 1, 2, 3 = NO → go to Step 6 (skip).

---

### Step 4 — New entry

Direction:
- leader score > 0 → BUY
- leader score < 0 → SELL

Size: 150 USDC (fixed).

Call `queue_order` with:
```
{
  "coin": "<LEADER>",
  "side": "<BUY or SELL>",
  "size": "150",
  "order_type": "MARKET",
  "reasoning": "Momentum leader: <LEADER> score <SCORE>, 24h <CHANGE>%."
}
```

---

### Step 5 — Rotation check

Compare the current position's asset score vs the leader score.

If leader_score > current_score + 0.4:
- Close current position: call `queue_order` with reduce_only = true, opposite side, same size.
- Reasoning: "Rotating from <CURRENT> to <LEADER>. Score delta: <DELTA>."
- Wait for approval and execution before placing new entry.
- Then go to Step 4 for the new entry.

If leader_score <= current_score + 0.4:
- No rotation needed. Go to Step 6.

---

### Step 6 — Skip / observe

Call `add_observation` with one of:
- "No trade: momentum score below threshold. Leader: <ASSET> score <SCORE>."
- "No trade: insufficient margin."
- "No trade: holding <ASSET>, no rotation signal."

---

### Risk rules

- Maximum drawdown per position: -8% from entry. If hit, close immediately without approval.
- Never open a new position if account value has dropped more than 15% from session start.
- Never trade the same asset twice in a row if the previous trade was a loss.
- If funding rate on the leader exceeds 0.1%, skip regardless of momentum score.

---

### Skills

- qwen-trader (required — follow its protocol for all order construction)
- openclaw-3-agent (use for sizing validation if available)
- funding-rate-filter (apply before every entry)
- drawdown-guard (apply at start of every cycle)
