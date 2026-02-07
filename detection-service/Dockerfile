# Detection Service - Claude Vision API
# Receives images via FastAPI, sends them to Claude Vision for
# product identification, and returns structured inventory data.

FROM python:3.11-slim

WORKDIR /app

# Install libheif for HEIC/HEIF image support (iPhone photos)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libheif-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (separate layer for Docker caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Default port (can be overridden by PORT env var)
ENV PORT=8000
EXPOSE 8000

# Start FastAPI with uvicorn, using PORT from environment
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
