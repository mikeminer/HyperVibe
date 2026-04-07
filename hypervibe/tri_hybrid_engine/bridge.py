"""
bridge.py
Tri-Hybrid Engine — HTTP Bridge Server

Exposes a POST /v1/messages endpoint that is 100% compatible with the
Anthropic Messages API format. HyperVibe (and any Anthropic SDK client)
can point to this server instead of api.anthropic.com with zero code changes.

Usage:
    python bridge.py              # starts on port 3002
    python bridge.py --port 3002  # explicit port

HyperVibe .env config:
    PROVIDER=anthropic
    ANTHROPIC_BASE_URL=http://localhost:3002
    ANTHROPIC_API_KEY=any-string   # bridge ignores the key value
"""

import uuid
import time
import asyncio
import argparse
import logging
from typing import Optional, Any

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from config.settings import Settings, load_dotenv
from core.router import TriHybridRouter
from core.value_scorer import compute_metrics


# ─── App setup ────────────────────────────────────────────────────────────────

load_dotenv()
settings = Settings()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("bridge")

app = FastAPI(
    title="Tri-Hybrid Engine Bridge",
    description="Anthropic-compatible proxy routing across LLaMA / GPT / Claude",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global router instance (shared across requests)
_router: Optional[TriHybridRouter] = None


def get_router() -> TriHybridRouter:
    global _router
    if _router is None:
        _router = TriHybridRouter(settings)
    return _router


# ─── Request / Response helpers ───────────────────────────────────────────────

def _extract_text_from_messages(messages: list, system: str = "") -> str:
    """
    Flatten an Anthropic-format messages array into a single prompt string.
    Preserves conversation history as context.
    """
    parts = []
    if system:
        parts.append(f"[System]: {system}")
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if isinstance(content, list):
            # Content blocks format: [{"type": "text", "text": "..."}]
            text = " ".join(
                block.get("text", "")
                for block in content
                if block.get("type") == "text"
            )
        else:
            text = str(content)
        prefix = "Assistant" if role == "assistant" else "User"
        parts.append(f"{prefix}: {text}")
    return "\n\n".join(parts)


def _build_anthropic_response(
    output_text: str,
    model_used: str,
    input_tokens: int,
    output_tokens: int,
    request_id: str,
) -> dict:
    """Build a response object that matches the Anthropic Messages API schema."""
    return {
        "id": f"msg_{request_id}",
        "type": "message",
        "role": "assistant",
        "content": [
            {
                "type": "text",
                "text": output_text,
            }
        ],
        "model": f"tri-hybrid/{model_used}",
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        },
    }


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "service": "Tri-Hybrid Engine Bridge",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "messages": "POST /v1/messages",
            "health":   "GET  /v1/health",
            "stats":    "GET  /v1/stats",
            "score":    "POST /v1/score",
        },
    }


@app.get("/v1/health")
async def health():
    """Check health of all three adapter tiers."""
    router = get_router()
    health_status = await router.refresh_health()
    return {
        "status": "ok" if any(health_status.values()) else "degraded",
        "tiers": health_status,
        "settings": {
            "llama_threshold":  settings.LLAMA_THRESHOLD,
            "openai_threshold": settings.OPENAI_THRESHOLD,
            "confidence_threshold": settings.CONFIDENCE_THRESHOLD,
            "llama_model":  settings.LLAMA_MODEL,
            "openai_model": settings.OPENAI_MODEL,
            "claude_model": settings.CLAUDE_MODEL,
        },
    }


@app.get("/v1/stats")
async def stats():
    """Session-level routing statistics and cost summary."""
    router = get_router()
    return router._logger.session_summary()


@app.post("/v1/score")
async def score_only(request: Request):
    """
    Score a prompt without generating a response.
    Useful for debugging routing decisions.
    """
    body = await request.json()
    messages = body.get("messages", [])
    system   = body.get("system", "")
    text     = _extract_text_from_messages(messages, system)
    metrics  = compute_metrics(text)
    return {
        "value_score": metrics.value_score,
        "initial_tier": metrics.route_tier(),
        "metrics": metrics.to_dict(),
    }


