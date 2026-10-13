import pytest
from pydantic import ValidationError

from aeromro.config import Settings


def test_defaults_are_safe_offline(monkeypatch):
    monkeypatch.delenv("AEROMRO_LLM_PROVIDER", raising=False)
    s = Settings(_env_file=None)
    assert s.llm_provider == "mock"
    assert s.price_input_per_1k_tokens is None


def test_env_override(monkeypatch):
    monkeypatch.setenv("AEROMRO_LLM_PROVIDER", "bedrock")
    monkeypatch.setenv("AEROMRO_BEDROCK_MODEL_ID", "my-model")
    s = Settings(_env_file=None)
    assert s.llm_provider == "bedrock"
    assert s.bedrock_model_id == "my-model"


def test_invalid_values_are_rejected(monkeypatch):
    monkeypatch.setenv("AEROMRO_TEMPERATURE", "2")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
