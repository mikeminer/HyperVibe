"""
llama_local.py
Adapter for locally-hosted LLaMA models via the Ollama HTTP API.

Requires Ollama running on localhost:11434.
Install: https://ollama.ai/download
Pull a model: ollama pull llama3.2 (or llama3, mistral, etc.)

Falls back gracefully if Ollama is not running (health_check → False).
"""

import time
import json
import asyncio
from typing import Optional

import aiohttp

from adapters.base import BaseAdapter, AdapterResponse
from config.settings import Settings


class LlamaLocalAdapter(BaseAdapter):

    tier = "llama"

    def __init__(self, settings: Optional[Settings] = None):
        self._settings = settings or Settings()
        self.model_id = self._settings.LLAMA_MODEL
        self._base_url = self._settings.OLLAMA_BASE_URL
        self._timeout = aiohttp.ClientTimeout(
            total=self._settings.LLAMA_TIMEOUT_SECS
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

        payload = {
            "model": self.model_id,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }

        try:
            async with aiohttp.ClientSession(timeout=self._timeout) as session:
                async with session.post(
                    f"{self._base_url}/api/chat",
                    json=payload,
                ) as resp:
                    resp.raise_for_status()
                    data = await resp.json()

            message = data.get("message", {})
            output_text = message.get("content", "").strip()

            # Ollama returns token counts in eval/prompt_eval fields
            input_tokens = data.get("prompt_eval_count", self._estimate_tokens(input_text))
            output_tokens = data.get("eval_count", self._estimate_tokens(output_text))
            latency_ms = (time.monotonic() - t0) * 1000

            return AdapterResponse(
                text=output_text,
                model_id=self.model_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=round(latency_ms, 2),
                success=bool(output_text),
            )

        except aiohttp.ClientConnectorError:
            return AdapterResponse(
                text="",
                model_id=self.model_id,
                input_tokens=0,
                output_tokens=0,
                latency_ms=round((time.monotonic() - t0) * 1000, 2),
                success=False,
                error="Ollama not reachable. Is the service running on port 11434?",
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
        try:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=3)
            ) as session:
                async with session.get(f"{self._base_url}/api/tags") as resp:
                    if resp.status != 200:
                        return False
                    data = await resp.json()
                    models = [m["name"].split(":")[0] for m in data.get("models", [])]
                    model_name = self.model_id.split(":")[0]
                    return model_name in models
        except Exception:
            return False

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        return max(int(len(text) / 3.8), 1)
