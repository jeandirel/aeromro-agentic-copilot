"""Runtime settings, read from environment variables prefixed with ``AEROMRO_``."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All tunables in one place, so a deployment only changes environment variables."""

    model_config = SettingsConfigDict(env_prefix="AEROMRO_", env_file=".env", extra="ignore")

    llm_provider: Literal["mock", "bedrock"] = "mock"
    # Model availability differs per account and region; set it explicitly (see .env.example).
    bedrock_model_id: str | None = None
    aws_region: str = "eu-west-3"

    max_tokens_per_call: int = Field(default=1024, gt=0)
    temperature: float = Field(default=0.0, ge=0.0, le=1.0)
    token_budget_per_session: int = Field(default=50_000, gt=0)

    # Prices change and depend on the model and region, so they are never hard-coded.
    # Leave them unset and the telemetry reports tokens without a cost.
    price_input_per_1k_tokens: float | None = Field(default=None, ge=0.0)
    price_output_per_1k_tokens: float | None = Field(default=None, ge=0.0)

    min_recommendation_confidence: float = Field(default=0.7, ge=0.0, le=1.0)
    rul_clip_cycles: int = Field(default=125, gt=0)


@lru_cache
def get_settings() -> Settings:
    return Settings()
