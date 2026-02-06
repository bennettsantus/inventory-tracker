FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including X11 libs needed by OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgomp1 \
    libxcb1 \
    libx11-6 \
    libxext6 \
    libxrender1 \
    libgl1 \
    libsm6 \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies first
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install ultralytics to export model to ONNX
RUN pip install --no-cache-dir ultralytics

# Download YOLOv8n.pt and export to ONNX during build
RUN python -c "from ultralytics import YOLO; model = YOLO('yolov8n.pt'); model.export(format='onnx')" \
    && ls -lh /app/yolov8n.onnx

# Verify model file size (should be ~6MB)
RUN test $(stat -c%s /app/yolov8n.onnx) -gt 5000000 || \
    (echo "ERROR: Model export failed" && exit 1)

# Copy application code
COPY . .

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
