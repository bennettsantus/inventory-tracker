import logging
import time
from io import BytesIO
from collections import defaultdict

import numpy as np
from PIL import Image
from ultralytics import YOLO

from config import Settings
from models import (
    BoundingBox,
    DetectedObject,
    DetectionResponse,
    DetectionSummary,
)

logger = logging.getLogger(__name__)

INVENTORY_RELEVANT_CLASSES = {
    39: "bottle",
    40: "wine glass",
    41: "cup",
    42: "fork",
    43: "knife",
    44: "spoon",
    45: "bowl",
    46: "banana",
    47: "apple",
    48: "sandwich",
    49: "orange",
    50: "broccoli",
    51: "carrot",
    52: "hot dog",
    53: "pizza",
    54: "donut",
    55: "cake",
    56: "chair",
    57: "couch",
    58: "potted plant",
    59: "bed",
    60: "dining table",
    67: "cell phone",
    73: "book",
    74: "clock",
    75: "vase",
}


class YOLODetector:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.model: YOLO | None = None
        self._load_model()

    def _load_model(self) -> None:
        logger.info(f"Loading YOLO model: {self.settings.model_name}")
        start = time.perf_counter()
        self.model = YOLO(self.settings.model_name)
        elapsed = (time.perf_counter() - start) * 1000
        logger.info(f"Model loaded in {elapsed:.0f}ms")

    def _preprocess_image(self, image_bytes: bytes) -> tuple[Image.Image, int, int]:
        image = Image.open(BytesIO(image_bytes))

        if image.mode == "RGBA":
            background = Image.new("RGB", image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[3])
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")

        original_width, original_height = image.size

        max_size = self.settings.max_image_size
        if original_width > max_size or original_height > max_size:
            ratio = min(max_size / original_width, max_size / original_height)
            new_width = int(original_width * ratio)
            new_height = int(original_height * ratio)
            image = image.resize((new_width, new_height), Image.LANCZOS)

        return image, original_width, original_height

    def detect(
        self,
        image_bytes: bytes,
        confidence_threshold: float | None = None,
        filter_inventory: bool = True,
    ) -> DetectionResponse:
        if self.model is None:
            return DetectionResponse(
                success=False,
                error="Model not loaded",
            )

        start_time = time.perf_counter()
        conf_thresh = confidence_threshold or self.settings.confidence_threshold

        try:
            image, orig_width, orig_height = self._preprocess_image(image_bytes)
        except Exception as e:
            logger.error(f"Image preprocessing failed: {e}")
            return DetectionResponse(
                success=False,
                error=f"Invalid image: {str(e)}",
            )

        try:
            results = self.model(
                image,
                conf=conf_thresh,
                iou=self.settings.iou_threshold,
                verbose=False,
            )
        except Exception as e:
            logger.error(f"YOLO inference failed: {e}")
            return DetectionResponse(
                success=False,
                error=f"Detection failed: {str(e)}",
            )

        detections: list[DetectedObject] = []
        class_counts: dict[str, list[float]] = defaultdict(list)

        for result in results:
            if result.boxes is None:
                continue

            boxes = result.boxes
            for i in range(len(boxes)):
                class_id = int(boxes.cls[i].item())
                confidence = float(boxes.conf[i].item())

                if filter_inventory and class_id not in INVENTORY_RELEVANT_CLASSES:
                    continue

                class_name = self.model.names[class_id]
                xyxy = boxes.xyxy[i].cpu().numpy()

                scale_x = orig_width / image.width
                scale_y = orig_height / image.height

                detection = DetectedObject(
                    class_name=class_name,
                    class_id=class_id,
                    confidence=round(confidence, 3),
                    bbox=BoundingBox(
                        x1=round(float(xyxy[0]) * scale_x, 1),
                        y1=round(float(xyxy[1]) * scale_y, 1),
                        x2=round(float(xyxy[2]) * scale_x, 1),
                        y2=round(float(xyxy[3]) * scale_y, 1),
                    ),
                )
                detections.append(detection)
                class_counts[class_name].append(confidence)

        summary = [
            DetectionSummary(
                class_name=name,
                count=len(confidences),
                avg_confidence=round(sum(confidences) / len(confidences), 3),
            )
            for name, confidences in sorted(
                class_counts.items(), key=lambda x: len(x[1]), reverse=True
            )
        ]

        processing_time = (time.perf_counter() - start_time) * 1000

        return DetectionResponse(
            success=True,
            detections=detections,
            summary=summary,
            total_objects=len(detections),
            processing_time_ms=round(processing_time, 1),
            image_width=orig_width,
            image_height=orig_height,
        )

    @property
    def is_loaded(self) -> bool:
        return self.model is not None
