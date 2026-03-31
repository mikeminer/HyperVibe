# HYPE Fee Monitor & Buyback/Burn Prediction Engine
**Playbook v1.0 — Pappardelle / HyperVibe Agent Suite**

---

## Objective

Monitor in real-time the accumulation of trading fees on Hyperliquid L1, tracked through the Assistance Fund system address (`0xfefefefefefefefefefefefefefefefefefefefe`). Ogni 30 minuti il playbook stima se le fees sono in aumento, calcola il tasso di buyback/burn implicito di HYPE, e produce una stima del prezzo HYPE a `T+1h`, `T+4h` e `T+24h` basata su supply circulating, order book depth e pressione di acquisto derivata dal burn rate.

> **Core thesis**: fee accumulation rate ↑ → USDC→HYPE conversion pressure ↑ → net supply reduction via burn → upward price pressure. Più il ritmo di fee collection accelera, più alto è il probability-weighted bounce signal per HYPE.

---

## Required Skills

`hype-fee-monitor`, `hl-orderbook-reader`, `supply-tracker`, `price-estimator`, `drawdown-guard`

---

## Data Sources & Addresses

| Sorgente | Dettaglio |
|---|---|
| **Assistance Fund** | `0xfefefefefefefefefefefefefefefefefefefefe` — accumula fees, converte in HYPE, brucia |
| **HyperEVM RPC** | `https://rpc.hyperliquid.xyz/evm` — query onchain state |
| **Hyperliquid API** | `https://api.hyperliquid.xyz/info` — order book, funding, trades |
| **HL Explorer** | `https://app.hyperliquid.xyz/explorer` — tx history address sistema |
| **Circulating Supply** | Derivata da: total supply − burned − locked team/ecosystem |

---

## Capital & Risk Rules

Questo playbook **non apre posizioni autonomamente**. È un **signal engine + price oracle**. Le posizioni vengono aperte solo tramite approvazione manuale o via HyperVibe agent con conferma Telegram.

- Segnale `BOUNCE_HIGH` → suggerisce long HYPE spot o perp con size ≤ 2% equity
- Segnale `BOUNCE_MED` → watchlist, nessuna azione immediata
- Segnale `NEUTRAL` → nessuna azione
- Segnale `FEE_DROP` → segnale ribassista debole, potenziale riduzione esposizione

---

## Fee Monitor Loop (ogni 30 minuti)

### Step 1 — Fetch Fee Accumulation Delta

```
GET https://api.hyperliquid.xyz/info
body: { "type": "fundingHistory", "coin": "HYPE", "startTime": T-30m }

+ Onchain query Assistance Fund address:
  - HYPE balance delta (ultimi 30 min)
  - Incoming USDC transfer volume (fee inflows)
  - Outgoing burns (HYPE → address zero o metodo burn ufficiale)
```

**Metriche calcolate:**

| Metrica | Formula |
|---|---|
| `fee_delta_30m` | fees_now − fees_T30 (USDC) |
| `fee_rate_per_hour` | fee_delta_30m × 2 |
| `fee_rate_change_pct` | (fee_rate_now − fee_rate_prev) / fee_rate_prev × 100 |
| `hype_bought_30m` | USDC convertito → HYPE (stimato via TWAP) |
| `hype_burned_30m` | HYPE inviato a burn address (onchain) |
| `net_supply_reduction` | hype_burned_30m (cumulato 24h) |

---

### Step 2 — Order Book Analysis (HYPE-USDC Perp)

```
GET https://api.hyperliquid.xyz/info
body: { "type": "l2Book", "coin": "HYPE" }
```

**Metriche estratte:**

| Metrica | Descrizione |
|---|---|
| `bid_depth_5pct` | Liquidità bid entro 5% dal mid price |
| `ask_depth_5pct` | Liquidità ask entro 5% dal mid price |
| `book_imbalance` | (bid_depth − ask_depth) / (bid_depth + ask_depth) |
| `spread_bps` | Spread in basis points |
| `mid_price` | Prezzo mid corrente HYPE |
| `vwap_1h` | VWAP ultimi 60 minuti |

