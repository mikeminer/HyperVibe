"""
main.py
Entry point for the Tri-Hybrid AI Engine.

Usage:
    python main.py                        # Interactive REPL
    python main.py --demo                 # Run built-in demo prompts
    python main.py --health               # Check all adapter health
    python main.py --tier claude "..."    # Force specific tier
    python main.py --batch prompts.txt    # Process file of prompts (one per line)
"""

import asyncio
import argparse
import sys
import json
from pathlib import Path

from config.settings import Settings, load_dotenv
from core.router import TriHybridRouter


# ─── Demo prompts (tiered by expected routing) ────────────────────────────────

DEMO_PROMPTS = [
    # Tier: LLaMA (low value_score)
    ("What is 2 + 2?", "llama"),
    ("List the days of the week.", "llama"),
    # Tier: OpenAI (medium value_score)
    ("Write a Python function to compute Fibonacci numbers with memoisation.", "openai"),
    ("Summarise the main differences between TCP and UDP protocols.", "openai"),
    # Tier: Claude (high value_score — trading/reasoning)
    (
        "Analyse the risk/reward of entering a long HYPE/USDT perpetual position "
        "at current price given a 7-day unstaking period, uncertain market regime, "
        "and a 5% portfolio allocation. Should I hedge with a short on a correlated "
        "asset? What stop-loss strategy would you recommend given 3x leverage?",
        "claude",
    ),
    (
        "Evaluate whether cointegration between ETH and BTC has broken down post-2024 "
        "halving, and what that implies for a pairs trading strategy on Hyperliquid perps.",
        "claude",
    ),
]


# ─── CLI Handlers ─────────────────────────────────────────────────────────────

async def run_demo(router: TriHybridRouter) -> None:
    print("\n" + "═" * 60)
    print("  TRI-HYBRID ENGINE — DEMO MODE")
    print("═" * 60)

    for i, (prompt, expected_tier) in enumerate(DEMO_PROMPTS, 1):
        print(f"\n[{i}/{len(DEMO_PROMPTS)}] Expected tier: {expected_tier.upper()}")
        print(f"Prompt: {prompt[:120]}{'...' if len(prompt) > 120 else ''}")
        print("─" * 60)

        output, record = await router.route(prompt)

        print(f"▸ Routed to   : {record.final_route.upper()}")
        print(f"▸ Value score : {record.value_score:.4f}")
        print(f"▸ Confidence  : {record.confidence:.4f}")
        print(f"▸ Latency     : {record.latency_ms:.0f} ms")
        print(f"▸ Cost        : ${record.cost_usd:.5f}")
        print(f"▸ Escalations : {len(record.escalations)}")
        print(f"\nOutput:\n{output[:500]}{'...' if len(output) > 500 else ''}")
        print("═" * 60)


async def run_health(router: TriHybridRouter) -> None:
    print("\nChecking adapter health...")
    health = await router.refresh_health()
    print(json.dumps(health, indent=2))


async def run_repl(router: TriHybridRouter, force_tier: str = None) -> None:
    print("\n" + "═" * 60)
    print("  TRI-HYBRID AI ENGINE — INTERACTIVE MODE")
    print("  Type 'exit' or Ctrl+C to quit | 'stats' for session summary")
    print("═" * 60 + "\n")

    while True:
        try:
            prompt = input("You › ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nBye.")
            break

        if not prompt:
            continue
        if prompt.lower() in ("exit", "quit", "q"):
            break
        if prompt.lower() == "stats":
            print(json.dumps(router._logger.session_summary(), indent=2))
            continue

        output, record = await router.route(prompt, force_tier=force_tier)
        tier_label = f"[{record.final_route.upper()}]"
        esc_label = f" (+{len(record.escalations)} escalation)" if record.escalations else ""

        print(f"\n{tier_label}{esc_label} conf={record.confidence:.3f} "
              f"latency={record.latency_ms:.0f}ms cost=${record.cost_usd:.5f}")
        print("─" * 60)
        print(output)
        print()


async def run_batch(router: TriHybridRouter, filepath: str) -> None:
    lines = Path(filepath).read_text(encoding="utf-8").splitlines()
    prompts = [l.strip() for l in lines if l.strip() and not l.startswith("#")]
    print(f"Processing {len(prompts)} prompts from {filepath}...")

    results = await router.route_batch(prompts)
    for i, (output, record) in enumerate(results, 1):
        print(f"\n[{i}] tier={record.final_route} score={record.value_score:.3f} "
              f"conf={record.confidence:.3f} cost=${record.cost_usd:.5f}")
        print(output[:300])
        print("─" * 60)


# ─── Main ─────────────────────────────────────────────────────────────────────

async def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser(description="Tri-Hybrid AI Engine")
    parser.add_argument("prompt", nargs="?", help="Single prompt to process")
    parser.add_argument("--demo", action="store_true", help="Run demo prompts")
    parser.add_argument("--health", action="store_true", help="Check adapter health")
    parser.add_argument("--batch", metavar="FILE", help="Process prompts from file")
    parser.add_argument(
        "--tier",
        choices=["llama", "openai", "claude"],
        help="Force a specific tier (bypass routing)",
    )
    parser.add_argument(
        "--config", metavar="KEY=VALUE", nargs="+",
        help="Override settings (e.g. CONFIDENCE_THRESHOLD=0.7)"
    )
    args = parser.parse_args()

    # Apply config overrides
    settings = Settings()
    if args.config:
        import os
        for kv in args.config:
            if "=" in kv:
                k, v = kv.split("=", 1)
                os.environ[k.strip()] = v.strip()
        settings = Settings()  # Reload with overrides

    router = TriHybridRouter(settings)

    try:
        if args.health:
            await run_health(router)
        elif args.demo:
            await run_demo(router)
        elif args.batch:
            await run_batch(router, args.batch)
        elif args.prompt:
            output, record = await router.route(args.prompt, force_tier=args.tier)
            print(f"\n[{record.final_route.upper()}] score={record.value_score:.3f} "
                  f"conf={record.confidence:.3f} cost=${record.cost_usd:.5f}\n")
            print(output)
        else:
            # Default: interactive REPL
            await run_repl(router, force_tier=args.tier)
    finally:
        await router.close()


if __name__ == "__main__":
    asyncio.run(main())
