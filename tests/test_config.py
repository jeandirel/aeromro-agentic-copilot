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


def test_empty_values_fall_back_to_defaults(monkeypatch):
    # Deployment templates and .env.example leave optional values empty.
    monkeypatch.setenv("AEROMRO_DEMO_ACCESS_CODE", "")
    monkeypatch.setenv("AEROMRO_PRICE_INPUT_PER_1K_TOKENS", "")
    s = Settings(_env_file=None)
    assert s.demo_access_code is None
    assert s.price_input_per_1k_tokens is None
    assert Settings(_env_file=None, demo_access_code="").demo_access_code is None
