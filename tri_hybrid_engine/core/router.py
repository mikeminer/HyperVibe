"""
router.py
Tri-Hybrid Router Engine — the central orchestrator.

Flow:
  1. Pre-process input
  2. Score computational value
  3. Select initial tier
  4. Generate with lowest-cost viable model
  5. Estimate confidence
  6. Escalate if confidence < threshold (up to MAX_ESCALATIONS)
  7. Post-process output
  8. Log the full decision record
"""

import time
import asyncio
from typing import Optional

from core.value_scorer import compute_metrics, ValueMetrics
from core.confidence import estimate_confidence, ConfidenceReport
from core.preprocessor import preprocess, postprocess
from core.logger import get_logger, RouteRecord
from adapters.base import BaseAdapter, AdapterResponse
from adapters.llama_local import LlamaLocalAdapter
from adapters.openai_adapter import OpenAIAdapter
from adapters.claude_adapter import ClaudeAdapter
from config.settings import Settings


# ─── Tier ordering (escalation path) ─────────────────────────────────────────
TIER_ORDER = ["llama", "openai", "claude"]


class TriHybridRouter:
    """
    Routes generation requests across LLaMA → OpenAI → Claude
    based on computational value scoring and confidence-driven escalation.
    """

    def __init__(self, settings: Optional[Settings] = None):
        self._cfg = settings or Settings()
        self._logger = get_logger()

        # Initialise adapters
        self._adapters: dict[str, BaseAdapter] = {
            "llama":  LlamaLocalAdapter(self._cfg),
            "openai": OpenAIAdapter(self._cfg),
            "claude": ClaudeAdapter(self._cfg),
        }

        # Concurrency semaphore
        self._sem = asyncio.Semaphore(self._cfg.CONCURRENT_REQUESTS)

        # Adapter health cache (refreshed per request batch)
        self._healthy: dict[str, bool] = {k: True for k in TIER_ORDER}

    # ── Public API ─────────────────────────────────────────────────────────────

    async def route(
        self,
        raw_input: str,
        system_prompt: Optional[str] = None,
        force_tier: Optional[str] = None,
    ) -> tuple[str, RouteRecord]:
        """
        Route a single request through the tri-hybrid system.

        Args:
            raw_input: User's raw text prompt.
            system_prompt: Optional system-level instruction override.
            force_tier: Skip scoring and force a specific tier (debug).

        Returns:
            Tuple of (response_text, RouteRecord)
        """
        async with self._sem:
            return await self._route_internal(raw_input, system_prompt, force_tier)

    async def route_batch(
        self,
        inputs: list[str],
        system_prompt: Optional[str] = None,
    ) -> list[tuple[str, RouteRecord]]:
        """
        Route multiple requests concurrently, respecting the semaphore limit.
        """
        tasks = [self.route(inp, system_prompt) for inp in inputs]
        return await asyncio.gather(*tasks, return_exceptions=False)

    # ── Internal Orchestration ─────────────────────────────────────────────────

    async def _route_internal(
        self,
        raw_input: str,
        system_prompt: Optional[str],
        force_tier: Optional[str],
    ) -> tuple[str, RouteRecord]:
        t_start = time.monotonic()
        record = RouteRecord()
        sp = system_prompt or self._cfg.DEFAULT_SYSTEM_PROMPT

        # ── 1. Pre-process ───────────────────────────────────────────────────
        clean_input = preprocess(
            raw_input,
            max_input_tokens=self._cfg.MAX_INPUT_TOKENS,
        )
        record.input_preview = clean_input[:200]

        # ── 2. Value scoring ─────────────────────────────────────────────────
        metrics: ValueMetrics = compute_metrics(clean_input)
        record.value_score = metrics.value_score
        record.value_metrics = metrics.to_dict()
        record.input_tokens = metrics.token_estimate

        # ── 3. Determine initial tier ────────────────────────────────────────
        if force_tier and force_tier in TIER_ORDER:
            initial_tier = force_tier
        else:
            initial_tier = self._select_initial_tier(metrics)

        record.initial_route = initial_tier

        # ── 4. Escalation loop ───────────────────────────────────────────────
        current_tier = initial_tier
        current_tier_idx = TIER_ORDER.index(current_tier)
        escalation_count = 0
        final_response: Optional[AdapterResponse] = None
        confidence_report: Optional[ConfidenceReport] = None

        while True:
            adapter = self._adapters[current_tier]
            temperature = getattr(self._cfg, f"{current_tier.upper()}_TEMPERATURE", 0.3)

            self._logger.info(
                f"[{record.request_id}] Attempting {current_tier} "
                f"(score={metrics.value_score:.3f})"
            )

            response = await adapter.generate(
                input_text=clean_input,
                system_prompt=sp,
                max_tokens=self._cfg.MAX_OUTPUT_TOKENS,
                temperature=temperature,
            )

            if not response.success:
                # Hard failure — escalate immediately
                self._logger.warning(
                    f"[{record.request_id}] {current_tier} failed: {response.error}"
                )
                # Mark tier as unhealthy if quota/auth error — skip it for rest of session
                error_str = str(response.error or "")
                if any(k in error_str for k in [
                    "insufficient_quota", "429", "401", "credit balance",
                    "exceeded your current quota", "invalid_api_key"
                ]):
                    self._healthy[current_tier] = False
                    self._logger.warning(
                        f"[{current_tier}] marked UNHEALTHY for this session: quota/auth error"
                    )
                next_idx = current_tier_idx + 1
                if next_idx >= len(TIER_ORDER):
                    # All cloud tiers exhausted — final fallback to LLaMA
                    if current_tier != "llama" and self._healthy.get("llama", True):
                        self._logger.warning(
                            f"[{record.request_id}] All cloud tiers failed — "
                            f"final fallback to LLaMA"
                        )
                        record.escalations.append({
                            "from": current_tier,
                            "reason": "final_fallback_to_llama",
                        })
                        current_tier = "llama"
                        current_tier_idx = 0
                        escalation_count += 1
                        continue
                    record.error = response.error
                    break
                record.escalations.append({
                    "from": current_tier,
                    "reason": "adapter_failure",
                    "error": response.error,
                })
                current_tier_idx = next_idx
                current_tier = TIER_ORDER[current_tier_idx]
                escalation_count += 1
                continue

            # ── 5. Confidence estimation ─────────────────────────────────────
            confidence_report = estimate_confidence(
                input_text=clean_input,
                output=response.text,
                threshold=self._cfg.CONFIDENCE_THRESHOLD,
            )

            if confidence_report.passed:
                final_response = response
                break

            # ── 6. Escalation decision ───────────────────────────────────────
            if escalation_count >= self._cfg.MAX_ESCALATIONS:
                # Max escalations reached — accept best available
                self._logger.warning(
                    f"[{record.request_id}] Max escalations reached, "
                    f"accepting {current_tier} output (conf={confidence_report.confidence:.3f})"
                )
                final_response = response
                break

            next_idx = current_tier_idx + 1
            if next_idx >= len(TIER_ORDER):
                # Already at top tier — accept what we have
                final_response = response
                break

            record.escalations.append({
                "from": current_tier,
                "reason": "low_confidence",
                "confidence": confidence_report.confidence,
                "threshold": self._cfg.CONFIDENCE_THRESHOLD,
            })
            current_tier_idx = next_idx
            current_tier = TIER_ORDER[current_tier_idx]
            escalation_count += 1
            self._logger.info(
                f"[{record.request_id}] Escalating to {current_tier} "
                f"(conf={confidence_report.confidence:.3f} < {self._cfg.CONFIDENCE_THRESHOLD})"
            )

        # ── 7. Post-process ──────────────────────────────────────────────────
        raw_output = final_response.text if final_response else ""
        clean_output = postprocess(raw_output) if raw_output else ""

        # ── 8. Populate record ───────────────────────────────────────────────
        record.final_route = current_tier
        record.confidence = confidence_report.confidence if confidence_report else 0.0
        record.output_tokens = final_response.output_tokens if final_response else 0
        record.latency_ms = round((time.monotonic() - t_start) * 1000, 2)
        record.success = bool(clean_output)
        record.output_preview = clean_output[:200]

        await self._logger.log_route(record)

        return clean_output, record

    # ── Tier Selection ─────────────────────────────────────────────────────────

    def _select_initial_tier(self, metrics: ValueMetrics) -> str:
        """
        Map value_score → initial tier using configurable thresholds.
        Skips tiers known to be unhealthy.
        """
        score = metrics.value_score
        if score < self._cfg.LLAMA_THRESHOLD:
            candidate = "llama"
        elif score < self._cfg.OPENAI_THRESHOLD:
            candidate = "openai"
        else:
            candidate = "claude"

        # Find the lowest-cost available tier >= candidate
        idx = TIER_ORDER.index(candidate)
        for tier in TIER_ORDER[idx:]:
            if self._healthy.get(tier, True):
                return tier

        # Fallback: return the candidate regardless
        return candidate

    # ── Health Management ──────────────────────────────────────────────────────

    async def refresh_health(self) -> dict[str, bool]:
        """Check all adapters and update health cache."""
        results = await asyncio.gather(
            *[self._adapters[t].health_check() for t in TIER_ORDER],
            return_exceptions=True,
        )
        for tier, result in zip(TIER_ORDER, results):
            self._healthy[tier] = result is True
            status = "OK" if self._healthy[tier] else "UNAVAILABLE"
            self._logger.info(f"Health [{tier}]: {status}")
        return dict(self._healthy)

    async def close(self) -> None:
        """Flush logs and clean up resources."""
        await self._logger.write_session_summary()
