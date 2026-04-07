"""
value_scorer.py
Computes a multi-dimensional computational value score from raw input text.
No external ML dependencies — uses linguistic heuristics for zero-latency scoring.
"""

import re
import math
from dataclasses import dataclass, asdict
from typing import Set


# ─── Keyword Taxonomies ────────────────────────────────────────────────────────

REASONING_KEYWORDS: Set[str] = {
    "analyze", "analyse", "evaluate", "assess", "compare", "contrast", "infer",
    "deduce", "reason", "explain", "justify", "argue", "prove", "disprove",
    "synthesize", "derive", "imply", "conclude", "predict", "forecast", "why",
    "how", "critique", "examine", "interpret", "diagnose", "formulate",
    # Trading / HyperVibe domain
    "signal", "strategy", "backtest", "optimize", "hedge", "alpha", "position",
    "rebalance", "arbitrage", "cointegration", "momentum", "mean-revert",
    "regime", "drawdown", "sharpe", "volatility", "correlation", "divergence",
}

UNCERTAINTY_KEYWORDS: Set[str] = {
    "maybe", "perhaps", "possibly", "might", "could", "uncertain", "unclear",
    "unknown", "ambiguous", "debatable", "unsure", "estimate", "approximate",
    "guess", "speculate", "hypothesis", "tentative", "likely", "unlikely",
    "probable", "questionable", "disputed", "contested", "risky", "conditional",
    "depends", "variable", "fluctuate", "unpredictable", "volatile",
}

IMPACT_KEYWORDS: Set[str] = {
    "trade", "buy", "sell", "execute", "position", "portfolio", "risk",
    "critical", "urgent", "important", "significant", "major", "decision",
    "financial", "market", "price", "profit", "loss", "deploy", "production",
    "security", "safety", "audit", "compliance", "legal", "liquidation",
    "leverage", "margin", "exposure", "capital", "fund", "vault", "protocol",
    "smart contract", "on-chain", "defi", "liquidate", "stop-loss", "take-profit",
}

COMPLEXITY_MARKERS: Set[str] = {
    "however", "although", "nevertheless", "furthermore", "consequently",
    "therefore", "moreover", "nonetheless", "whereas", "notwithstanding",
    "simultaneously", "alternatively", "respectively", "specifically",
    "conversely", "in contrast", "as a result", "given that", "provided that",
    "assuming", "contingent", "whereby", "therein", "thereof",
}


# ─── Dataclass ────────────────────────────────────────────────────────────────

@dataclass
class ValueMetrics:
    reasoning_depth: float
    uncertainty: float
    impact: float
    complexity: float
    value_score: float
    word_count: int
    token_estimate: int

    def to_dict(self) -> dict:
        return asdict(self)

    def route_tier(self) -> str:
        if self.value_score < 0.30:
            return "llama"
        elif self.value_score < 0.60:
            return "openai"
        else:
            return "claude"


# ─── Feature Extractors ───────────────────────────────────────────────────────

def _tokenize(text: str):
    return re.findall(r"\b\w+\b", text.lower())


def _keyword_density(words: list, keywords: Set[str]) -> float:
    if not words:
        return 0.0
    hits = sum(1 for w in words if w in keywords)
    # Log-normalised so one keyword in 5 words doesn't saturate score
    return min(math.log1p(hits) / math.log1p(max(len(words) * 0.05, 1)), 1.0)


def _sentence_complexity(text: str) -> float:
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    if not sentences:
        return 0.0
    avg_len = sum(len(s.split()) for s in sentences) / len(sentences)
    # 5 words → 0.17, 30 words → 1.0
    return min(avg_len / 30.0, 1.0)


def _shannon_entropy(text: str) -> float:
    """Character-level Shannon entropy as information density proxy."""
    if not text:
        return 0.0
    freq: dict = {}
    for c in text.lower():
        freq[c] = freq.get(c, 0) + 1
    total = len(text)
    entropy = -sum((v / total) * math.log2(v / total) for v in freq.values())
    # English prose ~3.5–4.5 bits; normalise to [0, 1]
    return min(entropy / 5.0, 1.0)


def _question_density(text: str) -> float:
    questions = text.count("?")
    sentences = max(len(re.split(r"[.!?]+", text)), 1)
    return min(questions / sentences, 1.0)


def _technical_density(text: str) -> float:
    patterns = [
        r"```[\s\S]*?```",           # code fences
        r"\bdef\s+\w+",              # function defs
        r"\bclass\s+\w+",            # class defs
        r"\bimport\s+\w+",           # imports
        r"\bSELECT\b",               # SQL
        r"0x[0-9a-fA-F]{4,}",        # hex addresses
        r"\b\d+\.\d{2,}\b",          # decimal numbers
        r"\$\w+",                    # variables / tickers
        r"\b[A-Z]{2,6}/[A-Z]{2,6}\b", # trading pairs e.g. BTC/USDT
        r"https?://\S+",             # URLs
    ]
    hits = sum(1 for p in patterns if re.search(p, text))
    return min(hits / len(patterns), 1.0)


def _negation_density(words: list) -> float:
    negations = {"not", "no", "never", "neither", "nor", "cannot", "can't",
                 "don't", "doesn't", "didn't", "won't", "wouldn't", "shouldn't"}
    if not words:
        return 0.0
    hits = sum(1 for w in words if w in negations)
    return min(hits / max(len(words), 1) * 10, 1.0)


# ─── Main Scorer ──────────────────────────────────────────────────────────────

def compute_metrics(text: str) -> ValueMetrics:
    """
    Compute all value metrics from raw input text.
    Runtime: O(n) where n = len(text). No I/O, no external calls.
    """
    words = _tokenize(text)
    word_count = len(words)
    token_estimate = max(int(len(text) / 3.8), 1)  # ~3.8 chars/token for English

    # ── reasoning_depth ─────────────────────────────────────────────────────
    reasoning_depth = (
        _keyword_density(words, REASONING_KEYWORDS) * 0.50
        + _sentence_complexity(text) * 0.30
        + _shannon_entropy(text) * 0.20
    )

    # ── uncertainty ─────────────────────────────────────────────────────────
    uncertainty = (
        _keyword_density(words, UNCERTAINTY_KEYWORDS) * 0.55
        + _question_density(text) * 0.30
        + _negation_density(words) * 0.15
    )

    # ── impact ──────────────────────────────────────────────────────────────
    impact = (
        _keyword_density(words, IMPACT_KEYWORDS) * 0.65
        + min(word_count / 400.0, 1.0) * 0.20
        + _technical_density(text) * 0.15
    )

    # ── complexity ──────────────────────────────────────────────────────────
    complexity = (
        _technical_density(text) * 0.40
        + _sentence_complexity(text) * 0.35
        + _keyword_density(words, COMPLEXITY_MARKERS) * 0.25
    )

    # ── weighted value score (canonical formula) ─────────────────────────────
    value_score = (
        reasoning_depth * 0.40
        + uncertainty * 0.30
        + impact * 0.20
        + complexity * 0.10
    )

    return ValueMetrics(
        reasoning_depth=round(reasoning_depth, 4),
        uncertainty=round(uncertainty, 4),
        impact=round(impact, 4),
        complexity=round(complexity, 4),
        value_score=round(min(value_score, 1.0), 4),
        word_count=word_count,
        token_estimate=token_estimate,
    )
