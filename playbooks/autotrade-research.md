# Autotrade Strategy Research — Playbook

**Objective:** Ricerca autonoma di strategie di trading tramite backtesting LLM-driven su qualsiasi perpetual Hyperliquid. Genera un signal JSON validato e lo carica come configurazione di rischio attiva.

---

### Cos'è questo Playbook

Questo playbook integra [autotrade](https://github.com/rv64m/autotrade) in HyperVibe come pipeline di ricerca. Funziona in due fasi:

1. **Research** — `autotrade-bridge.js` configura e lancia autotrade con Claude Code, che itera autonomamente su strategie, le backtesta su dati Hyperliquid reali, e seleziona la migliore.
2. **Execution** — `signal-loader.js` legge il signal JSON prodotto e piazza gli ordini (entry + SL + TP) su Hyperliquid.

Il playbook è **signal-only per default** — non entra mai autonomamente. Propone il trade e aspetta approvazione.

---

### Allocation & Capital Rules

- **Allocazione:** 25% dell'equity disponibile per sessione di ricerca
- **Max leverage:** 3x (hardcoded nel bridge, non sovrascrivibile)
- **Max concurrent positions:** 1 per coin ricercato
- **Reserve:** Mantieni sempre 10% equity libero per fees e margin
- **DRY_RUN:** Sempre `true` di default — ogni signal viene mostrato per revisione prima di chiedere approvazione

---

### Come avviare una sessione di ricerca

Dimmi in chat una di queste cose:

> *"Ricerca una strategia su SOL con autotrade, timeframe 1h, 20 iterazioni"*
> *"Fai un backtest autonomo su BTC 4h"*
> *"Analizza HYPE con autotrade e dimmi cosa trova"*
> *"Carica il segnale più recente per ETH e proponi il trade"*

Risponderò avviando il bridge con i parametri che mi dai.

---

### Parametri configurabili (dimmi quale vuoi cambiare)

| Parametro | Default | Range |
|-----------|---------|-------|
| `coin` | HYPE | Qualsiasi perp HL |
| `timeframe` | 1h | 15m, 1h, 4h, 1d |
| `iterations` | 20 | 5–50 |
| `min_profit_factor` | 1.2 | 1.0–2.0 |
| `max_drawdown` | -25% | -10% a -40% |
| `max_leverage` | 3x | 1x–5x |
| `position_size` | 20% equity | 5%–30% |

---

### Entry Rules — dopo la ricerca

Prima di proporre qualsiasi trade entrato da questo playbook, verifico sempre:

1. `ready_for_live: true` nel signal JSON
2. Nessun warning critico (`warnings` array vuoto o solo informativi)
3. `num_trades >= 10` nel backtest (significatività statistica minima)
4. `profit_factor >= 1.2` confermato
5. `max_drawdown >= -25%` confermato
6. Nessuna posizione aperta sullo stesso coin

Se uno di questi check fallisce → mostro il signal comunque ma **non propongo l'esecuzione**. Ti spiego cosa non va e chiedo se vuoi procedere ugualmente.

---

### Execution Flow (dopo approvazione)

Quando approvi un segnale:

```
1. node signal-loader.js --latest --coin <COIN> --dry-run false
   ├── set leverage (dal signal)
   ├── market entry order
   ├── stop-loss trigger (reduce-only)
   └── take-profit trigger (reduce-only)

2. Registro il trade nel giornale con:
   - signal file usato
   - backtest metrics di riferimento
   - parametri esatti dell'ordine
   - timestamp
```

---

### Exit Strategy

Esco in tre modi, in ordine di priorità:

| Trigger | Azione |
|---------|--------|
| TP hit (trigger order) | Chiusura automatica su exchange |
| SL hit (trigger order) | Chiusura automatica su exchange |
| Segnale di invalidazione | Ti avviso e propongo chiusura manuale |

**Segnali di invalidazione:** trend invertito su 4h, funding estremo contro posizione, drawdown > 50% del target SL.

---

### Heartbeat Triggers (opzionali — attivali tu)

Aggiungi questi trigger se vuoi ricerche automatiche periodiche:

**Weekly Research Scan:**
```
time: 0 9 * * 1  (ogni lunedì alle 9:00)
→ reasoning_job: "Avvia autotrade-bridge su HYPE timeframe 1h, 25 iterazioni.
  Leggi il signal prodotto e confrontalo con le posizioni attuali.
  Se il signal è migliore della strategia corrente, proponimelo."
```

**Daily Signal Review:**
```
time: 0 7 * * *  (ogni mattina alle 7:00)
→ reasoning_job: "Carica l'ultimo signal disponibile in playbooks/signals/.
  Controlla se ci sono posizioni aperte da questo playbook.
  Se non ci sono posizioni e il signal è ancora valido, proponimelo."
```

---

### Limite Storico Dati — Nota importante

Hyperliquid fornisce max **5000 candele** per timeframe. Il bridge calcola automaticamente la data di inizio:

| Timeframe | Storia disponibile |
|-----------|--------------------|
| 15m | ~52 giorni |
| 1h | ~208 giorni |
| 4h | ~833 giorni |
| 1d | ~13 anni |

Per coin molto recenti su HL, il 4h o 1d è preferibile per avere più storia.

---

### State Management

- `idle` — nessuna ricerca in corso, nessuna posizione aperta
- `researching` — autotrade in esecuzione (può richiedere 10–60 minuti)
- `signal_ready` — signal JSON disponibile, in attesa di revisione
- `position_open` — posizione live attiva dal signal
- `paused` — 3 segnali consecutivi non `ready_for_live` → pausa ricerca, avviso utente

---

### Risk Rules (Non-Negotiabili)

- **Mai** eseguire un signal con `ready_for_live: false` senza approvazione esplicita
- **Mai** sovrascrivere SL dopo l'apertura della posizione (tranne per trailing su TP2)
- **Mai** aprire più di 1 posizione per coin contemporaneamente
- **Drawdown giornaliero > 5%** → stop ricerche per il giorno, avviso obbligatorio
- **Signal score < 0.8** (composite) → non proporre il trade, solo mostrare i dati

---

### Script richiesti (presenti in `hypervibe/tools/autotrade/`)

```
hypervibe/
└── tools/
    └── autotrade/
        ├── autotrade-bridge.js   ← genera .env e lancia autotrade
        ├── signal-loader.js      ← carica signal e piazza ordini
        └── autotrade/            ← clone di rv64m/autotrade
```

Installa dipendenze una volta sola:
```bash
cd hypervibe/tools/autotrade
npm install @nktkas/hyperliquid ethers
```
