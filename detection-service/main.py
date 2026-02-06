import logging
import os
import sys
import traceback
import urllib.request
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from models import DetectionResponse, HealthResponse

settings = get_settings()

MODEL_URL = "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.onnx"

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
        from detector import YOLODetector
        detector = YOLODetector(settings)
        logger.info("Detector initialized successfully")
        return detector
    except Exception as e:
        detector_error = str(e)
        logger.error(f"Failed to initialize detector: {e}")
        logger.error(traceback.format_exc())
        return None


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


def download_model_if_missing():
    """Download YOLO model if it doesn't exist."""
    model_path = Path(settings.model_path)
    if model_path.exists():
        logger.info(f"Model already exists: {model_path} ({model_path.stat().st_size / 1024 / 1024:.1f} MB)")
        return True

    logger.info(f"Model not found at {model_path}, downloading from {MODEL_URL}...")
    try:
        urllib.request.urlretrieve(MODEL_URL, str(model_path))
        size_mb = model_path.stat().st_size / 1024 / 1024
        logger.info(f"Model downloaded successfully: {size_mb:.1f} MB")
        return True
    except Exception as e:
        logger.error(f"Failed to download model: {e}")
        return False


@app.on_event("startup")
async def startup_event():
    global detector_error
    logger.info("Starting detection service...")
    logger.info(f"Model path: {settings.model_path}")
    logger.info(f"Working directory: {os.getcwd()}")
    logger.info(f"Files in cwd: {os.listdir('.')}")

    # Download model if missing
    if not download_model_if_missing():
        detector_error = "Failed to download YOLO model"
        return

    # Try importing detector dependencies to catch errors early
    errors = []
    for mod_name in ["numpy", "cv2", "onnxruntime", "PIL"]:
        try:
            __import__(mod_name)
            logger.info(f"  {mod_name}: OK")
        except ImportError as e:
            logger.error(f"  {mod_name}: FAILED - {e}")
            errors.append(f"{mod_name}: {e}")

    if not errors:
        # Eagerly load the model so errors show up in logs
        det = get_detector()
        if det and det.is_loaded:
            logger.info("Model loaded successfully at startup")
        else:
            logger.warning(f"Model failed to load: {detector_error}")
    else:
        detector_error = f"Missing dependencies: {', '.join(errors)}"


@app.get("/")
async def root():
    return {"status": "ok"}


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="healthy" if detector_error is None else "error",
        model_loaded=detector is not None and detector.is_loaded,
        model_name=settings.model_path,
        version="1.0.0",
    )


@app.get("/debug")
async def debug_info():
    """Debug endpoint to diagnose issues."""
    import os
    info = {
        "model_path": settings.model_path,
        "model_file_exists": os.path.exists(settings.model_path),
        "detector_loaded": detector is not None,
        "detector_error": detector_error,
        "working_directory": os.getcwd(),
        "files_in_cwd": os.listdir("."),
        "python_version": sys.version,
    }
    # Check each dependency
    deps = {}
    for mod_name in ["numpy", "cv2", "onnxruntime", "PIL", "pillow_heif"]:
        try:
            mod = __import__(mod_name)
            deps[mod_name] = getattr(mod, "__version__", "installed")
        except ImportError as e:
            deps[mod_name] = f"MISSING: {e}"
    info["dependencies"] = deps
    return info


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
    try:
        from detector import COCO_CLASSES, INVENTORY_RELEVANT
        return {
            "all_classes": COCO_CLASSES,
            "inventory_relevant": {k: COCO_CLASSES[k] for k in sorted(INVENTORY_RELEVANT)},
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load detector module: {e}")
