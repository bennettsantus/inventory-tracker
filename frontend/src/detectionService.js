/**
 * detectionService.js - Detection API Client
 *
 * Handles communication with the Claude Vision detection backend.
 * Sends images for analysis and returns identified inventory items
 * with counts and confidence scores.
 */

const DETECTION_API_URL = import.meta.env.VITE_DETECTION_API_URL ||
  'https://detection-service1.onrender.com';

/**
 * Custom error class for detection API failures.
 * Includes HTTP status code for error handling in the UI.
 */
export class DetectionError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'DetectionError';
    this.status = status;
  }
}

/**
 * Send an image to the detection API for inventory analysis.
 *
 * @param {File} imageFile - Image file to analyze (JPEG, PNG, HEIC, etc.)
 * @param {Object} options - Detection options
 * @param {number} options.confidence - Minimum confidence threshold (0.0-1.0)
 * @param {boolean} options.filterInventory - Only return inventory-relevant items
 * @returns {Promise<Object>} Detection response with items, counts, and confidence scores
 * @throws {DetectionError} On network failure or server error
 */
export async function detectObjects(imageFile, options = {}) {
  const { confidence = 0.25, filterInventory = true } = options;

  if (!DETECTION_API_URL) {
    throw new DetectionError('Detection service not configured. Set VITE_DETECTION_API_URL environment variable.', 503);
  }

  const formData = new FormData();
  formData.append('image', imageFile);

  const params = new URLSearchParams();
  if (confidence) params.set('confidence', confidence.toString());
  if (filterInventory !== undefined) params.set('filter_inventory', filterInventory.toString());

  const url = `${DETECTION_API_URL}/detect?${params}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
  } catch (networkError) {
    throw new DetectionError(`Network error: ${networkError.message}`, 0);
  }

  if (!response.ok) {
    const errorText = await response.text();
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

/**
 * Check if the detection service is online and the model is loaded.
 *
 * @returns {Promise<Object>} Health status with model_loaded boolean
 */
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

/**
 * Convert a Blob to a File object for upload.
 *
 * @param {Blob} blob - Image blob from canvas capture
 * @param {string} filename - Filename to use for the upload
 * @returns {File} File object suitable for FormData
 */
export function blobToFile(blob, filename = 'capture.jpg') {
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}
