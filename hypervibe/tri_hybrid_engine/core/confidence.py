"""
confidence.py
Estimates output confidence without ground-truth labels.
Uses structural and semantic heuristics on the generated response.
"""

import re
import math
from dataclasses import dataclass


@dataclass
class ConfidenceReport:
    coherence_score: float
    length_adequacy: float
    semantic_completeness: float
    confidence: float
    passed: bool

    def to_dict(self) -> dict:
        return self.__dict__


# ─── Sub-scorers ──────────────────────────────────────────────────────────────

def _coherence_score(output: str) -> float:
    """
    Proxy for coherence:
    - Penalise repetitions of long n-grams
    - Penalise truncation artifacts
    - Penalise degenerate output (all caps, endless punctuation)
    """
    if not output or len(output.strip()) < 5:
        return 0.0

    score = 1.0

    # Repetition penalty: count repeated 4-grams
    words = output.lower().split()
    if len(words) >= 8:
        ngrams = [" ".join(words[i:i+4]) for i in range(len(words)-3)]
        unique_ratio = len(set(ngrams)) / len(ngrams)
        score *= unique_ratio  # heavy repetition → low unique_ratio

    # Truncation artifacts
    truncation_patterns = [r"\.\.\.$", r"…$", r"\[truncated\]", r"\[cut off\]"]
    for p in truncation_patterns:
        if re.search(p, output, re.IGNORECASE):
            score *= 0.6

    # Degenerate output
    upper_ratio = sum(1 for c in output if c.isupper()) / max(len(output), 1)
    if upper_ratio > 0.6:
        score *= 0.5

    punct_ratio = sum(1 for c in output if c in "!?!?!?") / max(len(output), 1)
    if punct_ratio > 0.1:
        score *= 0.7

    return round(min(max(score, 0.0), 1.0), 4)


def _length_adequacy(input_text: str, output: str) -> float:
    """
    Checks if output length is proportional to input complexity.
    Short outputs for complex inputs = low score.
    """
    input_words = len(input_text.split())
    output_words = len(output.split())

    if output_words < 5:
        return 0.1

    # Expected range: output should be at least 30% of input for complex tasks,
    # or at least 20 words for simple ones.
    expected_min = max(int(input_words * 0.3), 20)
    expected_max = input_words * 5  # avoid runaway verbosity

    if output_words >= expected_min:
        adequacy = 1.0
    else:
        adequacy = output_words / expected_min

    # Slight penalty for extreme verbosity
    if output_words > expected_max:
        adequacy *= 0.9

    return round(min(max(adequacy, 0.0), 1.0), 4)


def _semantic_completeness(input_text: str, output: str) -> float:
    """
    Checks if key nouns/entities from the input appear in the output.
    A response that ignores input keywords is likely incomplete.
    """
    # Extract candidate keywords (non-stopwords, len >= 4)
    stopwords = {
        "this", "that", "with", "from", "have", "will", "what", "when",
        "where", "which", "your", "about", "there", "their", "they",
        "been", "were", "would", "could", "should", "than", "then",
    }
    input_words = re.findall(r"\b[a-zA-Z]{4,}\b", input_text.lower())
    keywords = [w for w in input_words if w not in stopwords]

    if not keywords:
        return 0.8  # nothing to check

    output_lower = output.lower()
    coverage = sum(1 for k in keywords if k in output_lower) / len(keywords)

    # Sigmoid-smooth: 50% keyword coverage → ~0.73, 80% → ~0.88
    return round(min(coverage * 1.2, 1.0), 4)


# ─── Main Estimator ───────────────────────────────────────────────────────────

def estimate_confidence(
    input_text: str,
    output: str,
    threshold: float = 0.55,
) -> ConfidenceReport:
    """
    Computes a confidence score [0, 1] for a model's output.

    Args:
        input_text: The original prompt sent to the model.
        output: The model's response text.
        threshold: Minimum confidence to consider output acceptable.

    Returns:
        ConfidenceReport with per-dimension scores and pass/fail flag.
    """
    coherence = _coherence_score(output)
    adequacy = _length_adequacy(input_text, output)
    completeness = _semantic_completeness(input_text, output)

    # Weighted aggregate
    confidence = (
        coherence * 0.40
        + adequacy * 0.35
        + completeness * 0.25
    )
    confidence = round(min(max(confidence, 0.0), 1.0), 4)

    return ConfidenceReport(
        coherence_score=coherence,
        length_adequacy=adequacy,
        semantic_completeness=completeness,
        confidence=confidence,
        passed=confidence >= threshold,
    )
