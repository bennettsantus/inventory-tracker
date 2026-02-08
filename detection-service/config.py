from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5-20250929"
    anthropic_max_tokens: int = 16000
    anthropic_thinking_budget: int = 10000

    confidence_threshold: float = 0.25
    max_image_size: int = 2048
    max_upload_mb: int = 50
    log_level: str = "INFO"
    allowed_origins: str = "*"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
