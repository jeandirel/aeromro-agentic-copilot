"""Cost and latency tracking for LLM calls.

Records every call, then reports tokens, cost (only when prices are configured), p50 / p95 latency
and whether the session stayed within its token budget.
"""

from __future__ import annotations

import math

from pydantic import BaseModel, Field

from aeromro.llm.base import LLMResponse


class CallRecord(BaseModel):
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: float
    label: str = ""


class TelemetrySummary(BaseModel):
    calls: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    cost: float | None = Field(description="None when a price is not configured")
    latency_p50_ms: float | None
    latency_p95_ms: float | None
    within_budget: bool


def percentile(values: list[float], q: float) -> float | None:
    """Nearest-rank percentile; q in [0, 100]."""
    if not values:
        return None
    if not 0 <= q <= 100:
        raise ValueError("q must be between 0 and 100")
    ordered = sorted(values)
    rank = max(1, math.ceil(q / 100 * len(ordered)))
    return ordered[rank - 1]


class TelemetryTracker:
    def __init__(
        self,
        *,
        price_input_per_1k: float | None = None,
        price_output_per_1k: float | None = None,
        token_budget: int | None = None,
    ) -> None:
        self.price_input_per_1k = price_input_per_1k
        self.price_output_per_1k = price_output_per_1k
        self.token_budget = token_budget
        self.records: list[CallRecord] = []

    def record(self, response: LLMResponse, *, label: str = "") -> CallRecord:
        rec = CallRecord(
            model=response.model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            latency_ms=response.usage.latency_ms,
            label=label,
        )
        self.records.append(rec)
        return rec

    @property
    def total_tokens(self) -> int:
        return sum(r.input_tokens + r.output_tokens for r in self.records)

    def remaining_budget(self) -> int | None:
        if self.token_budget is None:
            return None
        return self.token_budget - self.total_tokens

    def summary(self) -> TelemetrySummary:
        tin = sum(r.input_tokens for r in self.records)
        tout = sum(r.output_tokens for r in self.records)
        cost = None
        if self.price_input_per_1k is not None and self.price_output_per_1k is not None:
            cost = round(
                tin / 1000 * self.price_input_per_1k + tout / 1000 * self.price_output_per_1k, 6
            )
        latencies = [r.latency_ms for r in self.records]
        remaining = self.remaining_budget()
        return TelemetrySummary(
            calls=len(self.records),
            input_tokens=tin,
            output_tokens=tout,
            total_tokens=tin + tout,
            cost=cost,
            latency_p50_ms=percentile(latencies, 50),
            latency_p95_ms=percentile(latencies, 95),
            within_budget=remaining is None or remaining >= 0,
        )
