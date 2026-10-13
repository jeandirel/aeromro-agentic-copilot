"""Fallback with a circuit breaker: the answer keeps coming when the language model does not.

When the primary client fails (quota exhausted, throttling, access denied, timeout, network), the
fallback client answers instead and the response says why. After a failure the circuit opens for
a cool-down period: calls go straight to the fallback instead of waiting for the primary to fail
again, then one call is let through to test whether it has recovered.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable

from aeromro.llm.base import LLMClient, LLMResponse, Message

log = logging.getLogger(__name__)


def describe_error(exc: Exception) -> str:
    """Short, safe description: AWS error code when there is one, else the exception type."""
    response = getattr(exc, "response", None)
    if isinstance(response, dict):
        code = response.get("Error", {}).get("Code")
        if code:
            return str(code)
    return type(exc).__name__


class FallbackLLMClient:
    def __init__(
        self,
        primary: LLMClient,
        fallback: LLMClient,
        *,
        cooldown_s: float = 300.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.primary = primary
        self.fallback = fallback
        self.cooldown_s = cooldown_s
        self._clock = clock
        self._open_until = 0.0
        self._last_error: str | None = None
        self._lock = threading.Lock()
        self.model = primary.model

    @property
    def circuit_open(self) -> bool:
        return self._clock() < self._open_until

    def complete(
        self,
        messages: list[Message],
        *,
        max_tokens: int = 1024,
        temperature: float = 0.0,
    ) -> LLMResponse:
        if not self.circuit_open:
            try:
                return self.primary.complete(
                    messages, max_tokens=max_tokens, temperature=temperature
                )
            except Exception as exc:  # any failure of a remote dependency triggers the fallback
                reason = describe_error(exc)
                with self._lock:
                    self._open_until = self._clock() + self.cooldown_s
                    self._last_error = reason
                log.warning("primary LLM failed (%s); fallback for %.0f s", reason, self.cooldown_s)
        else:
            reason = f"{self._last_error} (circuit open)"
        response = self.fallback.complete(messages, max_tokens=max_tokens, temperature=temperature)
        return response.model_copy(update={"fallback_reason": reason})
