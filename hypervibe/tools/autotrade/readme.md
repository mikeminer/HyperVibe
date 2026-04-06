# Autotrade Strategy Research — Guida Comandi

Guida completa per usare il modulo di ricerca autonoma strategie integrato in HyperVibe.

---

## Prerequisiti

Prima di tutto, verifica che il modulo sia installato correttamente:

```bat
dir hypervibe\tools\autotrade\autotrade\src
REM deve mostrare: program.md  train.py  prepare.py  strategies/

dir hypervibe\tools\autotrade\
REM deve mostrare: autotrade-bridge.js  signal-loader.js  node_modules/
```

Verifica dipendenze npm:
```bat
cd hypervibe\tools\autotrade
dir node_modules\@nktkas
REM deve mostrare: hyperliquid
```

---

## Setup una tantum (solo prima volta)

```bat
cd hypervibe\tools\autotrade

REM Inizializza package.json e installa dipendenze
npm install

REM Verifica Python (richiesto da autotrade)
python --version
REM oppure
python3 --version

REM Installa dipendenze Python di autotrade
cd autotrade
pip install uv
uv sync
cd ..
```

---

## Struttura cartelle dopo installazione

```
HyperVibe/
└── hypervibe/
    └── tools/
        └── autotrade/
            ├── autotrade-bridge.js     ← bridge principale
            ├── signal-loader.js        ← esecutore ordini
            ├── node_modules/           ← @nktkas/hyperliquid, ethers
            ├── package.json
            └── autotrade/              ← submodule rv64m/autotrade
                ├── src/
                │   ├── program.md      ← istruzioni per il LLM
                │   ├── train.py        ← runner backtest
                │   ├── prepare.py      ← dati + settings
                │   └── strategies/
                │       └── generated/  ← strategie generate
                ├── .env                ← configurazione (generata dal bridge)
                └── src/results.jsonl   ← log esperimenti
```

---

## Comandi principali

### 1. Pipeline completa (ricerca + export segnale)

```bat
cd hypervibe\tools\autotrade

REM HYPE, timeframe 1h, 20 iterazioni
node autotrade-bridge.js run --coin HYPE --timeframe 1h --iterations 20

REM SOL, timeframe 4h, 30 iterazioni, profit factor minimo 1.3
node autotrade-bridge.js run --coin SOL --timeframe 4h --iterations 30 --min-pf 1.3

REM BTC, timeframe 4h, leverage massimo 2x, drawdown max -20%
node autotrade-bridge.js run --coin BTC --timeframe 4h --max-leverage 2 --max-drawdown -20

REM ETH, conto piccolo 500 USDC simulati
node autotrade-bridge.js run --coin ETH --timeframe 1h --total-cash 500
```

---

### 2. Solo generare il .env (senza avviare la ricerca)

Utile per verificare i parametri prima di lanciare:

```bat
node autotrade-bridge.js env --coin SOL --timeframe 1h

REM Controlla il .env generato
type autotrade\.env
```

Output atteso:
```
EXCHANGE_ID=hyperliquid
MARKET_TYPE=swap
SYMBOL=SOL/USDC:USDC
START_DATE=2025-09-11
END_DATE=
TOTAL_CASH=10000
MAX_DRAWDOWN_LIMIT=-25
MIN_PROFIT_FACTOR=1.2
MAX_LEVERAGE=3
TIMEFRAME=1h
```

---

### 3. Parsare risultati già esistenti

Dopo una ricerca, leggi e analizza i risultati senza rieseguire:

```bat
REM Mostra la migliore strategia trovata per SOL
node autotrade-bridge.js parse --coin SOL

REM Con filtri più stretti
node autotrade-bridge.js parse --coin BTC --min-pf 1.5 --max-drawdown -15
```

---

### 4. Esportare il segnale

Converte il risultato migliore in un signal JSON pronto per l'esecuzione:

```bat
REM Esporta segnale per HYPE
node autotrade-bridge.js export --coin HYPE

REM Specifica cartella di output
node autotrade-bridge.js export --coin SOL --out ..\..\playbooks\signals\

REM Controlla il segnale generato
dir ..\..\playbooks\signals\
type ..\..\playbooks\signals\signal_sol_1h_*.json
```

---

### 5. Dry run (verifica ordini senza eseguire)

Carica un signal e mostra cosa farebbe senza piazzare ordini reali:

```bat
cd hypervibe\tools\autotrade

REM Carica l'ultimo segnale disponibile per SOL (DRY RUN default)
node signal-loader.js --latest --coin SOL

REM Oppure specifica il file esatto
node signal-loader.js --signal ..\..\playbooks\signals\signal_sol_1h_1234567890.json
```

Output atteso:
```
[INFO] Mark price : $145.32
[INFO] Account    : $2840.00 equity | $2100.00 available
[INFO] Order size : 4.32 SOL (notional ~$627.78)
[INFO] SL price   : $137.05
[INFO] TP price   : $158.20
[ DRY] DRY RUN — no orders placed. Set --dry-run false to go live.
[ DRY] Would: SET leverage 3x
[ DRY] Would: BUY 4.32 SOL @ market (~$145.32)
[ DRY] Would: SET SL @ $137.0500
[ DRY] Would: SET TP @ $158.2000
```

