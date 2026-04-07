"""
openai_adapter.py
Adapter for OpenAI GPT models using the official async client.
Defaults to gpt-4o-mini for optimal cost/quality at medium-value tasks.
"""

import time
from typing import Optional

from openai import AsyncOpenAI, APIConnectionError, RateLimitError, APIStatusError

from adapters.base import BaseAdapter, AdapterResponse
from config.settings import Settings


class OpenAIAdapter(BaseAdapter):

    tier = "openai"

    def __init__(self, settings: Optional[Settings] = None):
        self._settings = settings or Settings()
        self.model_id = self._settings.OPENAI_MODEL
        self._client = AsyncOpenAI(
            api_key=self._settings.OPENAI_API_KEY,
            timeout=self._settings.OPENAI_TIMEOUT_SECS,
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
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": input_text})

        try:
            response = await self._client.chat.completions.create(
                model=self.model_id,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            output_text = response.choices[0].message.content or ""
            usage = response.usage

            return AdapterResponse(
                text=output_text.strip(),
                model_id=self.model_id,
                input_tokens=usage.prompt_tokens if usage else 0,
                output_tokens=usage.completion_tokens if usage else 0,
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
                error=f"OpenAI rate limit: {exc}",
            )
        except APIConnectionError as exc:
            return AdapterResponse(
                text="",
                model_id=self.model_id,
                input_tokens=0,
                output_tokens=0,
                latency_ms=round((time.monotonic() - t0) * 1000, 2),
                success=False,
                error=f"OpenAI connection error: {exc}",
            )
        except APIStatusError as exc:
            return AdapterResponse(
                text="",
                model_id=self.model_id,
                input_tokens=0,
                output_tokens=0,
                latency_ms=round((time.monotonic() - t0) * 1000, 2),
                success=False,
                error=f"OpenAI API error {exc.status_code}: {exc.message}",
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
        if not self._settings.OPENAI_API_KEY:
            return False
        try:
            # Minimal API call to verify connectivity + auth
            await self._client.models.retrieve(self.model_id)
            return True
        except Exception:
            return False
