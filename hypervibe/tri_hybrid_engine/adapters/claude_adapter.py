"""
claude_adapter.py
Adapter for Anthropic Claude models using the official async SDK.
Defaults to claude-haiku-4-5 for high-value tasks at reasonable cost.
Upgrade to claude-opus-4-6 for maximum reasoning depth.
"""

import time
from typing import Optional

import anthropic
from anthropic import AsyncAnthropic, APIConnectionError, RateLimitError, APIStatusError

from adapters.base import BaseAdapter, AdapterResponse
from config.settings import Settings


class ClaudeAdapter(BaseAdapter):

    tier = "claude"

    def __init__(self, settings: Optional[Settings] = None):
        self._settings = settings or Settings()
        self.model_id = self._settings.CLAUDE_MODEL
        self._client = AsyncAnthropic(
            api_key=self._settings.ANTHROPIC_API_KEY,
            timeout=self._settings.CLAUDE_TIMEOUT_SECS,
            max_retries=2,
        )

    async def generate(
        self,
        input_text: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 1024,
        temperature: float = 0.3,
    ) -> AdapterResponse:
        t0 = time.monotonic()

        system = system_prompt or (
            "You are an expert AI assistant with deep reasoning capabilities. "
            "Provide precise, thorough, and actionable responses."
        )

        try:
            response = await self._client.messages.create(
                model=self.model_id,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                messages=[{"role": "user", "content": input_text}],
            )

            output_text = "".join(
                block.text for block in response.content if block.type == "text"
            )
            usage = response.usage

            return AdapterResponse(
                text=output_text.strip(),
                model_id=self.model_id,
                input_tokens=usage.input_tokens if usage else 0,
                output_tokens=usage.output_tokens if usage else 0,
                latency_ms=round((time.monotonic() - t0) * 1000, 2),
                success=bool(output_text.strip()),
            )

        except RateLimitError as exc:
            return AdapterResponse(
                text="",
                model_id=self.model_id,
                input_tokens=0,
                output_tokens=0,
                latency_ms=round((time.monotonic() - t0) * 1000, 2),
                success=False,
                error=f"Claude rate limit: {exc}",
            )
        except APIConnectionError as exc:
            return AdapterResponse(
                text="",
                model_id=self.model_id,
                input_tokens=0,
                output_tokens=0,
                latency_ms=round((time.monotonic() - t0) * 1000, 2),
                success=False,
                error=f"Claude connection error: {exc}",
            )
        except APIStatusError as exc:
            return AdapterResponse(
                text="",
                model_id=self.model_id,
                input_tokens=0,
                output_tokens=0,
                latency_ms=round((time.monotonic() - t0) * 1000, 2),
                success=False,
                error=f"Claude API error {exc.status_code}: {exc.message}",
            )
        except Exception as exc:
            return AdapterResponse(
                text="",
                model_id=self.model_id,
                input_tokens=0,
                output_tokens=0,
                latency_ms=round((time.monotonic() - t0) * 1000, 2),
                success=False,
                error=str(exc),
            )

    async def health_check(self) -> bool:
        if not self._settings.ANTHROPIC_API_KEY:
            return False
        try:
            # Minimal ping: list models endpoint
            await self._client.models.retrieve(self.model_id)
            return True
        except Exception:
            # Try a minimal message as fallback health check
            try:
                resp = await self._client.messages.create(
                    model=self.model_id,
                    max_tokens=5,
                    messages=[{"role": "user", "content": "ping"}],
                )
                return bool(resp.content)
            except Exception:
                return False
