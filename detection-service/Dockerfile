FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download YOLOv8n model DURING BUILD (not at runtime)
# This ensures the model is baked into the Docker image
RUN curl -L -o yolov8n.onnx https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.onnx \
    && ls -lh yolov8n.onnx \
    && echo "Model size: $(stat -c%s yolov8n.onnx 2>/dev/null || stat -f%z yolov8n.onnx) bytes"

# Verify model was downloaded correctly (should be ~6MB)
RUN test $(stat -c%s yolov8n.onnx 2>/dev/null || stat -f%z yolov8n.onnx) -gt 5000000 \
    || (echo "ERROR: Model file too small, download failed" && exit 1)

# Copy application code
COPY . .

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
