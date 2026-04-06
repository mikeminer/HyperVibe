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

Parli con lui in chat come se fosse un trader esperto:

> *"Analizza HYPE sul grafico 4h e dimmi se c'è un'opportunità"*
> *"Apri un long su BTC con stop a $90.000"*
> *"Ricerca una strategia su SOL con autotrade, timeframe 1h, 20 iterazioni"*
> *"Monitora le mie posizioni ogni ora"*

---

## Playbooks 📋 — La tua strategia di trading

Un Playbook è come un **biglietto di istruzioni** che dai all'agente con scritto tutto quello che deve sapere su di te e sulla tua strategia:

> *"Ciao, voglio fare trading su HYPE. Non rischiare mai più dell'1% per trade. Usa sempre lo stop loss. Se perdo più del 3% in un giorno, smetti di tradare."*

L'agente legge questo biglietto **ogni volta** che si sveglia — così si comporta sempre in modo coerente con la tua strategia, senza che tu debba rispiegare tutto da capo.

Puoi avere più playbook: uno per HYPE, uno per BTC, uno per il funding arbitrage — ognuno con le sue regole e la sua allocazione di capitale.

**Playbook disponibili nel Playbook Store:**

| Playbook | Strategia |
|---|---|
| HYPE Momentum Scalp | Trade veloci su HYPE, bias long, conti piccoli |
| Funding Rate Arbitrage | Fading dei funding estremi, market neutral |
| BTC/ETH Trend Follower | Swing trade macro, 1-5 giorni |
| OpenClaw Autonomous | Pipeline completo automatico |
| Top Mover Breakout | Scan mattutino, breakout del giorno |
| HYPE Fee Monitor & Burn Predictor | Monitor onchain HAF fees, calcolo buyback/burn, segnali BOUNCE_HIGH / BURN_SPIKE |
| **Autotrade Strategy Research** ⭐ | Ricerca autonoma strategie via backtesting LLM su qualsiasi perpetual HL |

---

## Autotrade Strategy Research 🔬

Il playbook **Autotrade Strategy Research** integra [autotrade](https://github.com/rv64m/autotrade) in HyperVibe come pipeline di ricerca autonoma.

```
autotrade (backtesting LLM) ──▶ autotrade-bridge.js ──▶ signal JSON ──▶ signal-loader.js ──▶ Hyperliquid
```

**Come funziona:**
1. Dici in chat il coin e il timeframe che vuoi studiare
2. Claude Code itera autonomamente su strategie, le backtesta su dati Hyperliquid reali
3. Il bridge seleziona la migliore strategia e genera un signal JSON
4. Il signal viene proposto per approvazione prima di qualsiasi ordine live

**Coin supportati:** qualsiasi perpetual su Hyperliquid (BTC, ETH, SOL, HYPE, SUI, AVAX, TAO...)

**Timeframe disponibili:**

| Timeframe | Storia disponibile su HL |
|-----------|--------------------------|
| 15m | ~52 giorni |
| 1h | ~208 giorni |
| 4h | ~833 giorni |
| 1d | ~13 anni |

**Richiede:** Claude Code CLI (`npm install -g @anthropic-ai/claude-code`) — installato automaticamente dall'installer v3.2.

---

## Skills 🛠️ — Le tecniche dell'agente

Una Skill è un **manuale tecnico** che insegni all'agente una volta sola. Ogni volta che deve fare quella cosa, apre il manuale e lo segue alla lettera.

La differenza: il **Playbook** dice *cosa* fare, la **Skill** dice *come* farlo.

**Skill disponibili nello Skill Store:**

| Skill | Cosa fa |
|---|---|
| OpenClaw 3-Agent Pipeline | Analisi Monte Carlo + Kelly criterion + exit ladder prima di ogni trade |
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

## Struttura del repo

```
HyperVibe/
├── hypervibe/                    ← app Node.js principale
│   ├── tools/
│   │   └── autotrade/            ← modulo ricerca strategie
│   │       ├── autotrade-bridge.js
│   │       ├── signal-loader.js
│   │       └── autotrade/        ← submodule rv64m/autotrade
│   └── playbooks/
│       └── signals/              ← signal JSON generati
├── playbooks/                    ← playbook .md per il Playbook Store
├── skills/                       ← skill .md per lo Skill Store
├── playbooks-registry.json       ← registro playbook
├── skills-registry.json          ← registro skill
└── installer.bat                 ← installer v3.2
```

---

*HyperVibe è open source — [github.com/mikeminer/HyperVibe](https://github.com/mikeminer/HyperVibe)*
