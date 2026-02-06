import logging
import time
from io import BytesIO
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

from config import Settings
from models import (
    BoundingBox,
    DetectedObject,
    DetectionResponse,
    DetectionSummary,
)

logger = logging.getLogger(__name__)

COCO_CLASSES = {
    0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 4: 'airplane',
    5: 'bus', 6: 'train', 7: 'truck', 8: 'boat', 9: 'traffic light',
    10: 'fire hydrant', 11: 'stop sign', 12: 'parking meter', 13: 'bench',
    14: 'bird', 15: 'cat', 16: 'dog', 17: 'horse', 18: 'sheep', 19: 'cow',
    20: 'elephant', 21: 'bear', 22: 'zebra', 23: 'giraffe', 24: 'backpack',
    25: 'umbrella', 26: 'handbag', 27: 'tie', 28: 'suitcase', 29: 'frisbee',
    30: 'skis', 31: 'snowboard', 32: 'sports ball', 33: 'kite', 34: 'baseball bat',
    35: 'baseball glove', 36: 'skateboard', 37: 'surfboard', 38: 'tennis racket',
    39: 'bottle', 40: 'wine glass', 41: 'cup', 42: 'fork', 43: 'knife',
    44: 'spoon', 45: 'bowl', 46: 'banana', 47: 'apple', 48: 'sandwich',
    49: 'orange', 50: 'broccoli', 51: 'carrot', 52: 'hot dog', 53: 'pizza',
    54: 'donut', 55: 'cake', 56: 'chair', 57: 'couch', 58: 'potted plant',
    59: 'bed', 60: 'dining table', 61: 'toilet', 62: 'tv', 63: 'laptop',
    64: 'mouse', 65: 'remote', 66: 'keyboard', 67: 'cell phone', 68: 'microwave',
    69: 'oven', 70: 'toaster', 71: 'sink', 72: 'refrigerator', 73: 'book',
    74: 'clock', 75: 'vase', 76: 'scissors', 77: 'teddy bear', 78: 'hair drier',
    79: 'toothbrush'
}

INVENTORY_RELEVANT = {39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 67, 68, 69, 70, 71, 72, 73, 74, 75}


