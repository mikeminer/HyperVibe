# HyperVibe 🚀

> Il sistema agente per il trading autonomo su Hyperliquid Perpetuals.

Sei primitive che danno a Claude tutto ciò di cui ha bisogno per tradare per conto tuo — e niente di più di quanto tu abbia autorizzato.

```
$ npm start

  ✓ HyperVibe attivo su http://localhost:3001
```

---

## Cos'è HyperVibe?

HyperVibe è un **harness** — un ambiente strutturato che permette a un modello di linguaggio di ragionare sui mercati, agire per conto tuo e accumulare giudizio nel tempo, senza che tu debba supervisionarlo continuamente.

L'idea centrale è semplice: i modelli LLM sono già capaci di ragionamenti sofisticati sui mercati. Quello che mancano è l'**infrastruttura**: una connessione in tempo reale al mercato, il senso del tempo, una memoria che persiste tra le sessioni, un loop di monitoraggio economico e un sistema di fiducia che garantisce che nulla accada senza il tuo consenso. HyperVibe fornisce tutto questo.

Il risultato è un agente di trading a cui puoi dare una strategia in italiano — e poi lasciare andare da solo.

---

## Le Sei Primitive

| # | Primitiva | Ruolo |
|---|-----------|-------|
| 01 | **Market Tooling** | 20 tool: prezzi live, candele, indicatori, funding rate, orderbook, posizioni, valore del conto, vault |
| 02 | **Heartbeat** | Loop di monitoraggio ogni 30s. Valuta trigger code/time/LLM a basso costo. Sveglia l'agente solo quando qualcosa si attiva. |
| 03 | **Triggers** | Coppie condizione + azione. `hard_order` per stop/target. `reasoning_job` per tutto ciò che richiede analisi. |
| 04 | **Permissions** | Gate di approvazione a livello di codice. Ogni trade è una scheda strutturata che approvi o rifiuti. |
| 05 | **Playbooks** | Documenti di strategia persistenti caricati come contesto ad ogni run dell'agente. |
| 06 | **Learnings** | Giornale di trading immutabile. Ogni eseguito registrato con il ragionamento completo. |

---

## I 20 Tool

### Tool di lettura (nessuna approvazione richiesta)

| Tool | Cosa fa |
|------|---------|
| `get_price` | Prezzo mid live per uno o più coin |
| `get_all_mids` | Tutti i prezzi mid dei perpetuals |
| `get_positions` | Posizioni aperte con PnL non realizzato, prezzo di entrata, prezzo mark, leva |
| `get_account_value` | Equity totale, margine usato, saldo prelevabile |
| `get_open_orders` | Ordini limite in attesa |
| `get_fills` | Storico eseguiti recenti |
| `get_funding_payments` | Pagamenti funding storici ricevuti/pagati |
| `get_candles` | Dati OHLCV da 1m a 1d |
| `compute_indicators` | RSI, MACD, EMA, SMA, Bollinger Bands, ATR — calcolati da OHLCV live |
| `get_funding_rate` | Funding rate corrente e previsto + Open Interest |
| `get_orderbook` | Profondità L2 bid/ask con quantità |
| `get_market_info` | Leva massima, decimali size, volume 24h, open interest |
| `get_top_movers` | Maggiori guadagni e perdite nelle ultime 24h |
| `search_coins` | Cerca mercati perpetuals per nome o simbolo |
| `get_vault_details` | TVL del vault, leader, storico performance |

### Tool di scrittura (approvazione obbligatoria)

| Tool | Cosa fa |
|------|---------|
| `place_order` | Mette in coda un ordine market o limit per l'approvazione |
| `cancel_order` | Mette in coda la cancellazione di un ordine |
| `set_leverage` | Mette in coda un cambio di leva |

### Gestione primitive

| Tool | Cosa fa |
|------|---------|
| `create_trigger` | Crea un trigger Heartbeat (code/time/llm) |
| `create_playbook` | Crea un nuovo playbook di strategia |
| `add_observation` | Registra un'osservazione nel giornale |

---

## Installazione

### Requisiti

