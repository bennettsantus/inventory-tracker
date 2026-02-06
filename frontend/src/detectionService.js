// Detection API URL - check env var, then use Render detection service
const DETECTION_API_URL = import.meta.env.VITE_DETECTION_API_URL ||
  'https://detection-service1.onrender.com';

console.log('🔍 Detection API URL:', DETECTION_API_URL || 'NOT CONFIGURED');

export class DetectionError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'DetectionError';
    this.status = status;
  }
}

export async function detectObjects(imageFile, options = {}) {
  const { confidence = 0.25, filterInventory = true } = options;

  console.log('🔵 detectObjects called with:', {
    fileName: imageFile?.name,
    fileSize: imageFile?.size,
    fileType: imageFile?.type,
    apiUrl: DETECTION_API_URL
  });

  if (!DETECTION_API_URL) {
    console.error('❌ Detection API URL not configured');
    throw new DetectionError('Detection service not configured. Set VITE_DETECTION_API_URL environment variable.', 503);
  }

  const formData = new FormData();
  formData.append('image', imageFile);

  const params = new URLSearchParams();
  if (confidence) params.set('confidence', confidence.toString());
  if (filterInventory !== undefined) params.set('filter_inventory', filterInventory.toString());

  const url = `${DETECTION_API_URL}/detect?${params}`;

  console.log('Sending detection request to:', url);
  console.log('File:', imageFile.name, 'Size:', imageFile.size, 'Type:', imageFile.type);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
  } catch (networkError) {
    console.error('Network error:', networkError);
    throw new DetectionError(`Network error: ${networkError.message}`, 0);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Server error:', response.status, errorText);
    let errorDetail;
    try {
      errorDetail = JSON.parse(errorText).detail;
    } catch {
      errorDetail = errorText || `Server error ${response.status}`;
    }
    throw new DetectionError(errorDetail, response.status);
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
