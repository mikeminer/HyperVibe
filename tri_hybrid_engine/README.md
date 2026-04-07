# Tri-Hybrid AI Engine

**Intelligent request routing across LLaMA → OpenAI GPT → Anthropic Claude**
based on computational value scoring, confidence estimation, and automatic escalation.

```
                 ┌─────────────────────────────────────┐
  Raw Input ───▶ │         Value Scorer                │
                 │  reasoning_depth × 0.4              │
                 │  uncertainty     × 0.3              │
                 │  impact          × 0.2              │
                 │  complexity      × 0.1              │
                 └──────────┬──────────────────────────┘
                            │ value_score [0,1]
                            ▼
               ┌────────────────────────────┐
               │      Route Decision        │
               │  < 0.30 → LLaMA (local)   │
               │  < 0.60 → OpenAI GPT      │
               │  ≥ 0.60 → Anthropic Claude│
               └────────────┬───────────────┘
                            │
                            ▼
               ┌────────────────────────────┐
               │   Generate + Confidence    │
               │   Estimate Response        │
               │   If conf < threshold:     │
               │     Escalate to next tier  │
               └────────────┬───────────────┘
                            │
                            ▼
                      Final Output
```

---

## Quick Start

### Windows

```
INSTALL.bat
```
Select `[1] Install`, then `[5] Configure API Keys`, then `[2] Run`.

### Linux / macOS

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure keys
cp .env.example .env
# Edit .env with your API keys

# 3. Run
python main.py                   # Interactive REPL
python main.py --demo            # Demo mode
python main.py --health          # Check all adapters
python main.py "Your prompt"     # Single prompt
python main.py --batch file.txt  # Batch mode
```

---

## Configuration

All settings are in `.env`. Key thresholds:

| Variable | Default | Effect |
|---|---|---|
| `LLAMA_THRESHOLD` | `0.30` | Scores below this → LLaMA |
| `OPENAI_THRESHOLD` | `0.60` | Scores below this → OpenAI |
| `CONFIDENCE_THRESHOLD` | `0.55` | Below this → escalate |
| `MAX_ESCALATIONS` | `2` | Max tier upgrades per request |

---

## Architecture

```
tri_hybrid_engine/
├── core/
│   ├── router.py          ← Main orchestrator
│   ├── value_scorer.py    ← Computational value metrics
│   ├── confidence.py      ← Output quality estimation
│   ├── preprocessor.py    ← Token compression & formatting
│   └── logger.py          ← Structured JSONL logging
├── adapters/
│   ├── base.py            ← Unified adapter interface
│   ├── llama_local.py     ← Ollama HTTP adapter
│   ├── openai_adapter.py  ← OpenAI async adapter
│   └── claude_adapter.py  ← Anthropic async adapter
├── config/
│   └── settings.py        ← Environment-driven config
├── logs/
│   ├── engine.jsonl       ← Per-request routing log
│   └── session_summary.json
├── tests/
│   └── test_engine.py
├── main.py
├── requirements.txt
├── .env.example
└── INSTALL.bat
```

---

## LLaMA Setup (Local)

Requires [Ollama](https://ollama.ai/download):

```bash
# Install Ollama, then:
ollama pull llama3.2   # 2GB — recommended default
ollama pull mistral    # 4GB — alternative
```

The Windows installer (option `[6]`) handles this automatically.

---

## Cost Estimation

The engine logs per-request cost estimates:

| Tier | Input ($/1k tok) | Output ($/1k tok) |
|---|---|---|
| LLaMA (local) | $0.0000 | $0.0000 |
| OpenAI gpt-4o-mini | $0.0015 | $0.0020 |
| Claude haiku-4-5 | $0.0030 | $0.0150 |

Session totals are written to `logs/session_summary.json`.

---

## HyperVibe Integration

```python
import asyncio
from config.settings import Settings, load_dotenv
from core.router import TriHybridRouter

load_dotenv()
settings = Settings()
router = TriHybridRouter(settings)

async def analyse_trade_signal(signal_text: str) -> str:
    output, record = await router.route(
        raw_input=signal_text,
        system_prompt="You are an expert Hyperliquid perpetuals trader.",
    )
    return output

# Usage
signal = asyncio.run(analyse_trade_signal(
    "HYPE/USDT showing RSI divergence at 0.618 fib retracement. "
    "Volume spike 3x average. Should I enter long with 2x leverage?"
))
print(signal)
```

---

## Logs

Every request writes a JSONL record to `logs/engine.jsonl`:

```json
{
  "request_id": "a1b2c3d4",
  "timestamp": "2025-01-01T12:00:00+00:00",
  "input_preview": "HYPE/USDT showing RSI divergence...",
  "value_score": 0.7234,
  "value_metrics": {"reasoning_depth": 0.81, "uncertainty": 0.65, ...},
  "initial_route": "claude",
  "final_route": "claude",
  "escalations": [],
  "confidence": 0.891,
  "latency_ms": 1240,
  "cost_usd": 0.00087,
  "success": true
}
```

---

## Running Tests

```bash
pytest tests/ -v
```

---

## License

MIT — built for HyperVibe / pappardelle.eth
