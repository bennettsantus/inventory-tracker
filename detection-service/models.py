from pydantic import BaseModel, Field
from typing import Optional


class BoundingBox(BaseModel):
    x1: float = Field(description="Left coordinate")
    y1: float = Field(description="Top coordinate")
    x2: float = Field(description="Right coordinate")
    y2: float = Field(description="Bottom coordinate")


class DetectedObject(BaseModel):
    class_name: str = Field(description="Detected item name")
    class_id: int = Field(default=0, description="Class ID (legacy, always 0 for vision API)")
    confidence: float = Field(ge=0, le=1, description="Detection confidence")
    bbox: Optional[BoundingBox] = Field(default=None, description="Bounding box coordinates (null for vision API)")
    description: Optional[str] = Field(default=None, description="Additional product details")


class DetectionSummary(BaseModel):
    class_name: str
    count: int
    avg_confidence: float


class DetectionResponse(BaseModel):
    success: bool
    detections: list[DetectedObject] = Field(default_factory=list)
    summary: list[DetectionSummary] = Field(default_factory=list)
    total_objects: int = 0
    processing_time_ms: float = 0
    image_width: int = 0
    image_height: int = 0
    error: Optional[str] = None
    image_preview: Optional[str] = Field(default=None, description="Base64 JPEG preview of the processed image")


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_name: str
    version: str
