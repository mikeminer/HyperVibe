"""
base.py
Abstract base class defining the unified adapter interface.
All model adapters must implement generate() and health_check().
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class AdapterResponse:
    text: str
    model_id: str
    input_tokens: int
    output_tokens: int
    latency_ms: float
    success: bool
    error: Optional[str] = None

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


class BaseAdapter(ABC):
    """
    Every model adapter must expose this interface.
    Enables drop-in routing without business logic changes.
    """

    tier: str = "unknown"          # "llama" | "openai" | "claude"
    model_id: str = "unknown"      # exact model string

    @abstractmethod
    async def generate(
        self,
        input_text: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 1024,
        temperature: float = 0.3,
    ) -> AdapterResponse:
        """
        Generate a response for the given input text.

        Args:
            input_text: The (pre-processed) prompt.
            system_prompt: Optional system-level instruction.
            max_tokens: Maximum tokens in the response.
            temperature: Sampling temperature (0 = deterministic).

        Returns:
            AdapterResponse with text and metadata.
        """
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """
        Returns True if the model endpoint is reachable and responsive.
        Used by the router to skip unavailable tiers gracefully.
        """
        ...

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} tier={self.tier} model={self.model_id}>"
