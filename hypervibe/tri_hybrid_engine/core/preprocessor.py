"""
preprocessor.py
Input cleaning / token compression and output normalisation.
All operations are synchronous and < 1ms for typical trading prompts.
"""

import re
import textwrap
from typing import Optional


# ─── Pre-processing ───────────────────────────────────────────────────────────

_URL_RE = re.compile(r"https?://\S+")
_MULTI_SPACE = re.compile(r"[ \t]{2,}")
_MULTI_NEWLINE = re.compile(r"\n{3,}")
_HTML_TAG = re.compile(r"<[^>]+>")
_EMOJI = re.compile(
    "[\U00010000-\U0010FFFF"
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F6FF"
    "\U0001F1E0-\U0001F1FF"
    "]+",
    flags=re.UNICODE,
)


def _strip_html(text: str) -> str:
    return _HTML_TAG.sub(" ", text)


def _collapse_whitespace(text: str) -> str:
    text = _MULTI_SPACE.sub(" ", text)
    text = _MULTI_NEWLINE.sub("\n\n", text)
    return text.strip()


def _shorten_urls(text: str) -> str:
    """Replace full URLs with [URL] to save tokens."""
    return _URL_RE.sub("[URL]", text)


def _remove_emoji(text: str) -> str:
    return _EMOJI.sub("", text)


def _truncate_to_token_budget(text: str, max_tokens: int) -> str:
    """
    Hard-truncate at approximately max_tokens.
    Uses 3.8 chars/token heuristic; truncates on sentence boundary when possible.
    """
    char_limit = int(max_tokens * 3.8)
    if len(text) <= char_limit:
        return text

    truncated = text[:char_limit]
    # Try to cut at the last sentence boundary
    last_period = max(truncated.rfind("."), truncated.rfind("?"), truncated.rfind("!"))
    if last_period > char_limit * 0.5:
        truncated = truncated[: last_period + 1]

    return truncated.strip() + " [input truncated for cost optimisation]"


def preprocess(
    text: str,
    max_input_tokens: int = 3000,
    strip_urls: bool = True,
    strip_emoji: bool = True,
    strip_html: bool = True,
) -> str:
    """
    Clean and compress input text before routing.

    Args:
        text: Raw user input.
        max_input_tokens: Hard token ceiling (prevents runaway costs).
        strip_urls: Replace URLs with [URL].
        strip_emoji: Remove emoji characters.
        strip_html: Strip HTML tags.

    Returns:
        Cleaned, compressed text.
    """
    if strip_html:
        text = _strip_html(text)
    if strip_emoji:
        text = _remove_emoji(text)
    if strip_urls:
        text = _shorten_urls(text)

    text = _collapse_whitespace(text)
    text = _truncate_to_token_budget(text, max_input_tokens)

    return text


# ─── Post-processing ──────────────────────────────────────────────────────────

def _ensure_terminal_punctuation(text: str) -> str:
    """Add a period if the response ends mid-sentence."""
    text = text.rstrip()
    if text and text[-1] not in ".!?":
        # Only add if the last word looks like a sentence word, not code/symbol
        if re.search(r"[a-zA-Z]$", text):
            text += "."
    return text


def _normalise_bullet_lists(text: str) -> str:
    """Normalise various bullet styles to consistent '- ' prefix."""
    text = re.sub(r"^[•·▸▶➤◦]\s*", "- ", text, flags=re.MULTILINE)
    text = re.sub(r"^\*\s+", "- ", text, flags=re.MULTILINE)
    return text


def _deduplicate_lines(text: str) -> str:
    """Remove exact-duplicate consecutive lines (common LLaMA artifact)."""
    lines = text.split("\n")
    deduped = []
    prev = None
    for line in lines:
        if line.strip() != prev:
            deduped.append(line)
        prev = line.strip()
    return "\n".join(deduped)


def _wrap_code_blocks(text: str) -> str:
    """Ensure inferred code snippets are properly fenced."""
    # If a block looks like code (multiple def/class/import lines) but isn't fenced
    pattern = re.compile(
        r"(?<!\`\`\`\n)((?:(?:def |class |import |from |for |while |if |return )\S.*\n){3,})",
        re.MULTILINE,
    )
    return pattern.sub(r"```python\n\1```\n", text)


def postprocess(
    output: str,
    wrap_code: bool = True,
    normalise_bullets: bool = True,
    dedup_lines: bool = True,
    terminal_punct: bool = True,
    max_output_tokens: Optional[int] = None,
) -> str:
    """
    Clean and format model output for downstream consumption.

    Args:
        output: Raw model response.
        wrap_code: Auto-fence detected code blocks.
        normalise_bullets: Standardise bullet list characters.
        dedup_lines: Remove consecutive duplicate lines.
        terminal_punct: Ensure response ends with punctuation.
        max_output_tokens: Optional hard truncation on output.

    Returns:
        Formatted response string.
    """
    output = output.strip()

    if dedup_lines:
        output = _deduplicate_lines(output)
    if normalise_bullets:
        output = _normalise_bullet_lists(output)
    if wrap_code:
        output = _wrap_code_blocks(output)
    if terminal_punct:
        output = _ensure_terminal_punctuation(output)
    if max_output_tokens:
        output = _truncate_to_token_budget(output, max_output_tokens)

    return output
