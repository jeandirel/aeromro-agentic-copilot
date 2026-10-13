import pytest

from aeromro.harness import TelemetryTracker, percentile
from aeromro.llm import LLMResponse, Usage


def resp(tin: int, tout: int, ms: float) -> LLMResponse:
    return LLMResponse(
        text="", usage=Usage(input_tokens=tin, output_tokens=tout, latency_ms=ms), model="m"
    )


def test_percentile_nearest_rank():
    values = [float(v) for v in range(1, 21)]  # 1..20
    assert percentile(values, 50) == 10
    assert percentile(values, 95) == 19
    assert percentile(values, 100) == 20
    assert percentile([], 50) is None
    with pytest.raises(ValueError):
        percentile(values, 101)


def test_summary_with_prices():
    t = TelemetryTracker(price_input_per_1k=0.001, price_output_per_1k=0.004, token_budget=10_000)
    t.record(resp(1000, 500, 100))
    t.record(resp(2000, 250, 300))
    s = t.summary()
    assert s.calls == 2
    assert s.total_tokens == 3750
    assert s.cost == pytest.approx(3 * 0.001 + 0.75 * 0.004)
    assert s.latency_p50_ms == 100
    assert s.latency_p95_ms == 300
    assert s.within_budget


def test_cost_is_unknown_without_prices():
    t = TelemetryTracker()
    t.record(resp(10, 10, 5))
    assert t.summary().cost is None


def test_budget_overrun_is_reported():
    t = TelemetryTracker(token_budget=100)
    t.record(resp(80, 30, 5))
    assert t.remaining_budget() == -10
    assert not t.summary().within_budget