**Signal: book_imbalance > 0.15 + fee_rate_change_pct > 10% → BOUNCE_HIGH**

---

### Step 3 — Supply Model & Price Estimate

#### Supply Parameters

```
total_supply_hype         = 1,000,000,000   # supply massima
circulating_supply        = fetch onchain (stima dinamica)
burned_cumulative_24h     = sum(hype_burned ogni 30m, ultimi 48 cicli)
burned_cumulative_7d      = sum(hype_burned ogni 30m, ultimi 336 cicli)
implied_annual_burn_rate  = burned_cumulative_7d / 7 × 365
```

#### Price Estimation Model

Il modello usa una **pressione di acquisto netta** derivata da:

```
buy_pressure_usdc_per_hour = fee_rate_per_hour × conversion_efficiency
# conversion_efficiency ≈ 0.85 (stima conservativa, 15% slippage/gas)

hype_removed_per_hour = buy_pressure_usdc_per_hour / mid_price

supply_reduction_pct_1h  = hype_removed_per_hour / circulating_supply × 100
supply_reduction_pct_4h  = supply_reduction_pct_1h × 4
supply_reduction_pct_24h = supply_reduction_pct_1h × 24
```

#### Formula Prezzo Stimato

Modello semplificato basato su elasticità della domanda (stock-to-flow adattato):

```
price_impact_factor = 1 + (supply_reduction_pct × elasticity_coeff)
# elasticity_coeff default = 2.5 (calibrato su dati storici HYPE)
# range conservativo: 1.5 | base: 2.5 | aggressivo: 4.0

price_estimate_T1h  = mid_price × (1 + supply_reduction_pct_1h  × elasticity_coeff)
price_estimate_T4h  = mid_price × (1 + supply_reduction_pct_4h  × elasticity_coeff)
price_estimate_T24h = mid_price × (1 + supply_reduction_pct_24h × elasticity_coeff)
```

> ⚠️ **Nota metodologica**: il modello assume che la pressione di buyback sia la variabile dominante nell'orizzonte stimato. In condizioni di mercato macro avverse (BTC -5%+), applicare un `bear_override_factor = 0.6` moltiplicato al price_impact_factor.

---

### Step 4 — Signal Classification

| Condizione | Segnale | Azione suggerita |
|---|---|---|
| fee_rate_change > +20% AND book_imbalance > 0.15 | 🟢 `BOUNCE_HIGH` | Considera long HYPE, size piena |
| fee_rate_change > +10% AND book_imbalance > 0.05 | 🟡 `BOUNCE_MED` | Watchlist, size ridotta |
| fee_rate_change tra -10% e +10% | ⚪ `NEUTRAL` | Nessuna azione |
| fee_rate_change < -15% | 🔴 `FEE_DROP` | Segnale ribassista, riduci esposizione |
| burned_cumulative_24h > ATH_rolling_7d × 1.2 | 🔵 `BURN_SPIKE` | Segnale rialzista extra, combina con BOUNCE |

---

## Automation Triggers

