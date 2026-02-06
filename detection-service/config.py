from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_path: str = "yolov10n.onnx"
    confidence_threshold: float = 0.25
    iou_threshold: float = 0.45
    max_image_size: int = 1280
    max_upload_mb: int = 10
    log_level: str = "INFO"
    allowed_origins: str = "*"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
