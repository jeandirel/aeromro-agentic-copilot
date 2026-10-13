"""LLM clients behind one interface, and a factory that picks one from the settings."""

from __future__ import annotations

from aeromro.config import Settings, get_settings
from aeromro.llm.base import LLMClient, LLMResponse, Message, Usage
from aeromro.llm.fallback import FallbackLLMClient
from aeromro.llm.mock import MockLLMClient

__all__ = [
    "FallbackLLMClient",
    "LLMClient",
    "LLMResponse",
    "Message",
    "MockLLMClient",
    "Usage",
    "build_llm_client",
]


def build_llm_client(settings: Settings | None = None) -> LLMClient:
    settings = settings or get_settings()
    if settings.llm_provider == "bedrock":
        from aeromro.llm.bedrock import BedrockConverseClient

        return BedrockConverseClient(settings.bedrock_model_id or "", region=settings.aws_region)
    return MockLLMClient()
