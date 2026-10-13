"""Deterministic LLM for tests, CI and offline demos: no network, no cost, same output each run."""

from __future__ import annotations

from collections.abc import Callable

from aeromro.llm.base import LLMResponse, Message, Usage


def _approx_tokens(text: str) -> int:
    # Rough rule of thumb (about 4 characters per token); good enough for budget tests.
    return max(1, len(text) // 4)


class MockLLMClient:
    """Replays scripted replies in order, then echoes the last user message."""

    def __init__(
        self,
        replies: list[str] | None = None,
        *,
        responder: Callable[[list[Message]], str] | None = None,
        latency_ms: float = 5.0,
        model: str = "mock-llm",
    ) -> None:
        self._replies = list(replies or [])
        self._responder = responder
        self._latency_ms = latency_ms
        self.model = model
        self.calls: list[list[Message]] = []

    def complete(
        self,
        messages: list[Message],
        *,
        max_tokens: int = 1024,
        temperature: float = 0.0,
    ) -> LLMResponse:
        self.calls.append(list(messages))
        if self._replies:
            text = self._replies.pop(0)
        elif self._responder is not None:
            text = self._responder(messages)
        else:
            last_user = next((m.content for m in reversed(messages) if m.role == "user"), "")
            text = f"[mock] {last_user}"

        stop_reason = "end_turn"
        if _approx_tokens(text) > max_tokens:
            text = text[: max_tokens * 4]
            stop_reason = "max_tokens"

        usage = Usage(
            input_tokens=sum(_approx_tokens(m.content) for m in messages),
            output_tokens=_approx_tokens(text),
            latency_ms=self._latency_ms,
        )
        return LLMResponse(text=text, usage=usage, model=self.model, stop_reason=stop_reason)
