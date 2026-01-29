const DETECTION_API_URL = import.meta.env.VITE_DETECTION_API_URL || '';

export class DetectionError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'DetectionError';
    this.status = status;
  }
}

export async function detectObjects(imageFile, options = {}) {
  const { confidence = 0.25, filterInventory = true } = options;

  if (!DETECTION_API_URL) {
    throw new DetectionError('Detection service not configured', 503);
  }

  const formData = new FormData();
  formData.append('image', imageFile);

  const params = new URLSearchParams();
  if (confidence) params.set('confidence', confidence.toString());
  if (filterInventory !== undefined) params.set('filter_inventory', filterInventory.toString());

  const url = `${DETECTION_API_URL}/detect?${params}`;

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Detection failed' }));
    throw new DetectionError(error.detail || 'Detection failed', response.status);
  }

  return response.json();
}

export async function checkHealth() {
  if (!DETECTION_API_URL) {
    return { status: 'unavailable', model_loaded: false };
  }

  try {
    const response = await fetch(`${DETECTION_API_URL}/health`);
    if (!response.ok) {
      return { status: 'error', model_loaded: false };
    }
    return response.json();
  } catch {
    return { status: 'offline', model_loaded: false };
  }
}

export function blobToFile(blob, filename = 'capture.jpg') {
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}
