## Qwen x Spot DCA — Plan

**Objective:** Accumulate spot exposure on a target asset using a disciplined Dollar Cost Averaging strategy. Buy fixed USDC amounts at regular intervals, optionally filtered by price or momentum conditions. No shorting. No leverage. Spot only.

**Coin:** [CONFIGURE: e.g. HYPE, BTC, ETH, SOL]

**Total Allocation:** [CONFIGURE: e.g. 300 USDC]

**DCA Amount per Order:** [CONFIGURE: e.g. 25 USDC per buy]

**Frequency:** [CONFIGURE: e.g. every 4h / every 24h / every 12h]

**Entry Condition:** [CONFIGURE — choose one or combine:]
- ALWAYS: buy unconditionally at every interval
- PRICE_DIP: buy only if current price is below the 24h average
- MOMENTUM_WEAK: buy only if 24h change is between -10% and 0% (accumulate on weakness)
- FUNDING_NEGATIVE: buy only if funding rate < 0 (market is net short — contrarian buy)
- CUSTOM: [describe your own condition here]

**Approval:** All orders require Telegram approval before execution.

**AI Engine:** Ollama — Qwen 2.5 7B. Follow the Qwen Trader Protocol skill exactly.

---

### Step 1 — Fetch live data

Call:
- `get_price` for [COIN] → current mid price
- `get_market_info` for [COIN] → 24h change %, funding rate, volume
- `get_account_value` → verify available USDC balance

---

### Step 2 — Check budget

Calculate:
- spent_so_far = total orders placed this session × DCA amount per order
- remaining_budget = total allocation − spent_so_far

If remaining_budget < DCA amount per order:
- Call `add_observation`: "DCA complete. Total allocation of [TOTAL] USDC fully deployed."
- Stop. Do not place any more orders.

If account USDC balance < DCA amount per order:
- Call `add_observation`: "Insufficient balance. Available: [BALANCE] USDC, required: [DCA_AMOUNT] USDC."
- Stop.

---

### Step 3 — Entry condition check

Evaluate the configured entry condition:

**If ALWAYS:**
- Proceed to Step 4.

**If PRICE_DIP:**
- Calculate 24h average price = current_price / (1 + 24h_change_pct / 100)
- If current_price < 24h_average → proceed to Step 4.
- Else → go to Step 5 (skip).

**If MOMENTUM_WEAK:**
- If -10% ≤ 24h_change_pct ≤ 0% → proceed to Step 4.
- Else → go to Step 5 (skip).

**If FUNDING_NEGATIVE:**
- If funding_rate < 0 → proceed to Step 4.
- Else → go to Step 5 (skip).

**If CUSTOM:**
- Evaluate your custom condition using the data from Step 1.
- If condition met → proceed to Step 4.
- Else → go to Step 5 (skip).

---

### Step 4 — Place DCA order

Always BUY. Never SELL. Never short.

Call `queue_order` with:
```
{
  "coin": "<COIN>",
  "side": "BUY",
  "size": "<DCA_AMOUNT>",
  "order_type": "MARKET",
  "reasoning": "DCA buy #<N>. Price: $<PRICE>. Condition: <CONDITION_NAME>. Remaining budget: $<REMAINING>."
}
```

Replace:
- `<COIN>` with the configured coin
- `<DCA_AMOUNT>` with the configured amount per order
- `<N>` with the order count (1, 2, 3...)
- `<PRICE>` with current price from Step 1
- `<CONDITION_NAME>` with the entry condition that was met
- `<REMAINING>` with remaining budget after this order

---

### Step 5 — Skip

Call `add_observation` with one of:
- "DCA skip: entry condition not met. Price: $<PRICE>, 24h: <CHANGE>%, funding: <FUNDING>."
- "DCA skip: budget exhausted."
- "DCA skip: insufficient balance."

---

### Risk rules

- Never place a SELL order. This is an accumulation-only strategy.
- Never use leverage. Spot only.
- Never place an order smaller than 11 USDC.
- If 24h_change_pct < -20% in a single candle (flash crash), skip and call `add_observation`: "DCA paused: flash crash detected (-20%). Waiting for next cycle."
- If total deployed capital exceeds configured allocation, stop permanently.

---

### Customization notes

To personalize this playbook when installing:
1. Replace [COIN] with your target asset
2. Replace [CONFIGURE] fields with your values
3. Choose one entry condition in Step 3 or combine multiple with AND logic
4. Adjust DCA amount and frequency to match your risk appetite

---

### Skills

- qwen-trader (required — follow its protocol for all order construction)
- funding-rate-filter (optional — apply if using FUNDING_NEGATIVE condition)
- drawdown-guard (optional — apply to pause DCA during severe drawdowns)
