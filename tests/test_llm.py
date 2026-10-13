import pytest

from aeromro.config import Settings
from aeromro.llm import LLMClient, Message, MockLLMClient, build_llm_client
from aeromro.llm.base import split_system
from aeromro.llm.bedrock import BedrockConverseClient


class FakeBedrockRuntime:
    """Stands in for boto3's bedrock-runtime client and records the request it receives."""

    def __init__(self, response: dict):
        self.response = response
        self.requests: list[dict] = []

    def converse(self, **kwargs):
        self.requests.append(kwargs)
        return self.response


CONVERSE_RESPONSE = {
    "output": {"message": {"role": "assistant", "content": [{"text": "RUL is "}, {"text": "42"}]}},
    "stopReason": "end_turn",
    "usage": {"inputTokens": 120, "outputTokens": 8, "totalTokens": 128},
    "metrics": {"latencyMs": 310},
}


def test_mock_replays_script_then_echoes():
    llm = MockLLMClient(["first", "second"])
    msgs = [Message(role="user", content="engine 7 status?")]
    assert llm.complete(msgs).text == "first"
    assert llm.complete(msgs).text == "second"
    assert llm.complete(msgs).text == "[mock] engine 7 status?"
    assert len(llm.calls) == 3


def test_mock_reports_usage_and_truncates():
    llm = MockLLMClient(["x" * 400], latency_ms=12)
    resp = llm.complete([Message(role="user", content="hi")], max_tokens=10)
    assert resp.stop_reason == "max_tokens"
    assert len(resp.text) == 40
    assert resp.usage.output_tokens == 10
    assert resp.usage.latency_ms == 12


def test_mock_satisfies_protocol():
    assert isinstance(MockLLMClient(), LLMClient)


def test_split_system():
    system, turns = split_system(
        [Message(role="system", content="be brief"), Message(role="user", content="hi")]
    )
    assert system == ["be brief"]
    assert [t.role for t in turns] == ["user"]


def test_bedrock_request_format():
    fake = FakeBedrockRuntime(CONVERSE_RESPONSE)
    llm = BedrockConverseClient("some-model-id", client=fake)
    llm.complete(
        [
            Message(role="system", content="You are an MRO assistant."),
            Message(role="user", content="q"),
        ],
        max_tokens=256,
        temperature=0.2,
    )
    req = fake.requests[0]
    assert req["modelId"] == "some-model-id"
    assert req["system"] == [{"text": "You are an MRO assistant."}]
    assert req["messages"] == [{"role": "user", "content": [{"text": "q"}]}]
    assert req["inferenceConfig"] == {"maxTokens": 256, "temperature": 0.2}


def test_bedrock_response_parsing():
    llm = BedrockConverseClient("some-model-id", client=FakeBedrockRuntime(CONVERSE_RESPONSE))
    resp = llm.complete([Message(role="user", content="q")])
    assert resp.text == "RUL is 42"
    assert resp.usage.input_tokens == 120
    assert resp.usage.output_tokens == 8
    assert resp.usage.latency_ms == 310
    assert resp.stop_reason == "end_turn"


def test_bedrock_requires_model_id_and_a_turn():
    with pytest.raises(ValueError):
        BedrockConverseClient("", client=object())
    llm = BedrockConverseClient("m", client=FakeBedrockRuntime(CONVERSE_RESPONSE))
    with pytest.raises(ValueError):
        llm.complete([Message(role="system", content="only system")])


def test_factory_defaults_to_mock():
    assert isinstance(build_llm_client(Settings()), MockLLMClient)