class YOLODetector:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.session: ort.InferenceSession | None = None
        self.input_name: str = ""
        self.input_shape: tuple = (640, 640)
        self._load_model()

    def _load_model(self) -> None:
        model_path = Path(self.settings.model_path)
        if not model_path.exists():
            logger.error(f"Model not found: {model_path}")
            return

        logger.info(f"Loading ONNX model: {model_path}")
        start = time.perf_counter()

        providers = ['CPUExecutionProvider']
        self.session = ort.InferenceSession(str(model_path), providers=providers)
        self.input_name = self.session.get_inputs()[0].name

        input_shape = self.session.get_inputs()[0].shape
        if len(input_shape) == 4:
            self.input_shape = (input_shape[2], input_shape[3])

        elapsed = (time.perf_counter() - start) * 1000
        logger.info(f"Model loaded in {elapsed:.0f}ms, input shape: {self.input_shape}")

    def _preprocess(self, image_bytes: bytes) -> tuple[np.ndarray, int, int, float]:
        image = Image.open(BytesIO(image_bytes))
        if image.mode == "RGBA":
            bg = Image.new("RGB", image.size, (255, 255, 255))
            bg.paste(image, mask=image.split()[3])
            image = bg
        elif image.mode != "RGB":
            image = image.convert("RGB")

        orig_w, orig_h = image.size
        img = np.array(image)

        target_h, target_w = self.input_shape
        scale = min(target_w / orig_w, target_h / orig_h)
        new_w, new_h = int(orig_w * scale), int(orig_h * scale)

        resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        padded = np.full((target_h, target_w, 3), 114, dtype=np.uint8)
        pad_x, pad_y = (target_w - new_w) // 2, (target_h - new_h) // 2
        padded[pad_y:pad_y + new_h, pad_x:pad_x + new_w] = resized

        blob = padded.astype(np.float32) / 255.0
        blob = blob.transpose(2, 0, 1)[np.newaxis, ...]

        return blob, orig_w, orig_h, scale

    def _postprocess(
        self,
        outputs: np.ndarray,
        orig_w: int,
        orig_h: int,
        scale: float,
        conf_thresh: float,
        filter_inventory: bool,
    ) -> list[DetectedObject]:
        predictions = outputs[0]

        if predictions.shape[1] == 84:
            predictions = predictions.transpose(0, 2, 1)

        detections = []
        pad_x = (self.input_shape[1] - int(orig_w * scale)) // 2
        pad_y = (self.input_shape[0] - int(orig_h * scale)) // 2

        for pred in predictions[0]:
            if len(pred) < 5:
                continue

            scores = pred[4:]
            class_id = int(np.argmax(scores))
            confidence = float(scores[class_id])

            if confidence < conf_thresh:
                continue

            if filter_inventory and class_id not in INVENTORY_RELEVANT:
                continue

            cx, cy, w, h = pred[:4]

            x1 = (cx - w / 2 - pad_x) / scale
            y1 = (cy - h / 2 - pad_y) / scale
            x2 = (cx + w / 2 - pad_x) / scale
            y2 = (cy + h / 2 - pad_y) / scale

            x1 = max(0, min(x1, orig_w))
            y1 = max(0, min(y1, orig_h))
            x2 = max(0, min(x2, orig_w))
            y2 = max(0, min(y2, orig_h))

            if x2 - x1 < 1 or y2 - y1 < 1:
                continue

            detections.append(DetectedObject(
                class_name=COCO_CLASSES.get(class_id, f"class_{class_id}"),
                class_id=class_id,
                confidence=round(confidence, 3),
                bbox=BoundingBox(
                    x1=round(x1, 1),
                    y1=round(y1, 1),
                    x2=round(x2, 1),
                    y2=round(y2, 1),
                ),
            ))

        return self._nms(detections, self.settings.iou_threshold)

    def _nms(self, detections: list[DetectedObject], iou_thresh: float) -> list[DetectedObject]:
        if not detections:
            return []

        detections = sorted(detections, key=lambda x: x.confidence, reverse=True)
        keep = []

        while detections:
            best = detections.pop(0)
            keep.append(best)

            detections = [
                d for d in detections
                if d.class_id != best.class_id or self._iou(best.bbox, d.bbox) < iou_thresh
            ]

        return keep

    def _iou(self, a: BoundingBox, b: BoundingBox) -> float:
        x1 = max(a.x1, b.x1)
        y1 = max(a.y1, b.y1)
        x2 = min(a.x2, b.x2)
        y2 = min(a.y2, b.y2)

        inter = max(0, x2 - x1) * max(0, y2 - y1)
        area_a = (a.x2 - a.x1) * (a.y2 - a.y1)
        area_b = (b.x2 - b.x1) * (b.y2 - b.y1)

        return inter / (area_a + area_b - inter + 1e-6)

    def detect(
        self,
        image_bytes: bytes,
        confidence_threshold: float | None = None,
        filter_inventory: bool = True,
    ) -> DetectionResponse:
        if self.session is None:
            return DetectionResponse(success=False, error="Model not loaded")

        start_time = time.perf_counter()
        conf_thresh = confidence_threshold or self.settings.confidence_threshold

        try:
            blob, orig_w, orig_h, scale = self._preprocess(image_bytes)
        except Exception as e:
            logger.error(f"Preprocessing failed: {e}")
            return DetectionResponse(success=False, error=f"Invalid image: {e}")

        try:
            outputs = self.session.run(None, {self.input_name: blob})
        except Exception as e:
            logger.error(f"Inference failed: {e}")
            return DetectionResponse(success=False, error=f"Detection failed: {e}")

        detections = self._postprocess(
            np.array(outputs), orig_w, orig_h, scale, conf_thresh, filter_inventory
        )

        class_counts: dict[str, list[float]] = defaultdict(list)
        for d in detections:
            class_counts[d.class_name].append(d.confidence)

        summary = [
            DetectionSummary(
                class_name=name,
                count=len(confs),
                avg_confidence=round(sum(confs) / len(confs), 3),
            )
            for name, confs in sorted(class_counts.items(), key=lambda x: len(x[1]), reverse=True)
        ]

        processing_time = (time.perf_counter() - start_time) * 1000

        return DetectionResponse(
            success=True,
            detections=detections,
            summary=summary,
            total_objects=len(detections),
            processing_time_ms=round(processing_time, 1),
            image_width=orig_w,
            image_height=orig_h,
        )

    @property
    def is_loaded(self) -> bool:
        return self.session is not None
