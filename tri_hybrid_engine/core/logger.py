"""
logger.py
Structured JSON logger for routing decisions, cost tracking, and escalation events.
Thread-safe with async flush support.
"""

import json
import time
import uuid
import asyncio
import logging
from pathlib import Path
from typing import Optional, Any
from datetime import datetime, timezone
from dataclasses import dataclass, asdict, field


# ─── Cost Table (USD per 1k tokens) ──────────────────────────────────────────
COST_TABLE = {
    "llama":  {"input": 0.0000, "output": 0.0000},   # local, negligible
    "openai": {"input": 0.0015, "output": 0.0020},   # gpt-4o-mini defaults
    "claude": {"input": 0.0030, "output": 0.0150},   # claude-3-5-haiku
}


# ─── Log Record ───────────────────────────────────────────────────────────────

@dataclass
class RouteRecord:
    request_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    input_preview: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    value_score: float = 0.0
    value_metrics: dict = field(default_factory=dict)
    initial_route: str = ""
    final_route: str = ""
    escalations: list = field(default_factory=list)
    confidence: float = 0.0
    latency_ms: float = 0.0
    cost_usd: float = 0.0
    success: bool = False
    error: Optional[str] = None
    output_preview: str = ""

    def compute_cost(self):
        tier = self.final_route
        rates = COST_TABLE.get(tier, {"input": 0.0, "output": 0.0})
        self.cost_usd = round(
            (self.input_tokens / 1000) * rates["input"]
            + (self.output_tokens / 1000) * rates["output"],
            6,
        )

    def to_dict(self) -> dict:
        return asdict(self)


# ─── Logger ───────────────────────────────────────────────────────────────────

class EngineLogger:
    """
    Writes one JSON object per line (JSONL format) to a rotating log file.
    Maintains in-memory session stats for cheap aggregation.
    """

    def __init__(self, log_dir: str = "logs", log_name: str = "engine.jsonl"):
        self._log_path = Path(log_dir) / log_name
        self._log_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._session_stats = {
            "total_requests": 0,
            "total_cost_usd": 0.0,
            "escalations": 0,
            "by_tier": {"llama": 0, "openai": 0, "claude": 0},
            "errors": 0,
        }
        # Standard Python logger for console output
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(message)s",
            datefmt="%H:%M:%S",
        )
        self._console = logging.getLogger("TriHybrid")

    async def log_route(self, record: RouteRecord) -> None:
        """Append a completed route record to the JSONL log file."""
        record.compute_cost()
        async with self._lock:
            with self._log_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record.to_dict()) + "\n")
            self._update_stats(record)
        self._console.info(
            f"[{record.request_id}] route={record.final_route} "
            f"score={record.value_score:.3f} conf={record.confidence:.3f} "
            f"latency={record.latency_ms:.0f}ms cost=${record.cost_usd:.5f} "
            f"escalations={len(record.escalations)}"
        )

    def _update_stats(self, record: RouteRecord) -> None:
        s = self._session_stats
        s["total_requests"] += 1
        s["total_cost_usd"] = round(s["total_cost_usd"] + record.cost_usd, 6)
        s["escalations"] += len(record.escalations)
        tier = record.final_route
        if tier in s["by_tier"]:
            s["by_tier"][tier] += 1
        if not record.success:
            s["errors"] += 1

    def session_summary(self) -> dict:
        s = self._session_stats
        total = max(s["total_requests"], 1)
        return {
            **s,
            "avg_cost_usd": round(s["total_cost_usd"] / total, 6),
            "escalation_rate": round(s["escalations"] / total, 4),
            "error_rate": round(s["errors"] / total, 4),
        }

    def info(self, msg: str, **kwargs) -> None:
        self._console.info(msg, **kwargs)

    def warning(self, msg: str, **kwargs) -> None:
        self._console.warning(msg, **kwargs)

    def error(self, msg: str, **kwargs) -> None:
        self._console.error(msg, **kwargs)

    async def write_session_summary(self) -> None:
        summary_path = self._log_path.parent / "session_summary.json"
        summary = {
            "session_end": datetime.now(timezone.utc).isoformat(),
            **self.session_summary(),
        }
        async with self._lock:
            with summary_path.open("w", encoding="utf-8") as f:
                json.dump(summary, f, indent=2)
        self._console.info(f"Session summary written → {summary_path}")


# ─── Module-level singleton ───────────────────────────────────────────────────
_logger: Optional[EngineLogger] = None


def get_logger() -> EngineLogger:
    global _logger
    if _logger is None:
        _logger = EngineLogger()
    return _logger
