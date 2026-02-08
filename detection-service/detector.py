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
    SectionCounts,
)

logger = logging.getLogger(__name__)

# Map confidence level strings to numeric scores
CONFIDENCE_MAP = {"high": 0.95, "medium": 0.75, "low": 0.4}

SYSTEM_PROMPT = (
    "You are an expert inventory counter with perfect precision. When counting items, you must:\n"
    "1. Divide the image into a 3x3 grid (9 sections)\n"
    "2. Count items in each section separately and show your work\n"
    "3. Sum the sections and verify the total makes sense\n"
    "4. Provide a confidence score based on image clarity and item visibility\n"
    "5. Always respond in valid JSON format"
)

VISION_PROMPT = """Count and identify every product in this image for restaurant inventory.

Use the GRID METHOD — mentally divide the image into a 3x3 grid and count each product type per section:
- Top-left | Top-center | Top-right
- Middle-left | Middle-center | Middle-right
- Bottom-left | Bottom-center | Bottom-right

For each distinct product type, count units in EACH section, then sum for the total.

Return ONLY this JSON (no markdown, no explanation):
{
  "items": [
    {
      "class_name": "Coca-Cola 12oz can",
      "sections": {
        "top_left": 0,
        "top_center": 0,
        "top_right": 0,
        "middle_left": 0,
        "middle_center": 0,
        "middle_right": 0,
        "bottom_left": 0,
        "bottom_center": 0,
        "bottom_right": 0
      },
      "total": 0,
      "confidence": "high",
      "notes": "any counting challenges"
    }
  ]
}

Rules:
- "class_name": Brand, size, container type (e.g., "Pepsi 12oz can"). Use generic names if brand unclear.
- "sections": Count of THIS item type in each grid section. The sum MUST equal "total".
- "total": Exact total count. Verify it equals the sum of all 9 sections.
- "confidence": "high" (clearly visible, easy count), "medium" (some obstruction/overlap), or "low" (significant uncertainty).
- "notes": Mention any counting challenges (hidden items, overlapping, unclear brands).
- Group identical products. Do NOT list each unit separately.
- Empty image = {"items": []}"""


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
        """Parse Claude's grid-based JSON response, validate sections, filter by confidence."""
        cleaned = text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            cleaned = "\n".join(lines[1:-1]).strip()

        data = json.loads(cleaned)
        items = data.get("items", [])

        results = []
        for item in items:
            confidence_level = str(item.get("confidence", "medium")).lower()
            if confidence_level not in CONFIDENCE_MAP:
                confidence_level = "medium"
            conf_numeric = CONFIDENCE_MAP[confidence_level]

            if conf_numeric < conf_thresh:
                continue

            sections = item.get("sections", {})
            section_sum = sum(int(v) for v in sections.values()) if sections else 0
            stated_total = int(item.get("total", 0))

            # Trust the section sum over the stated total if they disagree
            if sections and section_sum > 0 and section_sum != stated_total:
                logger.warning(
                    f"Section sum {section_sum} != stated total {stated_total} "
                    f"for '{item.get('class_name')}'. Using section sum."
                )
                total = section_sum
            elif section_sum > 0:
                total = section_sum
            else:
                total = max(1, stated_total)

            results.append({
                "class_name": str(item.get("class_name", "unknown")),
                "count": total,
                "confidence": conf_numeric,
                "confidence_level": confidence_level,
                "sections": {k: int(v) for k, v in sections.items()} if sections else {},
                "notes": item.get("notes"),
                "needs_review": confidence_level == "low",
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
                system=SYSTEM_PROMPT,
                thinking={
                    "type": "enabled",
                    "budget_tokens": self.settings.anthropic_thinking_budget,
                },
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
            # With extended thinking, response has thinking blocks + text blocks.
            # Extract the text block containing the JSON.
            raw_text = None
            for block in message.content:
                if block.type == "text":
                    raw_text = block.text
                    break
            if raw_text is None:
                raise ValueError("No text block in response")
        except anthropic.APIError as e:
            logger.error(f"Anthropic API error: {e}")
            return DetectionResponse(success=False, error=f"Vision API error: {e.message}")
        except Exception as e:
            logger.error(f"Vision API call failed: {e}")
            return DetectionResponse(success=False, error=f"Vision API call failed: {e}")

        try:
            parsed_items = self._parse_response(raw_text, conf_thresh)
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
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
                description=item.get("notes"),
            ))
            summary.append(DetectionSummary(
                class_name=item["class_name"],
                count=item["count"],
                avg_confidence=item["confidence"],
                confidence_level=item["confidence_level"],
                sections=SectionCounts(**item["sections"]) if item.get("sections") else None,
                notes=item.get("notes"),
                needs_review=item.get("needs_review", False),
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
            image_preview=b64_image,
        )

    @property
    def is_loaded(self) -> bool:
        return self._ready
