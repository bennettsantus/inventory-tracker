FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgomp1 \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download YOLOv8n model DURING BUILD
# Using wget with explicit redirect following
RUN wget --no-check-certificate -O yolov8n.onnx \
    "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.onnx" \
    && ls -lh yolov8n.onnx

# If GitHub fails, try HuggingFace mirror
RUN if [ $(stat -c%s yolov8n.onnx) -lt 5000000 ]; then \
        echo "GitHub download failed, trying HuggingFace..." && \
        wget --no-check-certificate -O yolov8n.onnx \
        "https://huggingface.co/Ultralytics/YOLOv8/resolve/main/yolov8n.onnx" && \
        ls -lh yolov8n.onnx; \
    fi

# Final verification
RUN ls -lh yolov8n.onnx && \
    test $(stat -c%s yolov8n.onnx) -gt 5000000 || \
    (echo "ERROR: Model download failed from all sources" && exit 1)

# Copy application code
COPY . .

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
