![HyperVibe](https://private-user-images.githubusercontent.com/7491777/571052171-159736d3-af69-4499-a7bb-215ffe463ff6.png)

# HyperVibe by pappardelle.eth 🚀

**HyperVibe è un agente AI che fa trading autonomo su Hyperliquid per conto tuo.**

Tu gli dici cosa vuoi fare. Lui analizza i mercati, propone i trade, e aspetta la tua approvazione prima di eseguire qualsiasi ordine. Nessun trade parte senza il tuo consenso.

> 🇬🇧 [English version → README.en.md](./README.en.md)

---

## Cosa fa concretamente?

- **Analizza** i mercati crypto 24/7 usando indicatori tecnici reali (RSI, MACD, Bollinger Bands)
- **Propone trade** con ragionamento completo: perché entrare, dove mettere lo stop, dove prendere profitto
- **Aspetta la tua approvazione** — ogni ordine appare come una scheda con un pulsante Approva / Rifiuta
- **Gestisce le posizioni** automaticamente con stop-loss e take-profit nativi sull'exchange
- **Ricerca strategie** tramite backtesting autonomo su qualsiasi perpetual Hyperliquid
- **Impara** registrando ogni trade con il ragionamento nel giornale

---

## Come parlare con l'agente

Apri il browser su **http://localhost:3001** e scrivi in chat come se fosse un trader esperto.

### 📊 Analisi di mercato
```
Analizza HYPE sul grafico 4h e dimmi se c'è un'opportunità
```
```
Calcola RSI, MACD e Bollinger Bands su SOL 1h
```
```
Mostrami i top mover di oggi su Hyperliquid
```
```
Controlla il funding rate su ETH e BTC
```
```
Quanto è il mio account value totale?
```

### 📈 Trading
```
Apri un long su BTC con stop a $90.000
```
```
Chiudi il 50% della mia posizione su HYPE
```
```
Imposta leverage 3x su SOL
```
```
Mostrami le mie posizioni aperte e il PnL
```
```
Cancella tutti gli ordini aperti su ETH
```

### 🔬 Autotrade Strategy Research
```
Ricerca una strategia su SOL, timeframe 1h, 20 iterazioni
```
```
Avvia autotrade su BTC 4h con 30 iterazioni e profit factor minimo 1.3
```
```
Fai un backtest autonomo su HYPE timeframe 1h
```
```
Mostrami il risultato della ricerca su SOL
```
```
Carica l'ultimo signal disponibile per ETH e proponi il trade
```
```
Avvia autotrade su ETH 1h con drawdown max -20% e leverage max 2x
```

### ⏰ Monitor e automazione
```
Monitora le mie posizioni ogni ora
```
```
Crea un alert se HYPE scende sotto $15
```
```
Crea un trigger che scansiona i mercati ogni mattina alle 8:00
```
```
Mostrami il mio journal degli ultimi 7 giorni
```

### 📋 Playbook e strategie
```
Carica il playbook HYPE Momentum Scalp
```
```
Attiva il playbook Autotrade Strategy Research su SOL
```
```
Crea un nuovo playbook per fare funding arbitrage su HYPE
```

---

## Autotrade Strategy Research 🔬

Integra [autotrade](https://github.com/rv64m/autotrade) in HyperVibe come pipeline di ricerca autonoma.

```
autotrade (backtesting LLM) ──▶ signal JSON ──▶ proposta trade ──▶ tua approvazione ──▶ Hyperliquid
```

### Workflow completo dalla chat

**Step 1 — Avvia la ricerca:**
```
Ricerca una strategia su SOL, timeframe 1h, 20 iterazioni
```
> L'agente risponde: *"Ricerca avviata su SOL (1h, 20 iterazioni). Tempo stimato: ~50 minuti."*

**Step 2 — Carica il risultato:**
```
Mostrami il risultato della ricerca su SOL
```
> L'agente mostra: Profit Factor, Max Drawdown, Sharpe, SL%, TP%, Leverage, Size.

**Step 3 — Proposta trade:**
```
Proponi il trade basato sul signal SOL
```
> Appare la scheda con **Approva / Rifiuta**.

**Step 4 — Approvi → trade live.**

### Timeframe e storia disponibile

| Timeframe | Storia su Hyperliquid |
|-----------|-----------------------|
| 15m | ~52 giorni |
| 1h | ~208 giorni |
| 4h | ~833 giorni |
| 1d | ~13 anni |

---

## Playbooks 📋

**Playbook disponibili nel Playbook Store:**

| Playbook | Strategia |
|---|---|
| HYPE Momentum Scalp | Trade veloci su HYPE, bias long, conti piccoli |
| Funding Rate Arbitrage | Fading dei funding estremi, market neutral |
| BTC/ETH Trend Follower | Swing trade macro, 1-5 giorni |
| OpenClaw Autonomous | Pipeline completo automatico |
| Top Mover Breakout | Scan mattutino, breakout del giorno |
| HYPE Fee Monitor & Burn Predictor | Monitor onchain HAF fees, segnali BOUNCE_HIGH / BURN_SPIKE |
| **Autotrade Strategy Research** ⭐ | Ricerca autonoma strategie via backtesting LLM su qualsiasi perpetual |

---

## Skills 🛠️

**Skill disponibili nello Skill Store:**

| Skill | Cosa fa |
|---|---|
| OpenClaw 3-Agent Pipeline | Analisi Monte Carlo + Kelly criterion + exit ladder |
| Funding Rate Filter | Quando evitare trade per funding troppo alto |
| Unified Account Sizing | Calcolo position sizing per Unified Account |
| HYPE Momentum | Regole specifiche per tradare HYPE |
| Drawdown Guard | Quando smettere di tradare per proteggere il capitale |

---

## Cosa ti serve

| Cosa | Dove ottenerlo |
|---|---|
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) |
| **Wallet Hyperliquid** | [app.hyperliquid.xyz](https://app.hyperliquid.xyz) |
| **PC Windows** con internet | — |
| **Claude Code CLI** *(per Autotrade)* | Installato automaticamente dall'installer |

---

## Installazione — un solo comando

Apri il **Prompt dei comandi (CMD)** e incolla questo:

```
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/mikeminer/HyperVibe/main/installer.bat' -OutFile installer.bat" && installer.bat
```

**Come aprire il CMD:** premi **Windows + R** → scrivi `cmd` → premi Invio → incolla il comando.

L'installer v3.2 fa tutto da solo:

1. Installa Node.js se non ce l'hai
2. Installa Git se non ce l'hai
3. Scarica HyperVibe da GitHub (con submodule autotrade)
4. Chiede se installare il modulo **Autotrade Strategy Research** *(opzionale, ~200MB)*
5. Installa Claude Code CLI per il loop LLM *(se Autotrade è selezionato)*
6. Scelta motore AI: Anthropic API, Qwen 2.5 14B locale, o Gemma 4 26B locale
7. Ti chiede le credenziali (API key, wallet, chiave privata)
8. Avvia il programma e apre il browser

---

## Le Sei Primitive

| # | Primitiva | Ruolo |
|---|---|---|
| 01 | **Market Tooling** | 20 tool: prezzi live, candele, indicatori, funding, orderbook, posizioni |
| 02 | **Heartbeat** | Loop di monitoraggio ogni 30s — sveglia l'agente solo quando serve |
| 03 | **Triggers** | Condizione + azione: stop-loss automatici, scan mattutini, alert |
| 04 | **Permissions** | Gate di approvazione — nessun trade senza il tuo consenso |
| 05 | **Playbooks** | Documento di strategia caricato ad ogni run dell'agente |
| 06 | **Learnings** | Giornale immutabile di ogni trade con ragionamento completo |

---

## Motori AI supportati

| Motore | Tipo | Note |
|---|---|---|
| **Anthropic API** | Cloud | Claude Sonnet, qualità massima, a pagamento |
| **Qwen 2.5 14B** | Locale | Gratuito, ~9GB RAM, consigliato per uso quotidiano |
| **Gemma 4 26B MoE** | Locale | Gratuito, ~20GB RAM, alta qualità |

---

## Sicurezza

- La tua chiave privata **non lascia mai il tuo computer**
- Tutti gli ordini passano per il tuo consenso esplicito
- Nessun trade parte automaticamente senza che tu premi Approva
- I dati sono salvati solo in locale
- Per Autotrade: usa sempre l'**API wallet** di Hyperliquid, mai la chiave principale

---

## Dopo l'installazione

Il browser si apre su **http://localhost:3001**

Per riavviare HyperVibe: doppio click su **StartHyperVibe.bat** nella cartella di installazione.

---

*HyperVibe è open source — [github.com/mikeminer/HyperVibe](https://github.com/mikeminer/HyperVibe)*
