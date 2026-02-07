import logging
import os
import sys
import traceback
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
detector_error = None


def get_detector():
    global detector, detector_error
    if detector is not None:
        return detector
    if detector_error is not None:
        return None
    try:
        from detector import VisionDetector
        detector = VisionDetector(settings)
        logger.info("Detector initialized successfully")
        return detector
    except Exception as e:
        detector_error = str(e)
        logger.error(f"Failed to initialize detector: {e}")
        logger.error(traceback.format_exc())
        return None


app = FastAPI(
    title="Inventory Detection API",
    description="Claude Vision-powered product detection for restaurant inventory",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    global detector_error
    logger.info("Starting detection service...")

    if not settings.anthropic_api_key:
        detector_error = "ANTHROPIC_API_KEY environment variable is not set"
        logger.error(detector_error)
        return

    det = get_detector()
    if det and det.is_loaded:
        logger.info("Vision detector initialized successfully")
    else:
        logger.warning(f"Detector failed to initialize: {detector_error}")


@app.get("/")
async def root():
    return {"status": "ok"}


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="healthy" if detector_error is None and detector is not None else "error",
        model_loaded=detector is not None and detector.is_loaded,
        model_name=settings.anthropic_model,
        version="2.0.0",
    )


@app.get("/debug")
async def debug_info():
    """Debug endpoint to diagnose issues."""
    return {
        "backend": "claude-vision",
        "anthropic_model": settings.anthropic_model,
        "api_key_set": bool(settings.anthropic_api_key),
        "detector_loaded": detector is not None,
        "detector_is_loaded": detector.is_loaded if detector else False,
        "detector_error": detector_error,
        "working_directory": os.getcwd(),
        "python_version": sys.version,
    }


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
    if det is None or not det.is_loaded:
        raise HTTPException(
            status_code=503,
            detail=f"Detection model not available: {detector_error or 'unknown error'}",
        )

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
    return {
        "backend": "claude-vision",
        "note": "Claude Vision identifies products by brand, size, and type. No fixed class list.",
        "examples": [
            "Coca-Cola 12oz can",
            "Heinz Ketchup 20oz bottle",
            "Budweiser 12-pack",
        ],
    }