- **Node.js ≥ 20** → scarica da [nodejs.org](https://nodejs.org)
- **API key Anthropic** → ottieni da [console.anthropic.com](https://console.anthropic.com)
- **Wallet Hyperliquid** → chiave privata + indirizzo pubblico

### Passo 1 — Clona il repository

```bash
git clone https://github.com/mikeminer/HyperVibe.git
cd HyperVibe/hypervibe
```

### Passo 2 — Installa le dipendenze

```bash
npm install
```

> ⚠️ **Windows:** `better-sqlite3` è un modulo nativo e richiede i tool di compilazione C++.
> Se l'installazione fallisce, installa prima [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) selezionando **"Desktop development with C++"**.

### Passo 3 — Configura le credenziali

```bash
# Linux / macOS
cp .env.example .env

# Windows
copy .env.example .env
```

Apri `.env` con un editor di testo e compila:

```env
# Obbligatorio
ANTHROPIC_API_KEY=sk-ant-...

# Obbligatorio per vedere i dati del conto
HL_WALLET_ADDRESS=0x...

# Obbligatorio per eseguire trade
HL_PRIVATE_KEY=0x...

# Rete: mainnet (default) o testnet
HL_NETWORK=mainnet

# Opzionale: se operi tramite un vault
# HL_VAULT_ADDRESS=0x...

# Porta del server (default: 3001)
PORT=3001
```

> 🔒 **Sicurezza:** la chiave privata non lascia mai il tuo computer. La firma degli ordini avviene localmente prima di inviare il payload firmato a Hyperliquid.

### Passo 4 — Avvia

```bash
npm start
```

Il browser si apre automaticamente su **http://localhost:3001**.
La documentazione è disponibile su **http://localhost:3001/docs.html**.

Tutti i dati (playbook, trigger, giornale) sono salvati localmente in `~/.hypervibe/hypervibe.db`.

---

## Utilizzo

### Parla con il tuo portfolio
> *"Quali sono le mie posizioni attuali e il PnL non realizzato?"*

### Analisi tecnica
> *"Fai un'analisi tecnica su HYPE: RSI, MACD e Bollinger Bands sul timeframe 4h."*

### Crea un playbook in chat
> *"Crea un playbook momentum per HYPE. Bias long, leva 2x, mai rischiare più dell'1% del capitale per trade, chiudi tutto se il drawdown giornaliero supera il 3%."*

### Lascia tradare l'agente
> *"Il RSI 4h di HYPE è appena sceso sotto 35 con alto volume. Credo sia ipervenduto. Imposta un long con gli stop appropriati."*

### Trigger mattutino automatico
> Crea un trigger time: `0 8 * * *` → `reasoning_job` → *"Analizza i top mover e identifica il miglior setup del giorno."*

---

## Come funziona il Heartbeat

Il Heartbeat è il loop di monitoraggio economico. Valuta i trigger ogni 30 secondi senza usare Claude Sonnet — il modello principale si sveglia solo quando una condizione si attiva.

| Modalità | Valutato da | Costo per tick | Esempio |
|----------|-------------|----------------|---------|
| `code` | JavaScript puro | ~$0 | `prices["BTC"] <= 90000` |
| `time` | node-cron | ~$0 | `0 8 * * *` (ogni mattina alle 8) |
| `llm` | Claude Haiku (sì/no) | Minimo | *"Il funding di HYPE supera lo 0.1% all'ora?"* |

### Tipi di azione trigger

| Tipo | Cosa succede | Agente coinvolto? | Uso tipico |
|------|-------------|-------------------|-----------|
| `hard_order` | L'ordine viene eseguito immediatamente in codice puro — nessun ragionamento, nessuna coda di approvazione. Pre-autorizzato alla creazione del trigger. | No | Stop-loss, take-profit, chiusure d'emergenza |
| `reasoning_job` | Claude Sonnet si sveglia con il contesto del trigger e il Playbook caricato, analizza, e può mettere in coda approvazioni. | Sì | Scan mattutini, revisione posizioni, analisi event-driven |

---

## Il Gate di Approvazione

Ogni trade proposto dall'agente appare nell'UI come una **scheda di approvazione strutturata** contenente:
- Coin, direzione (BUY/SELL), dimensione, tipo ordine
- Il ragionamento completo che ha portato alla decisione
- I segnali che si sono attivati

Un click per **Approvare** o **Rifiutare**. Nessun trade viene eseguito senza consenso esplicito.

I `hard_order` (stop-loss, target) sono pre-autorizzati al momento della creazione del trigger — il consenso è dato quando si definisce la condizione e l'ordine esatto.

---

## Architettura

```
hypervibe/
├── bin/hypervibe.js          Punto di ingresso CLI
├── public/
│   ├── index.html            Interfaccia chat + approval cards
│   └── docs.html             Documentazione
├── src/
│   ├── server.js             Server Express + WebSocket
│   ├── hl/
│   │   ├── api.js            Client REST Hyperliquid (info + exchange)
│   │   └── signer.js         Firma EIP-712 (ethers v6 + msgpackr)
│   ├── primitives/
│   │   ├── heartbeat.js      Loop monitoraggio 30s
│   │   ├── triggers.js       CRUD + valutazione trigger + node-cron
│   │   ├── permissions.js    Gate di approvazione
│   │   ├── playbooks.js      CRUD playbook + iniezione contesto
│   │   └── learnings.js      Giornale trading + osservazioni
│   ├── agent/
│   │   ├── tools.js          20 tool + indicatori tecnici
│   │   └── agent.js          Integrazione Claude Sonnet
│   └── store/db.js           SQLite locale (better-sqlite3)
```

### Firma on-chain

HyperVibe implementa la firma L1 di Hyperliquid da zero:
1. Codifica l'azione in msgpack
2. Concatena con nonce uint64BE e indirizzo vault opzionale
3. Hash keccak256
4. Firma come EIP-712 tipo `Agent` con chainId 1337

La chiave privata non lascia mai la macchina locale.

---

## Troubleshooting

### `better-sqlite3` non si installa (Windows)
```powershell
# Da PowerShell come Amministratore
npm install --global windows-build-tools
npm install
```
Oppure installa manualmente [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

### Git chiede username/password e il push fallisce
GitHub non accetta più le password normali se hai il 2FA attivo. Genera un **Personal Access Token**:
- GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
- Scope necessario: `repo`
- Usa il token come password quando git te lo chiede

### Il browser non si apre automaticamente
Apri manualmente: **http://localhost:3001**

### Modalità sola lettura (no trading)
Se non hai configurato `HL_PRIVATE_KEY` nel `.env`, l'app funziona in modalità lettura: puoi vedere posizioni, prezzi e analisi, ma le approvazioni falliranno. Aggiungi la chiave privata per abilitare il trading.

---

## Differenze rispetto a VibeTrade

| VibeTrade | HyperVibe |
|-----------|-----------|
| NSE / Dhan (mercato azionario indiano) | Hyperliquid perpetuals |
| Solo orari di mercato | 24/7 |
| INR | USDC |
| Azioni NSE | 100+ mercati perp |
| API broker Dhan | Firma on-chain diretta con wallet |
| P/E, fondamentali, news | Funding rate, Open Interest, vault |

---

## Licenza

MIT — libero di usare, modificare e distribuire.
