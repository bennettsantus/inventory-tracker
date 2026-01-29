import logging
import sys
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from models import DetectionResponse, HealthResponse

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

detector = None


def get_detector():
    global detector
    if detector is None:
        from detector import YOLODetector
        detector = YOLODetector(settings)
    return detector


app = FastAPI(
    title="Inventory Detection API",
    description="YOLO-powered object detection for restaurant inventory",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"status": "ok"}


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="healthy",
        model_loaded=detector is not None and detector.is_loaded,
        model_name=settings.model_path,
        version="1.0.0",
    )


@app.post("/detect", response_model=DetectionResponse)
async def detect_objects(
    image: Annotated[UploadFile, File(description="Image file to analyze")],
    confidence: Annotated[
        float | None,
        Query(ge=0.1, le=1.0, description="Minimum confidence threshold"),
    ] = None,
    filter_inventory: Annotated[
        bool,
        Query(description="Filter to inventory-relevant items only"),
    ] = True,
) -> DetectionResponse:
    det = get_detector()
    if not det.is_loaded:
        raise HTTPException(status_code=503, detail="Detection model not available")

    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content type: {image.content_type}. Expected image/*",
        )

    max_bytes = settings.max_upload_mb * 1024 * 1024
    content = await image.read()

    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Image too large. Maximum size is {settings.max_upload_mb}MB",
        )

    if len(content) < 100:
        raise HTTPException(status_code=400, detail="Image file appears to be empty")

    result = det.detect(
        image_bytes=content,
        confidence_threshold=confidence,
        filter_inventory=filter_inventory,
    )

    if not result.success:
        raise HTTPException(status_code=422, detail=result.error)

    return result


@app.get("/classes")
async def get_supported_classes() -> dict:
    from detector import COCO_CLASSES, INVENTORY_RELEVANT
    return {
        "all_classes": COCO_CLASSES,
        "inventory_relevant": {k: COCO_CLASSES[k] for k in sorted(INVENTORY_RELEVANT)},
    }
