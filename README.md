# HyperVibe 🚀

**HyperVibe è un agente AI che fa trading autonomo su Hyperliquid per conto tuo.**

Tu gli dici cosa vuoi fare. Lui analizza i mercati, propone i trade, e aspetta la tua approvazione prima di eseguire qualsiasi ordine. Nessun trade parte senza il tuo consenso.

---

## Cosa fa concretamente?

- **Analizza** i mercati crypto 24/7 usando indicatori tecnici reali (RSI, MACD, Bollinger Bands)
- **Propone trade** con ragionamento completo: perché entrare, dove mettere lo stop, dove prendere profitto
- **Aspetta la tua approvazione** — ogni ordine appare come una scheda con un pulsante Approva / Rifiuta
- **Gestisce le posizioni** automaticamente con stop-loss e take-profit nativi sull'exchange
- **Impara** registrando ogni trade con il ragionamento nel giornale

Parli con lui in chat come se fosse un trader esperto:
> *"Analizza HYPE sul grafico 4h e dimmi se c'è un'opportunità"*
> *"Apri un long su BTC con stop a $90.000"*
> *"Monitora le mie posizioni ogni ora"*

---

## Cosa ti serve

| Cosa | Dove ottenerlo |
|------|----------------|
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) (~$5 al mese di utilizzo tipico) |
| **Wallet Hyperliquid** | Il tuo wallet con fondi su [app.hyperliquid.xyz](https://app.hyperliquid.xyz) |
| **PC Windows** con internet | — |

---

## Installazione — un solo comando

Apri il **Prompt dei comandi (CMD)** e incolla questo:

```
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/mikeminer/HyperVibe/main/installer.bat' -OutFile install-hypervibe.bat" && install-hypervibe.bat
```

Il programma fa tutto da solo:
1. Installa Node.js se non ce l'hai
2. Installa Git se non ce l'hai
3. Scarica HyperVibe da GitHub
4. Ti chiede le credenziali (API key, wallet, chiave privata)
5. Avvia il programma e apre il browser

---

## Come aprire il CMD su Windows

1. Premi **Windows + R**
2. Scrivi `cmd`
3. Premi **Invio**
4. Incolla il comando qui sopra

---

## Sicurezza

- La tua chiave privata **non lascia mai il tuo computer**
- Tutti gli ordini passano per il tuo consenso esplicito
- Nessun trade parte automaticamente senza che tu approvi
- I dati sono salvati solo in locale (`~/.hypervibe/`)

---

## Dopo l'installazione

Il browser si apre su **http://localhost:3001**

Per riavviare HyperVibe in futuro: doppio click su **StartHyperVibe.bat** nella stessa cartella dove hai messo l'installer.

---

*HyperVibe è open source. Codice su [github.com/mikeminer/HyperVibe](https://github.com/mikeminer/HyperVibe)*
