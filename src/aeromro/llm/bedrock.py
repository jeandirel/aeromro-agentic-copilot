"""Amazon Bedrock client built on the Converse API, which has one request format for every model.

``boto3`` is imported lazily so the package installs and tests run without the ``aws`` extra.
"""

from __future__ import annotations

import time
from typing import Any

from aeromro.llm.base import LLMResponse, Message, Usage, split_system


class BedrockConverseClient:
    def __init__(self, model_id: str, *, region: str = "eu-west-3", client: Any | None = None):
        if not model_id:
            raise ValueError("A Bedrock model id is required (set AEROMRO_BEDROCK_MODEL_ID).")
        self.model = model_id
        if client is None:
            try:
                import boto3
            except ImportError as exc:  # pragma: no cover - depends on the environment
                raise ImportError(
                    "boto3 is missing: install with pip install 'aeromro-agentic-copilot[aws]'"
                ) from exc
            client = boto3.client("bedrock-runtime", region_name=region)
        self._client = client

    def build_request(
        self, messages: list[Message], *, max_tokens: int, temperature: float
    ) -> dict[str, Any]:
        system, turns = split_system(messages)
        if not turns:
            raise ValueError("At least one user or assistant message is required.")
        request: dict[str, Any] = {
            "modelId": self.model,
            "messages": [{"role": m.role, "content": [{"text": m.content}]} for m in turns],
            "inferenceConfig": {"maxTokens": max_tokens, "temperature": temperature},
        }
        if system:
            request["system"] = [{"text": s} for s in system]
        return request

    def complete(
        self,
        messages: list[Message],
        *,
        max_tokens: int = 1024,
        temperature: float = 0.0,
    ) -> LLMResponse:
        request = self.build_request(messages, max_tokens=max_tokens, temperature=temperature)
        started = time.perf_counter()
        raw = self._client.converse(**request)
        measured_ms = (time.perf_counter() - started) * 1000
        return self.parse_response(raw, fallback_latency_ms=measured_ms)

    def parse_response(
        self, raw: dict[str, Any], *, fallback_latency_ms: float = 0.0
    ) -> LLMResponse:
        blocks = raw.get("output", {}).get("message", {}).get("content", [])
        text = "".join(block.get("text", "") for block in blocks)
        usage = raw.get("usage", {})
        latency = raw.get("metrics", {}).get("latencyMs", fallback_latency_ms)
        return LLMResponse(
            text=text,
            usage=Usage(
                input_tokens=usage.get("inputTokens", 0),
                output_tokens=usage.get("outputTokens", 0),
                latency_ms=float(latency),
            ),
            model=self.model,
            stop_reason=raw.get("stopReason"),
        )