```
1. Fee Monitor Cycle
   type: time
   expr: */30 * * * *
   action: reasoning_job
   context: "Fetch Assistance Fund fee delta ultimi 30m. Calcola fee_rate, book_imbalance,
             supply_reduction. Classifica segnale. Se BOUNCE_HIGH o BURN_SPIKE, invia
             notifica Telegram con price estimate T1h/T4h/T24h. Logga tutto nel journal."

2. Hourly Fee Summary
   type: time
   expr: 0 * * * *
   action: reasoning_job
   context: "Aggrega ultimi 2 cicli da 30m. Calcola fee_rate_per_hour e variazione % vs
             ora precedente. Se variazione > 25%, genera alert prioritario. Aggiorna
             hype_removed_per_hour e price_estimates. Invia report compatto su Telegram."

3. Daily Burn Report
   type: time
   expr: 0 9 * * *
   action: reasoning_job
   context: "Calcola burned_cumulative_24h e 7d. Confronta con rolling ATH. Calcola
             implied_annual_burn_rate. Stima: quanti mesi per bruciare 1% supply.
             Genera report giornaliero con trend grafico tesuale (ASCII) e invia su Telegram."

4. Burn Spike Alert
   type: llm
   expr: "burned_cumulative_1h > media_rolling_7d_per_hour × 2?"
   action: reasoning_job
   context: "Burn spike rilevato. Verifica se è dato da spike di volume o fee anomale.
             Calcola price impact atteso. Se BOUNCE_HIGH confermato, queue approvazione
             long HYPE per HyperVibe agent."

5. Fee Drop Alert
   type: llm
   expr: "fee_rate_change_pct < -20% per 2 cicli consecutivi?"
   action: reasoning_job
   context: "Fee in calo sostenuto. Verifica volume onchain, funding rate, OI su HYPE.
             Se tutte e tre in calo, segnala FEE_DROP. Suggerisci riduzione esposizione
             HYPE se posizione aperta."
```

---

## Output Format (ogni ciclo)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥 HYPE FEE MONITOR — T: 14:30 UTC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Fee Delta (30m):     +$12,450 USDC
📈 Fee Rate (1h):       $24,900 USDC/h
📉 Rate Change:         +18.3% vs ciclo prec.
🔥 HYPE Burned (30m):  234.7 HYPE
🔥 Burned (24h):        4,821 HYPE
📦 Supply Reduction:    0.00048% / ora

📚 Order Book HYPE:
   Mid Price:           $28.42
   Book Imbalance:      +0.19 (bid-heavy)
   Spread:              4.2 bps

💰 Price Estimates:
   T+1h  → $28.56  (+0.49%)
   T+4h  → $28.98  (+1.97%)
   T+24h → $30.11  (+6.29%)
   [elasticity = 2.5 | bear_override = OFF]

🎯 SEGNALE:  🟢 BOUNCE_HIGH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## State Machine

| State | Significato | Prossima azione |
|---|---|---|
| `monitoring` | Ciclo normale attivo | Continua ogni 30m |
| `bounce_alert` | BOUNCE_HIGH rilevato | Notifica + queue approval HyperVibe |
| `burn_spike` | Burn anomalo rilevato | Alert prioritario + analisi extra |
| `fee_drop` | Fee in calo sostenuto | Segnale ribassista, monitor enhanced |
| `stale_data` | RPC/API non risponde | Retry 3×, poi alert manuale |
| `paused` | Override manuale | Riprendi su comando |

---

## Calibration Notes

**elasticity_coeff** va ricalibrato mensilmente:
- Prendi ultimi 30 giorni di `fee_rate_per_hour` e `hype_price`
- Calcola correlazione e regression lineare
- Se R² < 0.4, usa modello conservativo (elasticity = 1.5)
- Se R² > 0.7, puoi usare modello aggressivo (elasticity = 4.0)

**bear_override_factor**:
- Attivato automaticamente se BTC -3% nelle ultime 4h
- Attivato automaticamente se HYPE OI cala > 15% in 1h
- Override manuale disponibile via Telegram command `/bear_mode on`

---

## Risk Rules (Hard Limits)

- Mai interpretare il segnale BOUNCE_HIGH come certezza: è una **stima probabilistica**
- Se BTC in trend ribassista forte (−5% daily), nessun long HYPE su questo segnale da solo
- Fee spike da bot/wash trading → falso positivo: controlla se volume è distribuito o concentrato su pochi indirizzi
- Non accumulare più di 3 segnali BOUNCE_HIGH consecutivi senza reset: mercato potrebbe essere già in distribuzione
- Massimo 1 position HYPE aperta per volta da questo playbook

---

## Learnings Log

*(compilato dall'agente dopo ogni segnale validato)*

| Data | Segnale | Esito reale | Note |
|---|---|---|---|
| — | — | — | Da popolare live |

---

*Playbook generato per HyperVibe — pappardelle.eth — Hyperliquid Wallet: `0x755695656fe1C005e3ba9e4D621209411f9aEC63`*
