from pydantic import BaseModel, Field
from typing import Optional


class BoundingBox(BaseModel):
    x1: float = Field(description="Left coordinate")
    y1: float = Field(description="Top coordinate")
    x2: float = Field(description="Right coordinate")
    y2: float = Field(description="Bottom coordinate")


class SectionCounts(BaseModel):
    """Grid-based count breakdown — image divided into 3x3 sections."""
    top_left: int = 0
    top_center: int = 0
    top_right: int = 0
    middle_left: int = 0
    middle_center: int = 0
    middle_right: int = 0
    bottom_left: int = 0
    bottom_center: int = 0
    bottom_right: int = 0


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
    confidence_level: str = Field(default="medium", description="high, medium, or low")
    category: str = Field(default="Uncategorized", description="Suggested inventory category")
    sections: Optional[SectionCounts] = Field(default=None, description="3x3 grid count breakdown")
    notes: Optional[str] = Field(default=None, description="Counting challenges or unclear areas")
    needs_review: bool = Field(default=False, description="True if low confidence — flag for manual review")


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
