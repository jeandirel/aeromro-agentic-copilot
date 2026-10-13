"""``python -m aeromro``: print the active configuration and action policy (a smoke check)."""

from __future__ import annotations

from aeromro import __version__
from aeromro.config import get_settings
from aeromro.harness import ActionPolicy


def main() -> None:
    settings = get_settings()
    policy = ActionPolicy(min_confidence=settings.min_recommendation_confidence)
    print(f"aeromro-agentic-copilot {__version__}")
    print(f"llm provider : {settings.llm_provider}")
    if settings.llm_provider == "bedrock":
        print(f"bedrock model: {settings.bedrock_model_id} ({settings.aws_region})")
    print("action policy:")
    for action, risk in sorted(policy.actions.items(), key=lambda kv: (kv[1], kv[0])):
        decision = policy.evaluate(action, confidence=1.0).decision
        print(f"  {risk.name:<9} {action:<22} -> {decision}")


if __name__ == "__main__":
    main()