@app.post("/v1/messages")
async def messages(request: Request):
    """
    Anthropic Messages API compatible endpoint.
    Accepts the same request format as POST https://api.anthropic.com/v1/messages
    and returns a compatible response object.
    """
    t0 = time.monotonic()
    request_id = uuid.uuid4().hex[:8]

    try:
        body: dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Extract fields (Anthropic schema)
    messages_list = body.get("messages", [])
    system_prompt = body.get("system", "")
    max_tokens    = body.get("max_tokens", settings.MAX_OUTPUT_TOKENS)
    # model field is intentionally ignored — we route dynamically

    if not messages_list:
        raise HTTPException(status_code=400, detail="messages array is required")

    # Flatten to plain text for the router
    prompt = _extract_text_from_messages(messages_list, system_prompt)

    log.info(
        f"[{request_id}] /v1/messages — "
        f"{len(messages_list)} message(s) | "
        f"~{len(prompt.split())} words"
    )

    # Route through the Tri-Hybrid Engine
    router = get_router()
    try:
        output_text, record = await router.route(
            raw_input=prompt,
            system_prompt=system_prompt or None,
        )
    except Exception as exc:
        log.error(f"[{request_id}] Router error: {exc}")
        raise HTTPException(status_code=500, detail=f"Router error: {str(exc)}")

    if not output_text:
        raise HTTPException(
            status_code=502,
            detail=f"All tiers failed. Last error: {record.error}",
        )

    latency_ms = round((time.monotonic() - t0) * 1000)
    log.info(
        f"[{request_id}] → {record.final_route.upper()} "
        f"score={record.value_score:.3f} "
        f"conf={record.confidence:.3f} "
        f"latency={latency_ms}ms "
        f"cost=${record.cost_usd:.5f}"
    )

    response = _build_anthropic_response(
        output_text=output_text,
        model_used=record.final_route,
        input_tokens=record.input_tokens,
        output_tokens=record.output_tokens,
        request_id=request_id,
    )

    # Attach routing metadata as custom headers for observability
    headers = {
        "X-Tri-Hybrid-Tier":       record.final_route,
        "X-Tri-Hybrid-Score":      str(record.value_score),
        "X-Tri-Hybrid-Confidence": str(record.confidence),
        "X-Tri-Hybrid-Latency-Ms": str(latency_ms),
        "X-Tri-Hybrid-Cost-USD":   str(record.cost_usd),
        "X-Tri-Hybrid-Escalations": str(len(record.escalations)),
    }

    return JSONResponse(content=response, headers=headers)


# ─── Startup / Shutdown ───────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    log.info("=" * 56)
    log.info("  Tri-Hybrid Engine Bridge — starting")
    log.info(f"  LLaMA  threshold : {settings.LLAMA_THRESHOLD}")
    log.info(f"  OpenAI threshold : {settings.OPENAI_THRESHOLD}")
    log.info(f"  Confidence min   : {settings.CONFIDENCE_THRESHOLD}")
    log.info(f"  LLaMA  model     : {settings.LLAMA_MODEL}")
    log.info(f"  OpenAI model     : {settings.OPENAI_MODEL}")
    log.info(f"  Claude model     : {settings.CLAUDE_MODEL}")
    log.info("=" * 56)
    # Pre-warm health check
    asyncio.create_task(get_router().refresh_health())


@app.on_event("shutdown")
async def shutdown():
    if _router:
        await _router.close()
    log.info("Bridge shutdown complete.")


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Tri-Hybrid Bridge Server")
    parser.add_argument("--port", type=int, default=3002, help="Port (default: 3002)")
    parser.add_argument("--host", default="127.0.0.1", help="Host (default: 127.0.0.1)")
    parser.add_argument("--reload", action="store_true", help="Auto-reload on code changes")
    args = parser.parse_args()

    log.info(f"Starting bridge on http://{args.host}:{args.port}")
    log.info(f"HyperVibe .env: set ANTHROPIC_BASE_URL=http://{args.host}:{args.port}")

    uvicorn.run(
        "bridge:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="warning",  # uvicorn logs suppressed, we use our own
    )
