"""
settings.py
Centralised configuration. Values are read from environment variables
with sensible production defaults. Copy .env.example → .env and fill in keys.
"""

import os
from dataclasses import dataclass, field


@dataclass
class Settings:
    # ── API Keys ──────────────────────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = field(
        default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", "")
    )
    OPENAI_API_KEY: str = field(
        default_factory=lambda: os.getenv("OPENAI_API_KEY", "")
    )

    # ── Model Selection ───────────────────────────────────────────────────────
    LLAMA_MODEL: str = field(
        default_factory=lambda: os.getenv("LLAMA_MODEL", "llama3.2")
    )
    OPENAI_MODEL: str = field(
        default_factory=lambda: os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    )
    CLAUDE_MODEL: str = field(
        default_factory=lambda: os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")
    )

    # ── Ollama Endpoint ───────────────────────────────────────────────────────
    OLLAMA_BASE_URL: str = field(
        default_factory=lambda: os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    )

    # ── Routing Thresholds ────────────────────────────────────────────────────
    # value_score < LLAMA_THRESHOLD  → LLaMA
    # LLAMA_THRESHOLD ≤ score < OPENAI_THRESHOLD → OpenAI
    # score ≥ OPENAI_THRESHOLD → Claude
    LLAMA_THRESHOLD: float = float(os.getenv("LLAMA_THRESHOLD", "0.30"))
    OPENAI_THRESHOLD: float = float(os.getenv("OPENAI_THRESHOLD", "0.60"))

    # ── Confidence / Escalation ───────────────────────────────────────────────
    CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.55"))
    MAX_ESCALATIONS: int = int(os.getenv("MAX_ESCALATIONS", "2"))

    # ── Token Limits ──────────────────────────────────────────────────────────
    MAX_INPUT_TOKENS: int = int(os.getenv("MAX_INPUT_TOKENS", "3000"))
    MAX_OUTPUT_TOKENS: int = int(os.getenv("MAX_OUTPUT_TOKENS", "1024"))

    # ── Timeouts (seconds) ────────────────────────────────────────────────────
    LLAMA_TIMEOUT_SECS: float = float(os.getenv("LLAMA_TIMEOUT_SECS", "60.0"))
    OPENAI_TIMEOUT_SECS: float = float(os.getenv("OPENAI_TIMEOUT_SECS", "30.0"))
    CLAUDE_TIMEOUT_SECS: float = float(os.getenv("CLAUDE_TIMEOUT_SECS", "180.0"))

    # ── Throughput ────────────────────────────────────────────────────────────
    CONCURRENT_REQUESTS: int = int(os.getenv("CONCURRENT_REQUESTS", "10"))

    # ── Logging ───────────────────────────────────────────────────────────────
    LOG_DIR: str = os.getenv("LOG_DIR", "logs")
    LOG_FILE: str = os.getenv("LOG_FILE", "engine.jsonl")

    # ── Temperature per tier ──────────────────────────────────────────────────
    LLAMA_TEMPERATURE: float = float(os.getenv("LLAMA_TEMPERATURE", "0.3"))
    OPENAI_TEMPERATURE: float = float(os.getenv("OPENAI_TEMPERATURE", "0.3"))
    CLAUDE_TEMPERATURE: float = float(os.getenv("CLAUDE_TEMPERATURE", "0.2"))

    # ── System Prompts ────────────────────────────────────────────────────────
    DEFAULT_SYSTEM_PROMPT: str = os.getenv(
        "DEFAULT_SYSTEM_PROMPT",
        "You are a precise and helpful AI assistant. Be concise but complete.",
    )


# ── .env loader (optional — dotenv not required in prod) ─────────────────────

def load_dotenv(path: str = None) -> None:
    """
    Minimal .env parser.
    Search order:
      1. Explicit path if given
      2. .env in current working directory
      3. .env in parent directory  (picks up HyperVibe root .env)
      4. .env next to this file (engine root)
    First file found wins.
    """
    import pathlib

    candidates = []
    if path:
        candidates.append(pathlib.Path(path))
    candidates += [
        pathlib.Path.cwd() / ".env",
        pathlib.Path.cwd().parent / ".env",
        pathlib.Path(__file__).parent.parent / ".env",
    ]

    env_file = next((c for c in candidates if c.exists()), None)
    if env_file is None:
        return

    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
