"""Provider-agnostic LLM interface.

Agents depend on :class:`LLMClient` only, so the same graph runs against a deterministic mock in
tests and CI, and against Amazon Bedrock in the cloud.
"""

from __future__ import annotations

from typing import Literal, Protocol, runtime_checkable

from pydantic import BaseModel, Field

Role = Literal["system", "user", "assistant"]


class Message(BaseModel):
    role: Role
    content: str


class Usage(BaseModel):
    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    latency_ms: float = Field(default=0.0, ge=0.0)

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


class LLMResponse(BaseModel):
    text: str
    usage: Usage
    model: str
    stop_reason: str | None = None
    # Set when another client answered because the requested one failed (see llm.fallback).
    fallback_reason: str | None = None


@runtime_checkable
class LLMClient(Protocol):
    """Anything that turns a conversation into one completion."""

    model: str

    def complete(
        self,
        messages: list[Message],
        *,
        max_tokens: int = 1024,
        temperature: float = 0.0,
    ) -> LLMResponse: ...


def split_system(messages: list[Message]) -> tuple[list[str], list[Message]]:
    """Separate system prompts from the turn-by-turn conversation (Bedrock wants them apart)."""
    system = [m.content for m in messages if m.role == "system"]
    turns = [m for m in messages if m.role != "system"]
    return system, turns