---

### 6. Esecuzione live (ordini reali)

⚠️ **Solo dopo aver verificato il dry run.**

```bat
REM Imposta le variabili d'ambiente (una volta per sessione CMD)
set HL_WALLET_ADDRESS=0x...tuoindirizzo...
set HL_PRIVATE_KEY=0x...tuachiaveAPI...

REM Esegui live con l'ultimo segnale SOL
node signal-loader.js --latest --coin SOL --dry-run false

REM Oppure con file specifico
node signal-loader.js --signal ..\..\playbooks\signals\signal_sol_1h_xxx.json --dry-run false
```

> Usa sempre la **API wallet key** generata su `app.hyperliquid.xyz/API`,
> mai la chiave principale del wallet.

---

### 7. Monitor posizione aperta

```bat
REM Monitora SOL ogni 5 secondi
node signal-loader.js --monitor --coin SOL

REM Output ogni 5s:
REM [INFO] SOL | size: 4.32 | entry: $145.32 | PnL: $+12.40 | lev: 3x
```

Premi `Ctrl+C` per fermare il monitor.

---

## Tutti i parametri disponibili

### autotrade-bridge.js

| Parametro | Default | Descrizione |
|-----------|---------|-------------|
| `--coin` | HYPE | Ticker del perpetual su Hyperliquid |
| `--timeframe` | 1h | Timeframe: `15m` `1h` `4h` `1d` |
| `--iterations` | 20 | Numero iterazioni LLM (più = meglio ma più lento) |
| `--start-date` | auto | Data inizio backtest `YYYY-MM-DD` o `auto` |
| `--total-cash` | 10000 | Capitale simulato in USDC |
| `--max-drawdown` | -25 | Drawdown massimo accettabile (%) |
| `--min-pf` | 1.2 | Profit factor minimo |
| `--max-leverage` | 3 | Leva massima |
| `--llm` | claude | CLI LLM: `claude` `codex` `gemini` |
| `--autotrade-dir` | `./autotrade` | Path al clone di autotrade |
| `--results` | `./autotrade/src/results.jsonl` | Path al file risultati |
| `--out` | `../../playbooks/signals/` | Cartella output signal JSON |

### signal-loader.js

| Parametro | Default | Descrizione |
|-----------|---------|-------------|
| `--signal` | — | Path a un signal JSON specifico |
| `--latest` | — | Usa l'ultimo signal disponibile |
| `--coin` | — | Filtra per coin (con `--latest` o `--monitor`) |
| `--dry-run` | `true` | `false` per eseguire ordini reali |
| `--monitor` | — | Monitora posizione aperta |

---

## Coin disponibili su Hyperliquid

```
BTC   ETH   SOL   HYPE  SUI   AVAX
TAO   ENA   NEAR  LINK  DOT   UNI
ADA   XRP   DOGE  LTC   AAVE  APT
```

Lista completa su: `app.hyperliquid.xyz/trade`

---

## Limite storico dati

Hyperliquid fornisce massimo **5000 candele** per chiamata API:

| Timeframe | Storia disponibile |
|-----------|--------------------|
| 15m       | ~52 giorni         |
| 1h        | ~208 giorni        |
| 4h        | ~833 giorni        |
| 1d        | ~13 anni           |

Il bridge calcola `START_DATE` automaticamente quando impostato su `auto`.

---

## Aggiornare autotrade

Quando rv64m rilascia aggiornamenti al repo:

```bat
cd hypervibe\tools\autotrade\autotrade
git pull origin main

REM Torna alla root e committa il nuovo riferimento
cd ..\..\..\..
git add hypervibe\tools\autotrade\autotrade
git commit -m "chore: update autotrade submodule"
git push
```

---

## Troubleshooting

**`python` non trovato:**
```bat
REM Installa Python da https://python.org (spunta "Add to PATH")
REM Poi riprova:
python --version
```

**`uv` non trovato:**
```bat
pip install uv
REM oppure
winget install astral-sh.uv
```

**`claude` non trovato (per le iterazioni LLM):**
```bat
npm install -g @anthropic-ai/claude-code
claude --version
```

**Signal non `ready_for_live`:**
- Aumenta `--iterations` (più esperimenti = strategia migliore)
- Abbassa `--min-pf` (es. `1.1` invece di `1.2`)
- Prova un timeframe più alto (`4h` invece di `1h`)
- Il bridge forza `DRY_RUN=true` automaticamente in questo caso

**Errore `HL_PRIVATE_KEY not set`:**
```bat
set HL_WALLET_ADDRESS=0x...
set HL_PRIVATE_KEY=0x...
REM poi riesegui il comando
```

---

## Checklist prima di andare live

- [ ] Dry run completato senza errori
- [ ] `ready_for_live: true` nel signal JSON
- [ ] `warnings` array vuoto o solo note informative
- [ ] Nessuna posizione aperta sullo stesso coin
- [ ] Stai usando la API wallet key (non la chiave principale)
- [ ] Leverage ≤ 3x sulla prima run
- [ ] Hai abbastanza balance per il position sizing
