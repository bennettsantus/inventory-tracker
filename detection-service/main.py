import logging
import sys
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from detector import YOLODetector
from models import DetectionResponse, HealthResponse

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

detector: YOLODetector | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector
    logger.info("Starting detection service")
    detector = YOLODetector(settings)
    yield
    logger.info("Shutting down detection service")


app = FastAPI(
    title="Inventory Detection API",
    description="YOLO26-powered object detection for restaurant inventory",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="healthy" if detector and detector.is_loaded else "degraded",
        model_loaded=detector.is_loaded if detector else False,
        model_name=settings.model_name,
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
    if detector is None or not detector.is_loaded:
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

    result = detector.detect(
        image_bytes=content,
        confidence_threshold=confidence,
        filter_inventory=filter_inventory,
    )

    if not result.success:
        raise HTTPException(status_code=422, detail=result.error)

    return result


@app.get("/classes")
async def get_supported_classes() -> dict:
    if detector is None or not detector.is_loaded:
        raise HTTPException(status_code=503, detail="Detection model not available")

    return {
        "all_classes": detector.model.names,
        "inventory_relevant": {
            k: detector.model.names[k]
            for k in sorted(
                set(detector.model.names.keys())
                & set([39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 67, 73, 74, 75])
            )
        },
    }
