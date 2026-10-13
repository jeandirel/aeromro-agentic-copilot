import pytest
from fastapi.testclient import TestClient

from aeromro.api.app import create_app, facts_summary
from aeromro.config import Settings
from aeromro.llm import FallbackLLMClient, LLMResponse, Message, MockLLMClient, Usage
from aeromro.llm.fallback import describe_error


class ThrottledError(Exception):
    """Shaped like botocore's ClientError."""

    def __init__(self) -> None:
        super().__init__("Too many tokens per day")
        self.response = {"Error": {"Code": "ThrottlingException", "Message": "Too many tokens"}}


class Flaky:
    model = "primary"

    def __init__(self, fail: bool = True) -> None:
        self.fail = fail
        self.calls = 0

    def complete(self, messages, *, max_tokens=1024, temperature=0.0) -> LLMResponse:
        self.calls += 1
        if self.fail:
            raise ThrottledError()
        return LLMResponse(text="from primary", usage=Usage(), model=self.model)


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


MSG = [Message(role="user", content="hi")]


def test_describe_error_prefers_the_aws_code():
    assert describe_error(ThrottledError()) == "ThrottlingException"
    assert describe_error(TimeoutError()) == "TimeoutError"


def test_failure_falls_back_and_opens_the_circuit():
    primary, clock = Flaky(), Clock()
    llm = FallbackLLMClient(primary, MockLLMClient(["fb1", "fb2"]), cooldown_s=60, clock=clock)
    first = llm.complete(MSG)
    assert first.text == "fb1" and first.fallback_reason == "ThrottlingException"
    assert llm.circuit_open
    second = llm.complete(MSG)  # circuit open: primary not called again
    assert second.text == "fb2" and "circuit open" in second.fallback_reason
    assert primary.calls == 1


def test_primary_is_retried_after_the_cooldown():
    primary, clock = Flaky(), Clock()
    llm = FallbackLLMClient(primary, MockLLMClient(), cooldown_s=60, clock=clock)
    llm.complete(MSG)
    primary.fail = False
    clock.now = 61
    recovered = llm.complete(MSG)
    assert recovered.text == "from primary" and recovered.fallback_reason is None
    assert not llm.circuit_open


def test_ask_answers_from_the_facts_when_the_model_is_throttled(tmp_path):
    from aeromro.data.smoke import make_smoke_artifacts

    make_smoke_artifacts(tmp_path / "data", tmp_path / "models")
    offline = MockLLMClient(responder=facts_summary, model="facts-summary")
    llm = FallbackLLMClient(Flaky(), offline)
    settings = Settings(_env_file=None, data_dir=tmp_path / "data", models_dir=tmp_path / "models")
    body = (
        TestClient(create_app(settings, llm=llm))
        .post("/ask", json={"subset": "FD003", "unit": 2, "question": "Status?"})
        .json()
    )
    assert body["fallback_reason"] == "ThrottlingException"
    assert body["answer"].startswith("[summary without language model] Engine 2 of FD003")
    assert body["usage"]["model"] == "facts-summary"


@pytest.mark.parametrize("decision", ["allow", "require_approval"])
def test_facts_summary_mentions_review_only_when_needed(decision):
    facts = (
        '{"engine": {"subset": "FD001", "unit": 7, "cycles_flown": 150, "rul": 12.0, '
        '"rul_low": 5.0, "rul_high": 20.0, "status": "inspect_now", "confidence": 0.6}, '
        f'"policy": {{"decision": "{decision}"}}}}'
    )
    text = facts_summary([Message(role="user", content=f"QUESTION: x\n\nFACTS:\n{facts}")])
    assert "Engine 7 of FD001" in text and "inspect before the next flight" in text
    assert ("must review" in text) is (decision == "require_approval")
