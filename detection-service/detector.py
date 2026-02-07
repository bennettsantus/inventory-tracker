import base64
import json
import logging
import time
from io import BytesIO

from PIL import Image

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

import anthropic

from config import Settings
from models import (
    DetectedObject,
    DetectionResponse,
    DetectionSummary,
)

logger = logging.getLogger(__name__)

VISION_PROMPT = """You are an inventory counting assistant for a restaurant. Analyze this image and identify every distinct product you can see.

For each product, provide:
- "class_name": A specific, descriptive name (e.g., "Coca-Cola 12oz can", "Heinz Ketchup 20oz bottle", "Budweiser 12oz can"). Include brand, size, and container type when visible.
- "count": How many of this exact product you see.
- "confidence": Your confidence from 0.0 to 1.0 that this identification is correct.
- "description": Optional brief note (e.g., "appears to be diet variant", "partially obscured").

Return ONLY a JSON object in this exact format, with no other text:
{
  "items": [
    {
      "class_name": "Coca-Cola 12oz can",
      "count": 6,
      "confidence": 0.95,
      "description": "Regular Coca-Cola, red cans"
    }
  ]
}

Rules:
- Group identical products together with a count, do NOT list each individual unit separately.
- If you cannot identify the specific brand, use a generic description (e.g., "unknown cola can", "green glass bottle").
- If no products/inventory items are visible, return {"items": []}.
- Only return the JSON object. No markdown, no explanation, no code fences."""


class VisionDetector:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client: anthropic.Anthropic | None = None
        self._ready = False
        self._init_client()

    def _init_client(self) -> None:
        if not self.settings.anthropic_api_key:
            logger.error("ANTHROPIC_API_KEY not set")
            return
        try:
            self.client = anthropic.Anthropic(api_key=self.settings.anthropic_api_key)
            self._ready = True
            logger.info(f"Anthropic client initialized, model: {self.settings.anthropic_model}")
        except Exception as e:
            logger.error(f"Failed to initialize Anthropic client: {e}")

    def _prepare_image(self, image_bytes: bytes) -> tuple[str, str, int, int]:
        """Convert to JPEG, resize if needed, return (base64_str, media_type, orig_width, orig_height)."""
        image = Image.open(BytesIO(image_bytes))

        if image.mode in ("RGBA", "P"):
            bg = Image.new("RGB", image.size, (255, 255, 255))
            if image.mode == "RGBA":
                bg.paste(image, mask=image.split()[3])
            else:
                bg.paste(image)
            image = bg
        elif image.mode != "RGB":
            image = image.convert("RGB")

        orig_w, orig_h = image.size

        max_dim = self.settings.max_image_size
        if max(orig_w, orig_h) > max_dim:
            scale = max_dim / max(orig_w, orig_h)
            new_w, new_h = int(orig_w * scale), int(orig_h * scale)
            image = image.resize((new_w, new_h), Image.LANCZOS)
            logger.info(f"Resized image from {orig_w}x{orig_h} to {new_w}x{new_h}")

        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=85)
        b64_str = base64.standard_b64encode(buffer.getvalue()).decode("utf-8")

        return b64_str, "image/jpeg", orig_w, orig_h

    def _parse_response(self, text: str, conf_thresh: float) -> list[dict]:
        """Parse Claude's JSON response, filtering by confidence threshold."""
        cleaned = text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            cleaned = "\n".join(lines[1:-1]).strip()

        data = json.loads(cleaned)
        items = data.get("items", [])

        results = []
        for item in items:
            conf = float(item.get("confidence", 0.5))
            if conf < conf_thresh:
                continue
            results.append({
                "class_name": str(item.get("class_name", "unknown")),
                "count": max(1, int(item.get("count", 1))),
                "confidence": round(conf, 3),
                "description": item.get("description"),
            })
        return results

    def detect(
        self,
        image_bytes: bytes,
        confidence_threshold: float | None = None,
        filter_inventory: bool = True,
    ) -> DetectionResponse:
        if not self._ready or self.client is None:
            return DetectionResponse(
                success=False,
                error="Vision API client not initialized. Check ANTHROPIC_API_KEY.",
            )

        start_time = time.perf_counter()
        conf_thresh = confidence_threshold or self.settings.confidence_threshold

        try:
            b64_image, media_type, orig_w, orig_h = self._prepare_image(image_bytes)
        except Exception as e:
            logger.error(f"Image preparation failed: {e}")
            return DetectionResponse(success=False, error=f"Invalid image: {e}")

        try:
            message = self.client.messages.create(
                model=self.settings.anthropic_model,
                max_tokens=self.settings.anthropic_max_tokens,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": b64_image,
                                },
                            },
                            {
                                "type": "text",
                                "text": VISION_PROMPT,
                            },
                        ],
                    }
                ],
            )
            raw_text = message.content[0].text
        except anthropic.APIError as e:
            logger.error(f"Anthropic API error: {e}")
            return DetectionResponse(success=False, error=f"Vision API error: {e.message}")
        except Exception as e:
            logger.error(f"Vision API call failed: {e}")
            return DetectionResponse(success=False, error=f"Vision API call failed: {e}")

        try:
            parsed_items = self._parse_response(raw_text, conf_thresh)
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.error(f"Failed to parse vision response: {e}\nRaw: {raw_text[:500]}")
            return DetectionResponse(
                success=False,
                error=f"Failed to parse detection results: {e}",
            )

        detections = []
        summary = []
        for item in parsed_items:
            detections.append(DetectedObject(
                class_name=item["class_name"],
                class_id=0,
                confidence=item["confidence"],
                bbox=None,
                description=item.get("description"),
            ))
            summary.append(DetectionSummary(
                class_name=item["class_name"],
                count=item["count"],
                avg_confidence=item["confidence"],
            ))

        total_objects = sum(item["count"] for item in parsed_items)
        processing_time = (time.perf_counter() - start_time) * 1000

        return DetectionResponse(
            success=True,
            detections=detections,
            summary=summary,
            total_objects=total_objects,
            processing_time_ms=round(processing_time, 1),
            image_width=orig_w,
            image_height=orig_h,
        )

    @property
    def is_loaded(self) -> bool:
        return self._ready
