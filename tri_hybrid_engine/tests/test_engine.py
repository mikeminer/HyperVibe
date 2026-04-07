"""
tests/test_engine.py
Unit tests for the Tri-Hybrid Engine core modules.
Run with: pytest tests/ -v
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, patch

# Import core modules
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.value_scorer import compute_metrics
from core.confidence import estimate_confidence
from core.preprocessor import preprocess, postprocess


# ─── Value Scorer Tests ───────────────────────────────────────────────────────

class TestValueScorer:

    def test_simple_question_low_score(self):
        metrics = compute_metrics("What is 2 + 2?")
        assert metrics.value_score < 0.30, "Simple arithmetic should route to LLaMA"

    def test_trading_question_high_score(self):
        prompt = (
            "Analyse the risk of entering a long HYPE perpetual position at 3x leverage "
            "given uncertain market regime, 7-day unstaking lock, and potential liquidation cascade."
        )
        metrics = compute_metrics(prompt)
        assert metrics.value_score >= 0.40, "Complex trading analysis should score high"

    def test_technical_code_medium_score(self):
        # A richer code prompt with complexity markers should land in mid range
        prompt = (
            "Implement a Python class for exponential moving average with configurable "
            "alpha decay. It should handle missing values, support pandas Series input, "
            "and include a backtest method comparing EMA vs SMA signal performance."
        )
        metrics = compute_metrics(prompt)
        assert 0.15 <= metrics.value_score <= 0.75, (
            f"Rich code task should be medium range, got {metrics.value_score}"
        )

    def test_score_bounded_zero_one(self):
        for text in ["", "a", "x" * 5000, "!!!!!!", "   "]:
            m = compute_metrics(text)
            assert 0.0 <= m.value_score <= 1.0

    def test_route_tier_mapping(self):
        low = compute_metrics("hi")
        mid = compute_metrics("Implement a Python REST API with authentication middleware.")
        assert low.route_tier() in ("llama", "openai", "claude")
        assert mid.route_tier() in ("llama", "openai", "claude")

    def test_metrics_sum_to_value_score(self):
        m = compute_metrics("Evaluate the cointegration of BTC and ETH pairs.")
        expected = round(
            m.reasoning_depth * 0.4 + m.uncertainty * 0.3
            + m.impact * 0.2 + m.complexity * 0.1,
            4,
        )
        assert abs(m.value_score - expected) < 0.001


# ─── Confidence Tests ─────────────────────────────────────────────────────────

class TestConfidence:

    def test_good_output_passes(self):
        inp = "Explain the difference between TCP and UDP."
        out = (
            "TCP (Transmission Control Protocol) is connection-oriented and guarantees "
            "packet delivery with error checking and ordering. UDP (User Datagram Protocol) "
            "is connectionless, faster, but does not guarantee delivery. TCP is used for "
            "web, email; UDP for streaming and gaming."
        )
        report = estimate_confidence(inp, out, threshold=0.55)
        assert report.passed

    def test_empty_output_fails(self):
        report = estimate_confidence("Tell me about Bitcoin.", "", threshold=0.55)
        assert not report.passed
        assert report.confidence < 0.20

    def test_repetitive_output_penalised(self):
        inp = "What is a blockchain?"
        out = "A blockchain is a ledger. " * 30  # Highly repetitive
        report = estimate_confidence(inp, out, threshold=0.55)
        assert report.coherence_score < 0.8  # Should penalise repetition

    def test_confidence_bounded(self):
        for inp, out in [("", ""), ("hello", "hi"), ("a" * 1000, "b" * 1000)]:
            r = estimate_confidence(inp, out)
            assert 0.0 <= r.confidence <= 1.0


# ─── Preprocessor Tests ───────────────────────────────────────────────────────

class TestPreprocessor:

    def test_strips_html(self):
        result = preprocess("<b>Hello</b> <em>world</em>!", strip_html=True)
        assert "<b>" not in result
        assert "Hello" in result

    def test_replaces_urls(self):
        result = preprocess("Visit https://hyperliquid.xyz for more info.", strip_urls=True)
        assert "https://" not in result
        assert "[URL]" in result

    def test_truncates_long_input(self):
        long_text = "word " * 5000
        result = preprocess(long_text, max_input_tokens=100)
        token_estimate = len(result) / 3.8
        assert token_estimate <= 150  # Some tolerance for truncation boundary

    def test_normalises_bullets(self):
        text = "• Item one\n• Item two\n• Item three"
        result = postprocess(text, normalise_bullets=True)
        assert "- Item one" in result
        assert "•" not in result

    def test_dedup_lines(self):
        text = "line one\nline one\nline two\nline two\nline three"
        result = postprocess(text, dedup_lines=True)
        lines = [l for l in result.split("\n") if l.strip()]
        assert lines.count("line one") == 1
        assert lines.count("line two") == 1

    def test_empty_string_safe(self):
        assert preprocess("") == ""
        assert postprocess("") == ""


# ─── Router Integration Test (mocked adapters) ────────────────────────────────

class TestRouterMocked:

    @pytest.mark.asyncio
    async def test_routes_low_value_to_llama(self):
        from core.router import TriHybridRouter
        from config.settings import Settings

        router = TriHybridRouter(Settings())

        # Mock all adapters
        mock_response_text = "Two plus two is four."
        for tier in ["llama", "openai", "claude"]:
            adapter = router._adapters[tier]
            adapter.generate = AsyncMock(return_value=type("R", (), {
                "text": mock_response_text,
                "model_id": tier,
                "input_tokens": 10,
                "output_tokens": 10,
                "latency_ms": 50.0,
                "success": True,
                "error": None,
                "total_tokens": 20,
            })())

        output, record = await router.route("What is 2 + 2?")

        assert record.initial_route == "llama"
        assert output  # Should have output

    @pytest.mark.asyncio
    async def test_escalates_on_low_confidence(self):
        from core.router import TriHybridRouter
        from config.settings import Settings

        cfg = Settings()
        cfg.CONFIDENCE_THRESHOLD = 0.95  # Extremely high → forces escalation
        cfg.MAX_ESCALATIONS = 2
        router = TriHybridRouter(cfg)

        call_order = []
        for tier in ["llama", "openai", "claude"]:
            def make_mock(t):
                async def generate(input_text, system_prompt=None, max_tokens=1024, temperature=0.3):
                    call_order.append(t)
                    return type("R", (), {
                        "text": "ok",
                        "model_id": t,
                        "input_tokens": 10,
                        "output_tokens": 10,
                        "latency_ms": 50.0,
                        "success": True,
                        "error": None,
                        "total_tokens": 20,
                    })()
                return generate
            router._adapters[tier].generate = make_mock(tier)

        await router.route("A simple test prompt.")
        # Should try llama first, escalate due to confidence threshold
        assert "llama" in call_order


# ─── Run ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
