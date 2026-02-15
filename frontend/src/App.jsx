/**
 * App.jsx - Inventory Tracker Application
 *
 * Main application component for Mike's restaurant inventory system.
 * Combines barcode scanning, AI-powered image detection (Claude Vision),
 * inventory management, usage analytics, and waste tracking.
 *
 * Components defined in this file:
 *   ErrorBoundary - Catches React rendering errors
 *   BarcodeScanner - QR/barcode scanning via camera
 *   InventoryList - Main inventory grid with stock status
 *   DetectView - Camera capture + Claude Vision detection
 *   AuthScreen - Login/signup forms
 *   SettingsMenu - App settings dropdown
 */

/* === Constants === */
const DETECTION_CONFIDENCE = 0.3;
const IMAGE_QUALITY = 0.9;
const QR_SCANNER_FPS = 10;
const DEFAULT_ANALYTICS_DAYS = 30;
const MS_PER_DAY = 86400000;
const MIN_PASSWORD_LENGTH = 6;

import { useState, useEffect, useRef, useCallback, Component } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { detectObjects, checkHealth, blobToFile } from './detectionService';

// Error Boundary to prevent white screen crashes
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            {this.state.error?.message || 'An error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '1rem 2rem',
              background: '#13ec5b',
              color: '#0f172a',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Dynamic API base URL - works in development (via Vite proxy) and production
const getApiBase = () => {
  // In production, API is served from same origin
  // In development, Vite proxies /api to localhost:3001
  // This always uses relative path which works on any domain
  return '/api';
};

const API_BASE = getApiBase();

// Auth token management
const getAuthToken = () => localStorage.getItem('authToken');
const setAuthToken = (token) => localStorage.setItem('authToken', token);
const clearAuthToken = () => localStorage.removeItem('authToken');

const getAuthHeaders = () => {
  const token = getAuthToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// Barcode lookup API (Open Food Facts - free, no API key needed)
async function lookupBarcode(barcode) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await res.json();

    if (data.status === 1 && data.product) {
      const product = data.product;
      return {
        name: product.product_name || product.product_name_en || null,
        category: product.categories_tags?.[0]?.replace('en:', '').replace(/-/g, ' ') || null,
        brand: product.brands || null,
      };
    }
    return null;
  } catch (err) {
    return null;
  }
}

// API functions
const api = {
  // Auth endpoints
  async signup(email, password, name) {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');
    return data;
  },

  async login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    return data;
  },

  async getMe() {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { ...getAuthHeaders() },
    });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) throw new Error('Failed to get user');
    return res.json();
  },

  // Inventory endpoints
  async getItems() {
    const res = await fetch(`${API_BASE}/items`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Failed to fetch items');
    return res.json();
  },

  async getItemByBarcode(barcode) {
    const res = await fetch(`${API_BASE}/items/barcode/${barcode}`, {
      headers: { ...getAuthHeaders() },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch item');
    return res.json();
  },

  async getItemUsage(id, days = 30) {
    const res = await fetch(`${API_BASE}/items/${id}/usage?days=${days}`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Failed to fetch usage data');
    return res.json();
  },

  async recordWaste(itemId, quantity, reason, notes = null, costEstimate = null) {
    const res = await fetch(`${API_BASE}/waste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ item_id: itemId, quantity, reason, notes, cost_estimate: costEstimate }),
    });
    if (!res.ok) throw new Error('Failed to record waste');
    return res.json();
  },

  async getWasteAnalytics(days = 30) {
    const res = await fetch(`${API_BASE}/waste/analytics?days=${days}`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Failed to fetch waste analytics');
    return res.json();
  },

  async getAllWaste(days = 30) {
    const res = await fetch(`${API_BASE}/waste?days=${days}`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Failed to fetch waste records');
    return res.json();
  },

  async createItem(item) {
    const res = await fetch(`${API_BASE}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(item),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create item');
    }
    return res.json();
  },

  async updateItem(id, item) {
    const res = await fetch(`${API_BASE}/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error('Failed to update item');
    return res.json();
  },

  async updateQuantity(id, quantity) {
    const res = await fetch(`${API_BASE}/items/${id}/quantity`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ quantity }),
    });
    if (!res.ok) throw new Error('Failed to update quantity');
    return res.json();
  },

  async deleteItem(id) {
    const res = await fetch(`${API_BASE}/items/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Failed to delete item');
    return res.json();
  },

  // Counting endpoints
  async recordCount(itemId, countValue, location, notes) {
    const res = await fetch(`${API_BASE}/counts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ item_id: itemId, count_value: countValue, storage_location: location, notes }),
    });
    if (!res.ok) throw new Error('Failed to record count');
    return res.json();
  },

  async recordBulkCounts(counts, location) {
    const res = await fetch(`${API_BASE}/counts/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ counts, storage_location: location }),
    });
    if (!res.ok) throw new Error('Failed to record counts');
    return res.json();
  },

  async getRecentCounts(hours = 24) {
    const res = await fetch(`${API_BASE}/counts/recent?hours=${hours}`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Failed to fetch recent counts');
    return res.json();
  },

  async getCountHistory(itemId) {
    const res = await fetch(`${API_BASE}/counts/history/${itemId}`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Failed to fetch count history');
    return res.json();
  },

  // Dashboard
  async getDashboardStats() {
    const res = await fetch(`${API_BASE}/dashboard/stats`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Failed to fetch dashboard stats');
    return res.json();
  },

  // Suppliers
  async getSuppliers() {
    const res = await fetch(`${API_BASE}/suppliers`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Failed to fetch suppliers');
    return res.json();
  },

  async createSupplier(data) {
    const res = await fetch(`${API_BASE}/suppliers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create supplier');
    return res.json();
  },

  async updateSupplier(id, data) {
    const res = await fetch(`${API_BASE}/suppliers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update supplier');
    return res.json();
  },

  async deleteSupplier(id) {
    const res = await fetch(`${API_BASE}/suppliers/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Failed to delete supplier');
    return res.json();
  },

  // Filtered items by location
  async getItemsByLocation(location) {
    const res = await fetch(`${API_BASE}/items?location=${encodeURIComponent(location)}`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Failed to fetch items');
    return res.json();
  },
};

// Barcode Scanner Component - Using isolated scanner instance
function ScannerView({ onScan, onStop }) {
  const [scannerReady, setScannerReady] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);
  const scannerRef = useRef(null);

  const toggleFlash = async () => {
    if (!scannerRef.current) return;

    try {
      const newFlashState = !flashOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: newFlashState }]
      });
      setFlashOn(newFlashState);
    } catch (err) {
    }
  };

  useEffect(() => {
    let scanner = null;
    let stopped = false;
    let scannedCode = null;

    const startCamera = async () => {
      try {
        await new Promise(r => setTimeout(r, 300));
        if (stopped) return;

        scanner = new Html5Qrcode('qr-reader');
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: QR_SCANNER_FPS, qrbox: { width: 250, height: 150 } },
          (text) => {
            if (!stopped && !scannedCode) {
              scannedCode = text;
              stopped = true;
              // Stop scanner first, then notify parent
              scanner.stop()
                .catch(() => { /* Scanner already stopping, safe to ignore */ })
                .finally(() => {
                  setTimeout(() => onScan(scannedCode), 100);
                });
            }
          },
          () => {}
        );
        setScannerReady(true);

        // Check if flash/torch is supported
        try {
          const capabilities = scanner.getRunningTrackCapabilities();
          if (capabilities && capabilities.torch) {
            setFlashSupported(true);
          }
        } catch (e) {
          // Torch not supported
        }
      } catch (err) {
        if (!stopped) {
          onStop(err.message || 'Camera error');
        }
      }
    };

    startCamera();

    return () => {
      stopped = true;
      scannerRef.current = null;
      if (scanner) {
        try {
          scanner.stop().catch(() => { /* Cleanup on unmount, safe to ignore */ });
        } catch { /* Scanner may already be stopped */ }
      }
    };
  }, [onScan, onStop]);

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '250px' }}>
      <div id="qr-reader" style={{ width: '100%', minHeight: '250px' }} />
      {scannerReady && flashSupported && (
        <button
          onClick={toggleFlash}
          className={`flash-toggle-btn ${flashOn ? 'flash-on' : ''}`}
          title={flashOn ? 'Turn off flash' : 'Turn on flash'}
        >
          {flashOn ? SvgIcons.flashOn('#f59e0b') : SvgIcons.flashlight('#64748b')}
        </button>
      )}
    </div>
  );
}

// === BarcodeScanner Component ===
function BarcodeScanner({ onScan, onError }) {
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [scannerKey, setScannerKey] = useState(0);

  const startScanning = () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Camera not supported. Use Chrome or Safari.');
      return;
    }
    setErrorMessage('');
    setScannerKey(k => k + 1);
    setIsScanning(true);
  };

  const handleScan = useCallback((text) => {
    setIsScanning(false);
    // Small delay to ensure scanner cleanup is complete
    setTimeout(() => {
      try {
        onScan(text);
      } catch (err) {
      }
    }, 50);
  }, [onScan]);

  const handleStop = useCallback((err) => {
    setIsScanning(false);
    if (err) {
      setErrorMessage(String(err));
      onError?.(String(err));
    }
  }, [onError]);

  return (
    <div className="scanner-container">
      <div className="scanner-box">
        {isScanning ? (
          <ScannerView key={scannerKey} onScan={handleScan} onStop={handleStop} />
        ) : (
          <div className="scanner-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span>Tap Start to scan</span>
          </div>
        )}
      </div>

      {errorMessage && <div className="scanner-error">{errorMessage}</div>}

      <div style={{ marginTop: '1rem' }}>
        {!isScanning ? (
          <button className="btn btn-primary btn-full btn-large" onClick={startScanning}>
            Start Scanner
          </button>
        ) : (
          <button className="btn btn-secondary btn-full btn-large" onClick={() => handleStop(null)}>
            Stop Scanner
          </button>
        )}
      </div>
    </div>
  );
}

// Quantity Input Component
function QuantityInput({ value, onChange, unit, allowNegative = false }) {
  const increment = () => onChange(value + 1);
  const decrement = () => onChange(allowNegative ? value - 1 : Math.max(0, value - 1));

  return (
    <div className="quantity-input">
      <button className="quantity-btn minus" onClick={decrement}>−</button>
      <input
        type="text"
        inputMode={allowNegative ? "text" : "numeric"}
        pattern={allowNegative ? "-?[0-9]*" : "[0-9]*"}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          // Allow negative sign for subtract mode
          if (allowNegative) {
            if (raw === '-' || raw === '') {
              onChange(raw === '-' ? '-' : 0);
              return;
            }
            const val = parseFloat(raw);
            if (!isNaN(val)) {
              onChange(val);
            }
          } else {
            const val = raw.replace(/[^0-9.]/g, '');
            onChange(Math.max(0, parseFloat(val) || 0));
          }
        }}
      />
      <button className="quantity-btn plus" onClick={increment}>+</button>
    </div>
  );
}

// Custom Dropdown Component
function CustomDropdown({ value, options, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="custom-dropdown" ref={dropdownRef}>
      <button
        className={`custom-dropdown-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span>{selectedOption?.label || value}</span>
        <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div className="custom-dropdown-menu">
          {options.map(opt => (
            <button
              key={opt.value}
              className={`custom-dropdown-item ${opt.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              type="button"
            >
              {opt.value === value && <span className="check-mark">✓</span>}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Category icons mapping
// SVG icon components for categories (clean vector style)
const SvgIcons = {
  box: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  leaf: (color = '#16a34a') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>,
  milk: (color = '#2563eb') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2h8l2 4v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6l2-4z"/><path d="M6 6h12"/></svg>,
  meat: (color = '#dc2626') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 2.5c2.5 0 5 2 5 5s-3 4-3 7-1 5-4 5-4-2-4-5 1-4-1-7c-1.5-2.5 1-5 3.5-5z"/><circle cx="14" cy="10" r="1"/></svg>,
  fish: (color = '#0891b2') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 12c3-6 10-6 14-2-4 4-11 4-14-2z"/><path d="M6.5 12c-3-6-3.5-3-5 0 1.5 3 2 6 5 0z"/><circle cx="16" cy="10" r="0.5" fill={color}/></svg>,
  can: (color = '#d97706') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M6 8h12"/><path d="M6 16h12"/></svg>,
  cup: (color = '#7c3aed') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>,
  snowflake: (color = '#0284c7') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/><line x1="19.07" y1="4.93" x2="4.93" y2="19.07"/></svg>,
  broom: (color = '#78716c') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v8"/><path d="M4.93 10.93l2.83 2.83"/><path d="M19.07 10.93l-2.83 2.83"/><path d="M8 21h8"/><path d="M12 10c-4 0-7 3-7 7h14c0-4-3-7-7-7z"/></svg>,
  cart: (color = '#16a34a') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  edit: (color = '#d97706') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  truck: (color = '#2563eb') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  warning: (color = '#dc2626') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  search: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  grid: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  clipboard: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
  knife: (color = '#ef4444') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l10-10"/><path d="M13 11V3l8 8h-8z"/></svg>,
  calendar: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  bacteria: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="M4.93 4.93l2.12 2.12"/><path d="M16.95 16.95l2.12 2.12"/><path d="M4.93 19.07l2.12-2.12"/><path d="M16.95 7.05l2.12-2.12"/></svg>,
  heartCrack: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/><path d="M12 5.67L10 12l4 1-2 6"/></svg>,
  cooking: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4"/><path d="M8 4v2"/><path d="M16 4v2"/><rect x="4" y="8" width="16" height="4" rx="1"/><path d="M6 12v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6"/></svg>,
  droplet: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>,
  thumbsDown: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>,
  note: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  bell: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  bellOff: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  check: (color = '#16a34a') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  camera: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  flashlight: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M8.5 8.5l-4.5 1 3-3z"/><path d="M15.5 15.5l1-4.5-3 3z"/><circle cx="12" cy="12" r="1"/></svg>,
  flashOn: (color = '#f59e0b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  trash: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  user: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  building: (color = '#64748b') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><line x1="8" y1="6" x2="8" y2="6.01"/><line x1="12" y1="6" x2="12" y2="6.01"/><line x1="16" y1="6" x2="16" y2="6.01"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/></svg>,
};

const CATEGORY_ICON_MAP = {
  'Uncategorized': 'box',
  'Produce': 'leaf',
  'Dairy': 'milk',
  'Meat': 'meat',
  'Seafood': 'fish',
  'Dry Goods': 'can',
  'Beverages': 'cup',
  'Frozen': 'snowflake',
  'Supplies': 'broom',
};

const CATEGORY_COLORS = {
  'Uncategorized': '#64748b',
  'Produce': '#16a34a',
  'Dairy': '#2563eb',
  'Meat': '#dc2626',
  'Seafood': '#0891b2',
  'Dry Goods': '#d97706',
  'Beverages': '#7c3aed',
  'Frozen': '#0284c7',
  'Supplies': '#78716c',
};

const CATEGORY_ICONS = CATEGORY_ICON_MAP;

// Default categories
const DEFAULT_CATEGORIES = [
  'Uncategorized', 'Produce', 'Dairy', 'Meat', 'Seafood',
  'Dry Goods', 'Beverages', 'Frozen', 'Supplies'
];

// Smart default thresholds by category
const CATEGORY_THRESHOLDS = {
  'Uncategorized': 5,
  'Produce': 10,
  'Dairy': 8,
  'Meat': 5,
  'Seafood': 5,
  'Dry Goods': 10,
  'Beverages': 12,
  'Frozen': 8,
  'Supplies': 15,
};

const getDefaultThreshold = (category) => CATEGORY_THRESHOLDS[category] || 5;

// Get stock status with severity
const getStockStatus = (current, min) => {
  if (min === 0) return 'good';
  if (current <= min) return 'low';
  if (current <= min * 1.5) return 'medium';
  return 'good';
};

// Get severity percentage (how critical is the stock level)
const getStockSeverity = (current, min) => {
  if (min === 0) return 0;
  if (current >= min) return 0;
  return Math.round(((min - current) / min) * 100);
};

// Get stock percentage remaining
const getStockPercentage = (current, min) => {
  if (min === 0) return 100;
  return Math.round((current / min) * 100);
};

const getCategoryIcon = (category) => getCategorySvgIcon(category);

// Returns SVG icon inside a colored circle div
const getCategorySvgIcon = (category) => {
  const iconKey = CATEGORY_ICON_MAP[category] || 'box';
  const color = CATEGORY_COLORS[category] || '#64748b';
  const iconFn = SvgIcons[iconKey] || SvgIcons.box;
  return (
    <div style={{
      width: 48, height: 48, borderRadius: 12,
      background: color + '18',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {iconFn(color)}
    </div>
  );
};

// Relative time helper
const getTimeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

// Item Form Modal
function ItemModal({ item, barcode, lookupData, onSave, onClose, onDelete, categories, onAddCategory }) {
  // Use lookupData to pre-fill form for new items
  const [formData, setFormData] = useState({
    name: item?.name || lookupData?.name || '',
    category: item?.category || 'Uncategorized',
    unit_type: item?.unit_type || 'units',
    current_quantity: item?.current_quantity || 0,
    min_quantity: item?.min_quantity || 0,
    barcode: item?.barcode || barcode || '',
    cost_per_unit: item?.cost_per_unit || 0,
    par_level: item?.par_level || 0,
    storage_location: item?.storage_location || 'dry_storage',
    supplier_id: item?.supplier_id || '',
  });
  const [saving, setSaving] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [isLookedUp, setIsLookedUp] = useState(!!lookupData?.name);
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    api.getSuppliers().then(setSuppliers).catch(() => {});
  }, []);

  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...categories])].sort();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSaving(true);
    try {
      await onSave({
        ...formData,
        id: item?.id,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = () => {
    if (newCategory.trim()) {
      onAddCategory(newCategory.trim());
      setFormData({ ...formData, category: newCategory.trim() });
      setNewCategory('');
      setShowNewCategory(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h2>{item ? 'Edit Item' : 'New Item'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Barcode {item ? '' : '(optional)'}</label>
            <input
              type="text"
              value={formData.barcode}
              onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
              placeholder="Auto-generated if empty"
              disabled={!!item}
            />
          </div>

          <div className="form-group">
            <label>Item Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Tomato Sauce"
              autoFocus
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Category</label>
              {!showNewCategory ? (
                <div>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setShowNewCategory(true);
                      } else {
                        setFormData({ ...formData, category: e.target.value });
                      }
                    }}
                  >
                    {allCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__new__">+ Add New Category</option>
                  </select>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="New category name"
                    autoFocus
                  />
                  <button type="button" className="btn btn-success" style={{ padding: '0.5rem 1rem', minHeight: 'auto' }} onClick={handleAddCategory}>Add</button>
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.5rem 1rem', minHeight: 'auto' }} onClick={() => setShowNewCategory(false)}>Cancel</button>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Unit Type</label>
              <select
                value={formData.unit_type}
                onChange={(e) => setFormData({ ...formData, unit_type: e.target.value })}
              >
                <option value="units">Units</option>
                <option value="lbs">Pounds (lbs)</option>
                <option value="oz">Ounces (oz)</option>
                <option value="kg">Kilograms (kg)</option>
                <option value="g">Grams (g)</option>
                <option value="L">Liters (L)</option>
                <option value="mL">Milliliters (mL)</option>
                <option value="gal">Gallons (gal)</option>
                <option value="cases">Cases</option>
                <option value="boxes">Boxes</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Current Quantity</label>
            <QuantityInput
              value={formData.current_quantity}
              onChange={(val) => setFormData({ ...formData, current_quantity: val })}
              unit={formData.unit_type}
            />
          </div>

          <div className="form-group">
            <label>Low Stock Alert At:</label>
            <div className="threshold-input-group">
              <input
                type="number"
                value={formData.min_quantity}
                onChange={(e) => setFormData({ ...formData, min_quantity: parseFloat(e.target.value) || 0 })}
                min="0"
                step="1"
                placeholder="0"
              />
              <span className="threshold-unit">{formData.unit_type}</span>
            </div>
            {formData.min_quantity > 0 && (
              <div className="threshold-preview">
                Alert when stock falls below {formData.min_quantity} {formData.unit_type}
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Par Level</label>
              <div className="threshold-input-group">
                <input
                  type="number"
                  value={formData.par_level}
                  onChange={(e) => setFormData({ ...formData, par_level: parseFloat(e.target.value) || 0 })}
                  min="0"
                  step="1"
                  placeholder="0"
                />
                <span className="threshold-unit">{formData.unit_type}</span>
              </div>
            </div>
            <div className="form-group">
              <label>Cost per Unit ($)</label>
              <input
                type="number"
                value={formData.cost_per_unit}
                onChange={(e) => setFormData({ ...formData, cost_per_unit: parseFloat(e.target.value) || 0 })}
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Storage Location</label>
              <select
                value={formData.storage_location}
                onChange={(e) => setFormData({ ...formData, storage_location: e.target.value })}
              >
                <option value="walk_in">Walk-in Cooler</option>
                <option value="freezer">Freezer</option>
                <option value="dry_storage">Dry Storage</option>
                <option value="bar">Bar</option>
                <option value="prep_area">Prep Area</option>
              </select>
            </div>
            <div className="form-group">
              <label>Supplier</label>
              <select
                value={formData.supplier_id}
                onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value ? parseInt(e.target.value) : null })}
              >
                <option value="">None</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="action-row">
            {item && onDelete && (
              <button type="button" className="btn btn-danger" onClick={() => onDelete(item.id)}>
                Delete
              </button>
            )}
            <button type="submit" className="btn btn-success" disabled={saving || !formData.name.trim()}>
              {saving ? 'Saving...' : item ? 'Update' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Quick Threshold Edit Modal
function ThresholdEditModal({ item, onSave, onClose, allItems, onBulkSave, onBack }) {
  const [threshold, setThreshold] = useState(item?.min_quantity || 5);
  const [saving, setSaving] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState([item?.id]);

  const similarItems = allItems?.filter(i =>
    i.category === item?.category && i.id !== item?.id
  ) || [];

  const handleSave = async () => {
    setSaving(true);
    try {
      if (bulkMode && selectedItems.length > 1) {
        await onBulkSave(selectedItems, threshold);
      } else {
        await onSave(item.id, threshold);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (id) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllSimilar = () => {
    setSelectedItems([item.id, ...similarItems.map(i => i.id)]);
  };

  const currentStatus = getStockStatus(item?.current_quantity || 0, item?.min_quantity || 0);
  const newStatus = getStockStatus(item?.current_quantity || 0, threshold);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          {onBack && (
            <button className="modal-back" onClick={onBack}>
              ← Back
            </button>
          )}
          <h2>Set Alert Threshold</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="item-header-card">
          <div className="item-icon">{getCategorySvgIcon(item?.category)}</div>
          <div className="item-details">
            <div className="item-title">{item?.name}</div>
            <div className="item-subtitle">Current stock: {item?.current_quantity} {item?.unit_type}</div>
          </div>
        </div>

        <div className="form-group">
          <label>Alert when stock falls below:</label>
          <div className="threshold-slider-group">
            <input
              type="range"
              min="0"
              max="50"
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value))}
              className="threshold-slider"
            />
            <div className="threshold-value-display">
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                min="0"
              />
              <span>{item?.unit_type}</span>
            </div>
          </div>
        </div>

        {/* Status Preview */}
        <div className={`threshold-status-preview ${newStatus}`}>
          <div className="preview-header">
            {threshold === 0 ? (
              <>
                <span className="preview-icon">{SvgIcons.bellOff('#94a3b8')}</span>
                <span>Alerts disabled for this item</span>
              </>
            ) : item?.current_quantity <= threshold ? (
              <>
                <span className="preview-icon">{SvgIcons.warning('#dc2626')}</span>
                <span>Will show alert immediately</span>
              </>
            ) : (
              <>
                <span className="preview-icon">{SvgIcons.check('#16a34a')}</span>
                <span>Alert when below {threshold} {item?.unit_type}</span>
              </>
            )}
          </div>
          {threshold > 0 && (
            <div className="preview-detail">
              Current: {item?.current_quantity} / {threshold} ({getStockPercentage(item?.current_quantity, threshold)}%)
            </div>
          )}
        </div>

        {/* Bulk Edit Option */}
        {similarItems.length > 0 && (
          <div className="bulk-edit-section">
            <div className="bulk-toggle" onClick={() => setBulkMode(!bulkMode)}>
              <input type="checkbox" checked={bulkMode} readOnly />
              <span>Apply to similar items in {item?.category}</span>
            </div>

            {bulkMode && (
              <div className="bulk-items">
                <button className="select-all-btn" onClick={selectAllSimilar}>
                  Select all ({similarItems.length + 1})
                </button>
                <div className="bulk-item-list">
                  <label className="bulk-item selected">
                    <input type="checkbox" checked disabled />
                    <span>{item?.name} (current)</span>
                  </label>
                  {similarItems.map(i => (
                    <label key={i.id} className={`bulk-item ${selectedItems.includes(i.id) ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(i.id)}
                        onChange={() => toggleItem(i.id)}
                      />
                      <span>{i.name}</span>
                      <span className="bulk-item-current">{i.current_quantity}/{i.min_quantity}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="action-row">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-success" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : bulkMode && selectedItems.length > 1
              ? `Update ${selectedItems.length} Items`
              : 'Save Threshold'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Usage Analytics Component
function UsageAnalytics({ item, onClose }) {
  const [usageData, setUsageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    const fetchUsage = async () => {
      setLoading(true);
      try {
        const data = await api.getItemUsage(item.id, days);
        setUsageData(data);
      } catch (err) {
      } finally {
        setLoading(false);
      }
    };
    fetchUsage();
  }, [item.id, days]);

  if (loading) {
    return (
      <div className="usage-analytics">
        <div className="loading-spinner">Loading usage data...</div>
      </div>
    );
  }

  const analytics = usageData?.analytics;
  const history = usageData?.history || [];

  // Group history by day for display
  const dailyUsage = history.reduce((acc, entry) => {
    const date = new Date(entry.recorded_at).toLocaleDateString();
    acc[date] = (acc[date] || 0) + entry.quantity_used;
    return acc;
  }, {});

  const dailyEntries = Object.entries(dailyUsage)
    .sort((a, b) => new Date(b[0]) - new Date(a[0]))
    .slice(0, 7);

  // Calculate projections
  const avgPerDay = analytics?.averagePerDay || 0;
  const daysRemaining = analytics?.daysRemaining;
  const projectedRunOut = daysRemaining !== null
    ? new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000)
    : null;

  return (
    <div className="usage-analytics">
      <div className="analytics-header">
        <h3>Usage Analytics</h3>
        <select value={days} onChange={(e) => setDays(parseInt(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>

      {analytics?.daysWithUsage === 0 ? (
        <div className="no-usage-data">
          <p>No usage data recorded yet</p>
          <p className="hint">Usage is tracked automatically when you decrease stock quantities</p>
        </div>
      ) : (
        <>
          <div className="analytics-stats">
            <div className="analytics-stat">
              <div className="stat-value">{avgPerDay}</div>
              <div className="stat-label">{item.unit_type}/day avg</div>
            </div>
            <div className="analytics-stat">
              <div className="stat-value">{analytics?.totalUsed || 0}</div>
              <div className="stat-label">used in {days}d</div>
            </div>
            <div className={`analytics-stat ${daysRemaining !== null && daysRemaining <= 3 ? 'urgent' : ''}`}>
              <div className="stat-value">
                {daysRemaining !== null ? daysRemaining : '—'}
              </div>
              <div className="stat-label">days left</div>
            </div>
          </div>

          {projectedRunOut && daysRemaining !== null && (
            <div className={`projection-card ${daysRemaining <= 3 ? 'critical' : daysRemaining <= 7 ? 'warning' : 'safe'}`}>
              <div className="projection-label">Projected to run out:</div>
              <div className="projection-date">
                {daysRemaining === 0 ? 'Today' :
                 daysRemaining === 1 ? 'Tomorrow' :
                 projectedRunOut.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
              {avgPerDay > 0 && (
                <div className="projection-hint">
                  Order {Math.ceil(avgPerDay * 7)} {item.unit_type} for 1 week supply
                </div>
              )}
            </div>
          )}

          {dailyEntries.length > 0 && (
            <div className="usage-history">
              <h4>Recent Usage</h4>
              <div className="usage-bars">
                {dailyEntries.map(([date, amount]) => {
                  const maxAmount = Math.max(...dailyEntries.map(e => e[1]));
                  const percentage = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
                  return (
                    <div key={date} className="usage-bar-row">
                      <span className="usage-date">{new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      <div className="usage-bar-container">
                        <div className="usage-bar" style={{ width: `${percentage}%` }} />
                      </div>
                      <span className="usage-amount">{amount}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Waste reasons
const WASTE_REASONS = [
  { value: 'expired', label: 'Expired', iconKey: 'calendar', iconColor: '#d97706' },
  { value: 'spoiled', label: 'Spoiled', iconKey: 'bacteria', iconColor: '#16a34a' },
  { value: 'damaged', label: 'Damaged', iconKey: 'heartCrack', iconColor: '#dc2626' },
  { value: 'overprepped', label: 'Over-prepared', iconKey: 'cooking', iconColor: '#f59e0b' },
  { value: 'dropped', label: 'Dropped/Spilled', iconKey: 'droplet', iconColor: '#3b82f6' },
  { value: 'quality', label: 'Quality Issue', iconKey: 'thumbsDown', iconColor: '#64748b' },
  { value: 'other', label: 'Other', iconKey: 'note', iconColor: '#64748b' },
];

// Log Waste Modal
function LogWasteModal({ item, onSave, onClose }) {
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [costPerUnit, setCostPerUnit] = useState('');
  const [saving, setSaving] = useState(false);

  const estimatedCost = costPerUnit ? (parseFloat(costPerUnit) * quantity).toFixed(2) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason || quantity <= 0) return;

    setSaving(true);
    try {
      await onSave(item.id, quantity, reason, notes || null, estimatedCost ? parseFloat(estimatedCost) : null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h2>Log Waste</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="item-header-card">
          <div className="item-icon">{getCategorySvgIcon(item.category)}</div>
          <div className="item-details">
            <div className="item-title">{item.name}</div>
            <div className="item-subtitle">Current stock: {item.current_quantity} {item.unit_type}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Quantity Wasted *</label>
            <QuantityInput
              value={quantity}
              onChange={setQuantity}
              unit={item.unit_type}
            />
            {quantity > item.current_quantity && (
              <div className="form-warning">Quantity exceeds current stock</div>
            )}
          </div>

          <div className="form-group">
            <label>Reason for Waste *</label>
            <div className="waste-reason-grid">
              {WASTE_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={`waste-reason-btn ${reason === r.value ? 'selected' : ''}`}
                  onClick={() => setReason(r.value)}
                >
                  <span className="reason-icon">{SvgIcons[r.iconKey]?.(r.iconColor)}</span>
                  <span className="reason-label">{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Cost per {item.unit_type} (optional)</label>
            <div className="cost-input-group">
              <span className="cost-prefix">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costPerUnit}
                onChange={(e) => setCostPerUnit(e.target.value)}
                placeholder="0.00"
              />
            </div>
            {estimatedCost && (
              <div className="cost-estimate">
                Estimated loss: <strong>${estimatedCost}</strong>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any details about the waste..."
              rows={2}
            />
          </div>

          <div className="action-row">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={saving || !reason || quantity <= 0}
            >
              {saving ? 'Recording...' : 'Log Waste'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Waste Report Component
function WasteReport({ onItemClick }) {
  const [analytics, setAnalytics] = useState(null);
  const [wasteRecords, setWasteRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [analyticsData, records] = await Promise.all([
          api.getWasteAnalytics(days),
          api.getAllWaste(days)
        ]);
        setAnalytics(analyticsData);
        setWasteRecords(records);
      } catch (err) {
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [days]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  const reasonLabel = (reason) => WASTE_REASONS.find(r => r.value === reason)?.label || reason;
  const reasonIcon = (reason) => {
    const r = WASTE_REASONS.find(r => r.value === reason);
    return r ? SvgIcons[r.iconKey]?.(r.iconColor) : SvgIcons.note('#64748b');
  };

  return (
    <div className="waste-report">
      <div className="report-header">
        <h2>Waste Report</h2>
        <select value={days} onChange={(e) => setDays(parseInt(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {analytics && (
        <>
          {/* Summary Cards */}
          <div className="waste-summary-cards">
            <div className="waste-summary-card">
              <div className="summary-value">{analytics.summary.total_records || 0}</div>
              <div className="summary-label">Waste Events</div>
            </div>
            <div className="waste-summary-card">
              <div className="summary-value">{Math.round(analytics.summary.total_quantity || 0)}</div>
              <div className="summary-label">Units Wasted</div>
            </div>
            <div className="waste-summary-card highlight">
              <div className="summary-value">${(analytics.summary.total_cost || 0).toFixed(2)}</div>
              <div className="summary-label">Est. Cost</div>
            </div>
          </div>

          {/* By Reason Breakdown */}
          {analytics.byReason.length > 0 && (
            <div className="waste-section">
              <h3>By Reason</h3>
              <div className="reason-breakdown">
                {analytics.byReason.map((r) => {
                  const maxQty = Math.max(...analytics.byReason.map(x => x.total_quantity));
                  const pct = maxQty > 0 ? (r.total_quantity / maxQty) * 100 : 0;
                  return (
                    <div key={r.reason} className="reason-row">
                      <div className="reason-info">
                        <span className="reason-icon">{reasonIcon(r.reason)}</span>
                        <span className="reason-name">{reasonLabel(r.reason)}</span>
                      </div>
                      <div className="reason-bar-container">
                        <div className="reason-bar" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="reason-stats">
                        <span className="reason-qty">{Math.round(r.total_quantity)}</span>
                        {r.total_cost > 0 && <span className="reason-cost">${r.total_cost.toFixed(2)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Wasted Items */}
          {analytics.topItems.length > 0 && (
            <div className="waste-section">
              <h3>Most Wasted Items</h3>
              <div className="top-wasted-list">
                {analytics.topItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="top-wasted-item"
                    onClick={() => onItemClick?.({ id: item.id, name: item.name, category: item.category })}
                  >
                    <span className="rank">#{idx + 1}</span>
                    <div className="item-info">
                      <div className="item-name">{item.name}</div>
                      <div className="item-category">{item.category}</div>
                    </div>
                    <div className="waste-stats">
                      <span className="waste-qty">{Math.round(item.total_wasted)} {item.unit_type}</span>
                      {item.total_cost > 0 && <span className="waste-cost">${item.total_cost.toFixed(2)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Recent Waste Log */}
      {wasteRecords.length > 0 && (
        <div className="waste-section">
          <h3>Recent Waste Log</h3>
          <div className="waste-log-list">
            {wasteRecords.slice(0, 20).map((record) => (
              <div key={record.id} className="waste-log-item">
                <div className="log-icon">{reasonIcon(record.reason)}</div>
                <div className="log-info">
                  <div className="log-item-name">{record.item_name}</div>
                  <div className="log-details">
                    {record.quantity} {record.unit_type} - {reasonLabel(record.reason)}
                    {record.notes && <span className="log-notes"> - {record.notes}</span>}
                  </div>
                </div>
                <div className="log-meta">
                  <div className="log-date">
                    {new Date(record.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  {record.cost_estimate > 0 && (
                    <div className="log-cost">${record.cost_estimate.toFixed(2)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {wasteRecords.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">{SvgIcons.trash('#94a3b8')}</div>
          <p>No waste recorded yet</p>
          <p>Log waste from item details to start tracking</p>
        </div>
      )}
    </div>
  );
}

// Quick Update Modal (for existing items)
function QuickUpdateModal({ item, onSave, onClose, onEdit, onEditThreshold, onUpdateCategory, onLogWaste, categories = [] }) {
  const [mode, setMode] = useState('add'); // 'add' or 'set'
  const [showUsageAnalytics, setShowUsageAnalytics] = useState(false);
  const [amount, setAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);

  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...categories])].filter(c => c !== 'Uncategorized').sort();

  const numAmount = typeof amount === 'string' ? (parseFloat(amount) || 0) : amount;
  const newTotal = mode === 'add'
    ? Math.max(0, item.current_quantity + numAmount)
    : Math.max(0, numAmount);

  const difference = newTotal - item.current_quantity;
  const isLargeChange = Math.abs(difference) >= 10;
  const stockStatus = getStockStatus(item.current_quantity, item.min_quantity);
  const newStockStatus = getStockStatus(newTotal, item.min_quantity);

  const handleSave = async () => {
    if (isLargeChange && !showConfirm) {
      setShowConfirm(true);
      return;
    }
    setSaving(true);
    try {
      await onSave(item.id, newTotal);
    } finally {
      setSaving(false);
    }
  };

  const quickAdjust = (val) => {
    if (mode === 'add') {
      setAmount(prev => prev + val);
    } else {
      setAmount(prev => Math.max(0, prev + val));
    }
  };

  // Format last updated
  const lastUpdated = item.last_updated
    ? new Date(item.last_updated).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    : 'Never';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h2>Update Stock</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: 'var(--space-4) var(--space-5)' }}>
          {/* Compact item info */}
          <div className="item-header-card">
            <div className="item-icon">{getCategorySvgIcon(item.category)}</div>
            <div className="item-details">
              <div className="item-title">{item.name}</div>
              <div className="item-subtitle">{item.category} • {item.current_quantity} {item.unit_type} in stock</div>
            </div>
          </div>

          {/* Quantity Controls — primary action, right at top */}
          <div className="mode-toggle">
            <button
              className={`mode-btn ${mode === 'add' ? 'active' : ''}`}
              onClick={() => { setMode('add'); setAmount(0); }}
            >
              Add/Remove
            </button>
            <button
              className={`mode-btn ${mode === 'set' ? 'active' : ''}`}
              onClick={() => { setMode('set'); setAmount(item.current_quantity); }}
            >
              Set Quantity
            </button>
          </div>

          <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
            <label>{mode === 'add' ? 'Adjust by:' : 'Set to:'}</label>
            <QuantityInput
              value={amount}
              onChange={setAmount}
              unit={item.unit_type}
              allowNegative={mode === 'add'}
            />
          </div>

          {/* New Total Preview — inline */}
          <div className="stock-summary preview compact" style={{ marginBottom: 'var(--space-3)' }}>
            <div className="stock-row">
              <span>New Total:</span>
              <span className="stock-value">{newTotal} {item.unit_type}</span>
            </div>
            <div className="stock-change">
              {difference > 0 && <span className="change-positive">+{difference}</span>}
              {difference < 0 && <span className="change-negative">{difference}</span>}
              {difference === 0 && <span className="change-neutral">No change</span>}
            </div>
            {newStockStatus === 'low' && newTotal > 0 && (
              <div className="stock-warning">{SvgIcons.warning('#dc2626')} Will be below minimum</div>
            )}
          </div>

          {/* Confirmation for large changes */}
          {showConfirm && (
            <div className="confirm-warning">
              <strong>Large change detected!</strong>
              <p>You're changing stock by {Math.abs(difference)} {item.unit_type}. Confirm?</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="action-row" style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)' }}>
            <button className="btn btn-secondary" onClick={() => onEdit(item)}>
              Edit Details
            </button>
            <button
              className="btn btn-success"
              onClick={handleSave}
              disabled={saving || difference === 0}
            >
              {saving ? 'Saving...' : showConfirm ? 'Confirm Update' : 'Update Stock'}
            </button>
          </div>

          {/* Secondary actions row */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            <button className="btn btn-danger-outline" style={{ flex: 1 }} onClick={() => onLogWaste?.(item)}>
              Log Waste
            </button>
            {item.min_quantity === 0 && (
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => onEditThreshold?.(item)}>
                Set Alert
              </button>
            )}
          </div>

          {/* Uncategorized Warning */}
          {item.category === 'Uncategorized' && (
            <div className="uncategorized-warning">
              <div className="uncategorized-header">
                <span>{SvgIcons.box('#64748b')}</span>
                <span>This item needs a category</span>
              </div>
              {!showCategoryPicker ? (
                <button className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => setShowCategoryPicker(true)}>
                  + Assign Category
                </button>
              ) : (
                <div className="category-picker">
                  {!showNewCategoryInput ? (
                    <>
                      <div className="category-grid">
                        {allCategories.map(cat => (
                          <button
                            key={cat}
                            className="category-option"
                            onClick={() => onUpdateCategory?.(item.id, cat)}
                          >
                            <span className="category-option-icon">{SvgIcons[CATEGORY_ICON_MAP[cat] || 'box']?.(CATEGORY_COLORS[cat] || '#64748b')}</span>
                            <span>{cat}</span>
                          </button>
                        ))}
                      </div>
                      <button className="add-new-category-btn" onClick={() => setShowNewCategoryInput(true)}>
                        + Create New Category
                      </button>
                    </>
                  ) : (
                    <div className="new-category-input">
                      <input
                        type="text"
                        placeholder="New category name..."
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        autoFocus
                      />
                      <div className="new-category-actions">
                        <button className="btn btn-secondary" onClick={() => { setShowNewCategoryInput(false); setNewCategory(''); }}>Cancel</button>
                        <button
                          className="btn btn-success"
                          disabled={!newCategory.trim()}
                          onClick={() => {
                            if (newCategory.trim()) {
                              onUpdateCategory?.(item.id, newCategory.trim());
                            }
                          }}
                        >
                          Create & Assign
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Usage Analytics — at the bottom, expandable */}
          <button
            className="view-analytics-btn"
            onClick={() => setShowUsageAnalytics(!showUsageAnalytics)}
            style={{ marginTop: 'var(--space-3)' }}
          >
            {showUsageAnalytics ? 'Hide Analytics' : 'View Usage Analytics'}
          </button>

          {showUsageAnalytics && (
            <UsageAnalytics item={item} />
          )}
        </div>
      </div>
    </div>
  );
}

// Inventory Item Card Component — Stitch style
function InventoryItemCard({ item, onClick, showThreshold = true }) {
  const status = getStockStatus(item.current_quantity, item.min_quantity);
  const isLow = status === 'low';

  return (
    <div
      className="stitch-item-row"
      onClick={() => onClick(item)}
    >
      {getCategorySvgIcon(item.category)}
      <div className="stitch-item-info">
        <div className="stitch-item-name">
          {item.name}
          {isLow && <span className="low-badge">LOW</span>}
        </div>
        <div className="stitch-item-unit">{item.unit_type}{item.cost_per_unit ? ` ($${item.cost_per_unit.toFixed(2)})` : ''}</div>
      </div>
      <div className="stitch-item-qty">
        <span className={`stitch-qty-value ${isLow ? 'low' : ''}`}>{item.current_quantity}</span>
        <span className={`stitch-qty-label ${isLow ? 'low' : ''}`}>{isLow ? 'RESTOCK NOW' : 'CURRENT'}</span>
      </div>
    </div>
  );
}

// Inventory List Component
function InventoryList({ items, onItemClick, onAddItem, loading, categories, recentScans, stockFilter, onClearFilter }) {
  const [viewMode, setViewMode] = useState('category'); // 'category' or 'all'

  // Filter items by stock status if filter is set
  const filteredByStock = stockFilter
    ? items.filter(item => {
        const status = getStockStatus(item.current_quantity, item.min_quantity);
        return status === stockFilter;
      })
    : items;

  // Get unique categories from filtered items, sorted
  const itemCategories = [...new Set(filteredByStock.map(i => i.category))].sort();

  // Group items by category
  const itemsByCategory = itemCategories.reduce((acc, cat) => {
    acc[cat] = filteredByStock.filter(item => item.category === cat);
    return acc;
  }, {});

  const stockFilterLabels = {
    low: 'Low Stock',
    medium: 'Running Low',
    good: 'Well Stocked'
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  const lowCount = items.filter(i => getStockStatus(i.current_quantity, i.min_quantity) === 'low').length;
  const outCount = items.filter(i => i.current_quantity === 0 && i.min_quantity > 0).length;
  const [searchQuery, setSearchQuery] = useState('');

  // Apply search filter
  const searchFiltered = searchQuery.trim()
    ? filteredByStock.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()) || i.category.toLowerCase().includes(searchQuery.toLowerCase()))
    : filteredByStock;

  // Recalculate categories from search-filtered items
  const displayCategories = [...new Set(searchFiltered.map(i => i.category))].sort();
  const displayByCategory = displayCategories.reduce((acc, cat) => {
    acc[cat] = searchFiltered.filter(item => item.category === cat);
    return acc;
  }, {});

  return (
    <div>
      {/* Search Bar */}
      <div className="stitch-search-bar">
        <svg className="stitch-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input
          type="text"
          className="stitch-search-input"
          placeholder="Search items or categories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button className="stitch-scan-btn" onClick={() => {}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        </button>
      </div>

      {/* Filter Pills */}
      <div className="filter-pills">
        <button className={`filter-pill ${!stockFilter ? 'active' : ''}`} onClick={onClearFilter}>All Items</button>
        <button className={`filter-pill ${stockFilter === 'low' ? 'active' : ''}`} onClick={() => { if (stockFilter === 'low') onClearFilter(); }}>
          Low Stock{lowCount > 0 ? ` (${lowCount})` : ''}
        </button>
        <button className={`filter-pill ${stockFilter === 'out' ? 'active' : ''}`} onClick={() => {}}>Out of Stock</button>
        <button className={`filter-pill ${stockFilter === 'recent' ? 'active' : ''}`} onClick={() => {}}>Recently Used</button>
      </div>

      {/* Category View */}
      {searchFiltered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{stockFilter || searchQuery ? SvgIcons.search('#94a3b8') : SvgIcons.box('#94a3b8')}</div>
          <p>{searchQuery ? 'No items match your search' : stockFilter ? `No ${stockFilterLabels[stockFilter]?.toLowerCase()} items` : 'No inventory items yet'}</p>
          <p style={{ fontSize: '0.875rem' }}>
            {stockFilter ? 'Great job keeping stock levels healthy!' : searchQuery ? 'Try a different search term' : 'Tap the + button to add items'}
          </p>
        </div>
      ) : (
        <div className="category-sections">
          {displayCategories.map((category) => (
            <div key={category} className="category-section">
              <div className="stitch-category-header">
                <span className="stitch-chevron">›</span>
                <span className="stitch-category-name">{category.toUpperCase()}</span>
                <span className="stitch-category-count">{displayByCategory[category].length} ITEMS</span>
              </div>
              <div className="stitch-items-list">
                {displayByCategory[category].map((item) => (
                  <InventoryItemCard key={item.id} item={item} onClick={onItemClick} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FAB */}
      <button className="fab" onClick={onAddItem} title="Add Item">+</button>
    </div>
  );
}

// Dashboard Component
function Dashboard({ items, onItemClick, onNavigate, onNavigateView, onEditThreshold, onAddToRestock, onStartCount, onStartScan, recentCounts, loading, restockCount }) {
  const totalItems = items.length;

  // Time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Get low stock items and sort by urgency (days remaining, then severity)
  const lowStockItems = items
    .filter((i) => i.current_quantity <= i.min_quantity && i.min_quantity > 0)
    .sort((a, b) => {
      const aDays = a.usage?.daysRemaining;
      const bDays = b.usage?.daysRemaining;
      if (aDays !== null && aDays !== undefined && bDays !== null && bDays !== undefined) {
        return aDays - bDays;
      }
      if (aDays !== null && aDays !== undefined) return -1;
      if (bDays !== null && bDays !== undefined) return 1;
      return getStockSeverity(b.current_quantity, b.min_quantity) - getStockSeverity(a.current_quantity, a.min_quantity);
    });

  const mediumStockItems = items.filter((i) => {
    const status = getStockStatus(i.current_quantity, i.min_quantity);
    return status === 'medium';
  });
  const goodStockItems = items.filter((i) => getStockStatus(i.current_quantity, i.min_quantity) === 'good');

  // Calculate total inventory value
  const totalValue = items.reduce((sum, i) => sum + (i.current_quantity * (i.cost_per_unit || 0)), 0);

  // Format currency
  const formatCurrency = (val) => val >= 1000 ? `$${(val / 1000).toFixed(1)}k` : `$${val.toFixed(0)}`;

  // Dynamic status subtitle
  const getStatusLine = () => {
    if (lowStockItems.length > 0) return `${lowStockItems.length} item${lowStockItems.length !== 1 ? 's' : ''} need${lowStockItems.length === 1 ? 's' : ''} attention`;
    if (items.length === 0) return "Let's get your inventory set up";
    return 'Everything looks good';
  };

  // Build activity feed from recent counts
  const getActivityItems = () => {
    if (!recentCounts || recentCounts.length === 0) return [];
    return recentCounts.slice(0, 6).map(c => {
      const variance = c.variance || 0;
      let iconType = 'green';
      let iconKey = 'cart';
      let desc = `Stock updated to ${c.count_value} ${c.unit_type}`;
      if (variance > 0) {
        iconType = 'green';
        iconKey = 'cart';
        desc = `Stock increased by ${variance} units`;
      } else if (variance < 0) {
        iconType = 'amber';
        iconKey = 'edit';
        desc = `Manual adjustment by ${variance} ${c.unit_type}`;
      } else {
        iconType = 'blue';
        iconKey = 'truck';
        desc = `Counted at ${c.count_value} ${c.unit_type}`;
      }
      return { id: c.id, name: c.item_name, desc, iconKey, iconType, time: getTimeAgo(c.counted_at) };
    });
  };

  const activityItems = getActivityItems();

  return (
    <div className="dashboard-grid">
      {/* Main column: value card, alert, CTAs */}
      <div className="dashboard-main">
        {/* Stock Value Card */}
        <div className="stitch-value-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>Total Stock Value</span>
            <span className="stitch-change-badge">↑ +2.4%</span>
          </div>
          <div className="value-amount">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="value-label">Calculated from {totalItems} active items</div>
        </div>

        {/* Low Stock Alert Card */}
        {lowStockItems.length > 0 && (
          <div className="stitch-alert-card" onClick={() => onNavigate?.('low')}>
            <div className="alert-icon-circle">{SvgIcons.warning('#ffffff')}</div>
            <div className="alert-text" style={{ flex: 1 }}>
              <span style={{ fontSize: '12px', color: 'var(--status-critical)', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Low Stock Alerts</span>
              <strong>{lowStockItems.length} Items Low</strong>
              <span>Requires immediate reorder</span>
            </div>
            <span style={{ color: 'var(--status-critical)', fontSize: '18px' }}>›</span>
          </div>
        )}

        {/* Green CTAs */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="stitch-cta" style={{ marginBottom: 0, flex: 1 }} onClick={onStartCount}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Count
          </button>
          <button className="stitch-cta" style={{ marginBottom: 0, flex: 1 }} onClick={onStartScan}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Scan
          </button>
        </div>

        {items.length === 0 && !loading && (
          <div className="empty-state">
            <div className="empty-state-icon">{SvgIcons.box('#94a3b8')}</div>
            <p>Let's get started</p>
            <p>Add items to start tracking your inventory</p>
            <button className="btn btn-primary" onClick={() => onNavigate?.('detect')}>Scan Items</button>
          </div>
        )}
      </div>

      {/* Side column: activity feed, action required */}
      <div className="dashboard-side">
        {/* Recent Activity Feed */}
        {activityItems.length > 0 && (
          <div>
            <div className="stitch-activity-header">
              <h3>Recent Activity</h3>
              <button onClick={() => onNavigate?.('all')}>See All</button>
            </div>
            {activityItems.map(a => (
              <div key={a.id} className="stitch-activity-item">
                <div className={`stitch-activity-icon ${a.iconType}`}>{SvgIcons[a.iconKey]?.()}</div>
                <div className="stitch-activity-info">
                  <div className="name">{a.name}</div>
                  <div className="desc">{a.desc}</div>
                </div>
                <div className="stitch-activity-time">{a.time}</div>
              </div>
            ))}
          </div>
        )}

        {/* Low Stock Items - Action Required */}
        {lowStockItems.length > 0 && (
          <div className="alert-section">
            <div className="section-header critical">
              <span>Action Required</span>
              <span className="section-count">{lowStockItems.length}</span>
            </div>
            <div className="alert-list">
              {lowStockItems.slice(0, 5).map((item) => {
                const percentage = getStockPercentage(item.current_quantity, item.min_quantity);
                const needed = item.min_quantity - item.current_quantity;
                const daysRemaining = item.usage?.daysRemaining;
                const hasUsageData = item.usage?.hasData;

                let severityClass = 'warning';
                if (daysRemaining !== null && daysRemaining !== undefined) {
                  if (daysRemaining <= 1) severityClass = 'critical';
                  else if (daysRemaining <= 3) severityClass = 'warning';
                } else if (percentage <= 25) {
                  severityClass = 'critical';
                }

                let statusMessage;
                if (daysRemaining !== null && daysRemaining !== undefined) {
                  if (daysRemaining === 0) statusMessage = 'Out today';
                  else if (daysRemaining === 1) statusMessage = 'Out tomorrow';
                  else statusMessage = `${daysRemaining} days left`;
                } else if (hasUsageData === false) {
                  statusMessage = `Need ${needed} more`;
                } else {
                  statusMessage = `Need ${needed} more ${item.unit_type}`;
                }

                return (
                  <div key={item.id} className={`alert-card ${severityClass}`}>
                    <div className="alert-card-content" onClick={() => onItemClick?.(item)}>
                      <div className="alert-card-info">
                        <div className="alert-card-name">{item.name}</div>
                        <div className={`alert-card-status ${severityClass}`}>{statusMessage}</div>
                      </div>
                      <div className="alert-card-quantity">
                        <span className="current">{item.current_quantity}</span>
                        <span className="target">/ {item.min_quantity} {item.unit_type}</span>
                      </div>
                    </div>
                    <div className="alert-card-actions">
                      <button className="alert-btn primary" onClick={(e) => { e.stopPropagation(); onAddToRestock?.(item); }}>Add to Order</button>
                      <button className="alert-btn secondary" onClick={(e) => { e.stopPropagation(); onEditThreshold?.(item); }}>Adjust</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Desktop Navigation Cards */}
      <div className="desktop-nav-grid">
        <div className="desktop-nav-card" onClick={() => onNavigateView?.('list')}>
          <div className="desktop-nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          </div>
          <div className="desktop-nav-label">Inventory</div>
          <div className="desktop-nav-stat">{items.length} items</div>
        </div>
        <div className="desktop-nav-card" onClick={onStartCount}>
          <div className="desktop-nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </div>
          <div className="desktop-nav-label">Quick Count</div>
          <div className="desktop-nav-stat">Start a count</div>
        </div>
        <div className="desktop-nav-card" onClick={onStartScan}>
          <div className="desktop-nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </div>
          <div className="desktop-nav-label">AI Scan</div>
          <div className="desktop-nav-stat">Scan items</div>
        </div>
        <div className="desktop-nav-card" onClick={() => onNavigateView?.('restock')}>
          <div className="desktop-nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
          </div>
          <div className="desktop-nav-label">Restock & Orders</div>
          <div className="desktop-nav-stat">{restockCount || 0} pending</div>
        </div>
        <div className="desktop-nav-card" onClick={() => onNavigateView?.('waste')}>
          <div className="desktop-nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </div>
          <div className="desktop-nav-label">Waste Tracker</div>
          <div className="desktop-nav-stat">View reports</div>
        </div>
        <div className="desktop-nav-card" onClick={() => onNavigateView?.('suppliers')}>
          <div className="desktop-nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          </div>
          <div className="desktop-nav-label">Suppliers</div>
          <div className="desktop-nav-stat">Manage vendors</div>
        </div>
      </div>
    </div>
  );
}

// Restock List Component (Shopping List)
function RestockList({ items, onUpdateQuantity, onRemove, onClear, onItemClick, allItems }) {
  const [targetDays, setTargetDays] = useState(7);
  const totalItems = items.length;

  // Calculate smart suggestions for each item
  const getSmartSuggestion = (item) => {
    // Find the live item data with usage info
    const liveItem = allItems?.find(i => i.id === item.id) || item;
    const avgPerDay = liveItem.usage?.averagePerDay || 0;

    if (avgPerDay > 0) {
      // Calculate how much is needed for target days
      const neededForTargetDays = Math.ceil(avgPerDay * targetDays);
      const currentStock = liveItem.current_quantity || 0;
      const suggested = Math.max(0, neededForTargetDays - currentStock);

      return {
        suggested,
        avgPerDay,
        daysSupply: item.orderQuantity > 0
          ? Math.floor((currentStock + item.orderQuantity) / avgPerDay)
          : null,
        hasData: true
      };
    }

    // No usage data - suggest reaching min threshold + buffer
    const needed = Math.max(0, (item.min_quantity || 0) - (item.current_quantity || 0));
    return {
      suggested: Math.ceil(needed * 1.2) || 10,
      avgPerDay: 0,
      daysSupply: null,
      hasData: false
    };
  };

  const applySmartSuggestions = () => {
    items.forEach(item => {
      const suggestion = getSmartSuggestion(item);
      if (suggestion.suggested > 0) {
        onUpdateQuantity(item.id, suggestion.suggested);
      }
    });
  };

  if (totalItems === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">{SvgIcons.clipboard('#94a3b8')}</div>
        <p>Your order list is empty</p>
        <p>Add items from the Action Required section</p>
      </div>
    );
  }

  return (
    <div className="restock-list">
      <div className="restock-header">
        <div className="restock-title">
          <span>Order List</span>
          <span className="restock-count">{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onClear}>
          Clear All
        </button>
      </div>

      {/* Smart Order Controls */}
      <div className="smart-order-controls">
        <div className="target-days-selector">
          <label>Order for:</label>
          <select value={targetDays} onChange={(e) => setTargetDays(parseInt(e.target.value))}>
            <option value={3}>3 days</option>
            <option value={5}>5 days</option>
            <option value={7}>1 week</option>
            <option value={14}>2 weeks</option>
          </select>
        </div>
        <button className="btn btn-primary btn-sm" onClick={applySmartSuggestions}>
          Smart Fill
        </button>
      </div>

      <div className="restock-items">
        {items.map((item) => {
          const suggestion = getSmartSuggestion(item);
          const liveItem = allItems?.find(i => i.id === item.id) || item;

          return (
            <div key={item.id} className="restock-item">
              <div className="restock-item-info" onClick={() => onItemClick?.(liveItem)}>
                <div className="restock-item-details">
                  <div className="restock-item-name">{item.name}</div>
                  <div className="restock-item-meta">
                    <span>Current: {liveItem.current_quantity} {item.unit_type}</span>
                    {suggestion.hasData && (
                      <span className="restock-item-usage">
                        ~{suggestion.avgPerDay}/{item.unit_type} per day
                      </span>
                    )}
                  </div>
                  {suggestion.hasData && suggestion.daysSupply !== null && (
                    <div className={`restock-supply-info ${suggestion.daysSupply < targetDays ? 'warning' : 'good'}`}>
                      Order gives {suggestion.daysSupply} days supply
                    </div>
                  )}
                </div>
              </div>
              <div className="restock-item-controls">
                <div className="restock-quantity">
                  <label>Order:</label>
                  <div className="restock-quantity-input">
                    <button
                      className="qty-btn"
                      onClick={() => onUpdateQuantity(item.id, Math.max(0, item.orderQuantity - 1))}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={item.orderQuantity}
                      onChange={(e) => onUpdateQuantity(item.id, parseInt(e.target.value) || 0)}
                      min="0"
                    />
                    <button
                      className="qty-btn"
                      onClick={() => onUpdateQuantity(item.id, item.orderQuantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  <span className="restock-unit">{item.unit_type}</span>
                </div>
                {suggestion.hasData && item.orderQuantity !== suggestion.suggested && (
                  <button
                    className="smart-suggest-btn"
                    onClick={() => onUpdateQuantity(item.id, suggestion.suggested)}
                    title={`Suggested: ${suggestion.suggested} for ${targetDays} days`}
                  >
                    {suggestion.suggested}
                  </button>
                )}
                <button
                  className="restock-remove-btn"
                  onClick={() => onRemove(item.id)}
                  title="Remove from list"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="restock-summary">
        <div className="summary-row">
          <span>Total items to order:</span>
          <strong>{totalItems}</strong>
        </div>
        <div className="summary-row">
          <span>Total units:</span>
          <strong>{items.reduce((sum, i) => sum + i.orderQuantity, 0)}</strong>
        </div>
      </div>
    </div>
  );
}

// === AuthScreen Component ===
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        if (!name.trim()) {
          setError('Name is required');
          setLoading(false);
          return;
        }
        const data = await api.signup(email, password, name);
        setAuthToken(data.token);
        onAuth(data.user);
      } else {
        const data = await api.login(email, password);
        setAuthToken(data.token);
        onAuth(data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-container">
        <div className="auth-header">
          <h1>Mike's Inventory</h1>
          <p>{mode === 'login' ? 'Sign in to manage your restaurant.' : 'Create an account to get started.'}</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@restaurant.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'Min. 6 characters' : 'Your password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'signup' ? 6 : undefined}
            />
          </div>

          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full btn-large"
            disabled={loading}
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? (
            <p>
              Don't have an account?{' '}
              <button type="button" onClick={() => { setMode('signup'); setError(''); }}>
                Create one
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button type="button" onClick={() => { setMode('login'); setError(''); }}>
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Settings Menu Component
function SettingsMenu({ darkMode, onToggleDarkMode, userName, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="settings-menu" ref={menuRef}>
      <button
        className="settings-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Settings"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {isOpen && (
        <div className="settings-dropdown">
          {userName && (
            <div className="settings-user">
              <span className="user-icon">{SvgIcons.user('#64748b')}</span>
              <span className="user-name">{userName}</span>
            </div>
          )}
          <div className="settings-header">Settings</div>
          <button
            className="settings-option"
            onClick={() => {
              onToggleDarkMode();
              setIsOpen(false);
            }}
          >
            <span className="settings-option-icon">
              {darkMode ? '○' : '●'}
            </span>
            <span className="settings-option-label">
              {darkMode ? 'Light Mode' : 'Dark Mode'}
            </span>
          </button>
          {onLogout && (
            <button
              className="settings-option logout"
              onClick={() => {
                onLogout();
                setIsOpen(false);
              }}
            >
              <span className="settings-option-icon">→</span>
              <span className="settings-option-label">Sign Out</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Keyword-based category fallback when the API doesn't return one
const CATEGORY_KEYWORDS = {
  Beverages: ['cola', 'coke', 'pepsi', 'sprite', 'fanta', 'water', 'juice', 'tea', 'coffee', 'beer', 'wine', 'vodka', 'rum', 'soda', 'drink', 'lemonade', 'energy', 'bottle', 'can'],
  Dairy: ['cheese', 'milk', 'cream', 'butter', 'yogurt', 'mozzarella', 'parmesan', 'cheddar', 'provolone', 'sour cream', 'half and half', 'whipped'],
  Meat: ['chicken', 'beef', 'pork', 'turkey', 'bacon', 'sausage', 'pepperoni', 'salami', 'ham', 'steak', 'ground', 'wing', 'rib'],
  Seafood: ['fish', 'shrimp', 'salmon', 'tuna', 'crab', 'lobster', 'tilapia', 'cod'],
  Produce: ['lettuce', 'tomato', 'onion', 'pepper', 'cucumber', 'carrot', 'celery', 'mushroom', 'avocado', 'lemon', 'lime', 'garlic', 'spinach', 'basil', 'cilantro', 'jalapeño', 'fruit', 'apple', 'banana'],
  'Dry Goods': ['flour', 'sugar', 'rice', 'pasta', 'bread', 'bun', 'tortilla', 'oil', 'vinegar', 'sauce', 'ketchup', 'mustard', 'mayo', 'dressing', 'seasoning', 'spice', 'salt', 'pepper', 'crouton', 'chip'],
  Frozen: ['frozen', 'ice cream', 'fries', 'french fries', 'popsicle', 'ice'],
  Supplies: ['napkin', 'cup', 'plate', 'fork', 'spoon', 'knife', 'straw', 'bag', 'wrap', 'foil', 'glove', 'towel', 'container', 'lid'],
};

function guessCategoryFromName(name) {
  const lower = name.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return category;
  }
  return 'Uncategorized';
}

// === Suppliers View ===
function SuppliersView({ showAlert }) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({ name: '', contact_name: '', phone: '', email: '', notes: '' });

  const loadSuppliers = async () => {
    try {
      const data = await api.getSuppliers();
      setSuppliers(data);
    } catch (err) {
      showAlert('error', 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSuppliers(); }, []);

  const openAdd = () => {
    setEditingSupplier(null);
    setFormData({ name: '', contact_name: '', phone: '', email: '', notes: '' });
    setShowForm(true);
  };

  const openEdit = (s) => {
    setEditingSupplier(s);
    setFormData({ name: s.name, contact_name: s.contact_name || '', phone: s.phone || '', email: s.email || '', notes: s.notes || '' });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    try {
      if (editingSupplier) {
        await api.updateSupplier(editingSupplier.id, formData);
        showAlert('success', 'Supplier updated');
      } else {
        await api.createSupplier(formData);
        showAlert('success', 'Supplier added');
      }
      setShowForm(false);
      await loadSuppliers();
    } catch (err) {
      showAlert('error', err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteSupplier(id);
      showAlert('success', 'Supplier removed');
      await loadSuppliers();
    } catch (err) {
      showAlert('error', 'Failed to delete supplier');
    }
  };

  if (loading) return <div className="qc-loading">Loading suppliers...</div>;

  return (
    <div className="suppliers-view">
      <div className="suppliers-header">
        <h2>Suppliers</h2>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Supplier</button>
      </div>

      {suppliers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{SvgIcons.building('#94a3b8')}</div>
          <p>No suppliers yet</p>
          <p style={{ fontSize: '0.875rem' }}>Add your first supplier to link them to inventory items</p>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Supplier</button>
        </div>
      ) : (
        <div className="suppliers-list">
          {suppliers.map(s => (
            <div key={s.id} className="supplier-card" onClick={() => openEdit(s)}>
              <div className="supplier-info">
                <div className="supplier-name">{s.name}</div>
                {s.contact_name && <div className="supplier-contact">{s.contact_name}</div>}
                <div className="supplier-meta">
                  {s.phone && <span>{s.phone}</span>}
                  {s.email && <span>{s.email}</span>}
                </div>
                {s.notes && <div className="supplier-notes">{s.notes}</div>}
              </div>
              <button className="supplier-delete-btn" onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2>{editingSupplier ? 'Edit Supplier' : 'New Supplier'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="form-group">
              <label>Name *</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Sysco" autoFocus />
            </div>
            <div className="form-group">
              <label>Contact Name</label>
              <input type="text" value={formData.contact_name} onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })} placeholder="Primary contact" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="555-123-4567" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@supplier.com" />
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input type="text" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Delivery schedule, special instructions..." />
            </div>
            <div className="action-row">
              <button className="btn btn-success" onClick={handleSave} disabled={!formData.name.trim()}>
                {editingSupplier ? 'Update' : 'Add Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// === Storage Location Config ===
const DEFAULT_STORAGE_LOCATIONS = [
  { id: 'walk_in', label: 'Walk-in Cooler', iconKey: 'snowflake', color: '#16a34a' },
  { id: 'freezer', label: 'Freezer', iconKey: 'snowflake', color: '#2563eb' },
  { id: 'dry_storage', label: 'Dry Storage', iconKey: 'can', color: '#d97706' },
  { id: 'bar', label: 'Main Bar', iconKey: 'cup', color: '#16a34a' },
  { id: 'prep_area', label: 'Prep Area', iconKey: 'knife', color: '#ef4444' },
];

const AVAILABLE_ICON_KEYS = ['snowflake', 'can', 'cup', 'knife', 'leaf', 'box', 'meat', 'fish', 'milk', 'broom', 'grid', 'cart', 'truck', 'clipboard'];
const AVAILABLE_COLORS = ['#16a34a', '#2563eb', '#d97706', '#dc2626', '#0891b2', '#7c3aed', '#64748b'];

function loadStorageLocations() {
  try {
    const saved = localStorage.getItem('customStorageLocations');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) { /* ignore */ }
  return DEFAULT_STORAGE_LOCATIONS;
}

// === QuickCountView Component ===
function QuickCountView({ items, onCountsSubmitted, showAlert }) {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationItems, setLocationItems] = useState([]);
  const [countValues, setCountValues] = useState({});
  const [countNotes, setCountNotes] = useState({});
  const [expandedNotes, setExpandedNotes] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [locations, setLocations] = useState(loadStorageLocations);
  const [isEditing, setIsEditing] = useState(false);
  const [editingLocId, setEditingLocId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editIconKey, setEditIconKey] = useState('box');
  const [editColor, setEditColor] = useState('#64748b');
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ index: null, overIndex: null, el: null, clone: null, startX: 0, startY: 0, active: false, wasTap: true });

  const saveLocations = (locs) => {
    setLocations(locs);
    localStorage.setItem('customStorageLocations', JSON.stringify(locs));
  };

  const openEditor = (loc) => {
    setEditingLocId(loc.id);
    setEditName(loc.label);
    setEditIconKey(loc.iconKey);
    setEditColor(loc.color);
  };

  const handleSaveEditor = () => {
    if (!editName.trim()) return;
    saveLocations(locations.map(l => l.id === editingLocId ? { ...l, label: editName.trim(), iconKey: editIconKey, color: editColor } : l));
    setEditingLocId(null);
  };

  const handleAddLocation = () => {
    const newLoc = { id: 'loc_' + Date.now(), label: 'New Location', iconKey: 'box', color: '#64748b' };
    const updated = [...locations, newLoc];
    saveLocations(updated);
    openEditor(newLoc);
  };

  const handleDeleteLocation = (loc) => {
    if (locations.length <= 1) { showAlert('error', 'Must have at least 1 location'); return; }
    if (!window.confirm(`Delete "${loc.label}"?`)) return;
    const updated = locations.filter(l => l.id !== loc.id);
    saveLocations(updated);
    if (editingLocId === loc.id) setEditingLocId(null);
  };

  // Smooth touch drag reorder — activates immediately on move in edit mode
  const handleTouchStart = (e, index) => {
    const touch = e.touches[0];
    const el = e.currentTarget.closest('.qc-loc-wrapper');
    dragRef.current = { index, overIndex: null, el, clone: null, startX: touch.clientX, startY: touch.clientY, active: false, wasTap: true };
  };

  const activateDrag = (touch) => {
    const d = dragRef.current;
    d.active = true;
    d.wasTap = false;
    setIsDragging(true);
    const el = d.el;
    if (!el) return;
    el.classList.add('qc-dragging');
    const rect = el.getBoundingClientRect();
    const clone = el.cloneNode(true);
    clone.className = 'qc-drag-clone';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    document.body.appendChild(clone);
    d.clone = clone;
    d.offsetX = touch.clientX - rect.left;
    d.offsetY = touch.clientY - rect.top;
  };

  const handleTouchMove = useCallback((e) => {
    const d = dragRef.current;
    if (d.index === null) return;
    const touch = e.touches[0];

    if (!d.active) {
      const dx = Math.abs(touch.clientX - d.startX);
      const dy = Math.abs(touch.clientY - d.startY);
      if (dx > 8 || dy > 8) {
        activateDrag(touch);
      } else {
        return;
      }
    }

    e.preventDefault();
    const clone = d.clone;
    if (clone) {
      clone.style.transform = `translate3d(${touch.clientX - d.offsetX}px, ${touch.clientY - d.offsetY}px, 0)`;
    }

    // Hit-test other wrappers directly (no React state updates during drag)
    const els = document.querySelectorAll('.qc-loc-wrapper');
    let newOver = null;
    els.forEach(el => {
      if (el === d.el) { el.classList.remove('qc-drag-over'); return; }
      const rect = el.getBoundingClientRect();
      if (touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        newOver = parseInt(el.dataset.index);
        el.classList.add('qc-drag-over');
      } else {
        el.classList.remove('qc-drag-over');
      }
    });
    d.overIndex = newOver;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const d = dragRef.current;
    if (d.active && d.index !== null && d.overIndex !== null && d.index !== d.overIndex) {
      setLocations(prev => {
        const updated = [...prev];
        const [moved] = updated.splice(d.index, 1);
        updated.splice(d.overIndex, 0, moved);
        localStorage.setItem('customStorageLocations', JSON.stringify(updated));
        return updated;
      });
    }
    if (d.el) d.el.classList.remove('qc-dragging');
    if (d.clone) d.clone.remove();
    document.querySelectorAll('.qc-loc-wrapper.qc-drag-over').forEach(el => el.classList.remove('qc-drag-over'));
    const wasTap = d.wasTap;
    const tapIndex = d.index;
    dragRef.current = { index: null, overIndex: null, el: null, clone: null, startX: 0, startY: 0, active: false, wasTap: true };
    setIsDragging(false);
    // If it was a tap (no movement), open editor
    if (wasTap && tapIndex !== null && isEditing) {
      openEditor(locations[tapIndex]);
    }
  }, [locations, isEditing]);

  // Load items when location is selected
  useEffect(() => {
    if (!selectedLocation) {
      setLocationItems([]);
      setCountValues({});
      setCountNotes({});
      setExpandedNotes({});
      setSubmitResult(null);
      return;
    }

    const loadLocationItems = async () => {
      setIsLoading(true);
      try {
        const data = await api.getItemsByLocation(selectedLocation);
        setLocationItems(data);
        // Pre-fill count values with empty (not the current quantity — user needs to count fresh)
        const vals = {};
        data.forEach(item => { vals[item.id] = ''; });
        setCountValues(vals);
      } catch (err) {
        showAlert('error', 'Failed to load items for this location');
      } finally {
        setIsLoading(false);
      }
    };
    loadLocationItems();
  }, [selectedLocation]);

  const countedCount = Object.values(countValues).filter(v => v !== '' && v !== null && v !== undefined).length;
  const totalCount = locationItems.length;

  const handleCountChange = (itemId, value) => {
    setCountValues(prev => ({ ...prev, [itemId]: value }));
  };

  const handleAdjust = (itemId, delta) => {
    setCountValues(prev => {
      const current = prev[itemId] === '' ? 0 : parseFloat(prev[itemId]) || 0;
      const newVal = Math.max(0, current + delta);
      return { ...prev, [itemId]: newVal };
    });
  };

  const handleSubmit = async () => {
    const counts = [];
    for (const item of locationItems) {
      const val = countValues[item.id];
      if (val !== '' && val !== null && val !== undefined) {
        counts.push({
          item_id: item.id,
          count_value: parseFloat(val) || 0,
          notes: countNotes[item.id] || null,
        });
      }
    }

    if (counts.length === 0) {
      showAlert('error', 'No items have been counted yet');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await api.recordBulkCounts(counts, selectedLocation);
      setSubmitResult({
        count: result.counts.length,
        variances: result.counts.map(c => ({
          ...c,
          itemName: locationItems.find(i => i.id === c.item_id)?.name || 'Unknown',
        })),
      });
      if (onCountsSubmitted) onCountsSubmitted();
      showAlert('success', `${result.counts.length} counts recorded successfully`);
    } catch (err) {
      showAlert('error', 'Failed to submit counts: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = () => {
    setSelectedLocation(null);
    setSubmitResult(null);
  };

  // --- Submit result screen ---
  if (submitResult) {
    const withVariance = submitResult.variances.filter(v => v.variance && v.variance !== 0);
    return (
      <div className="quick-count">
        <div className="qc-success">
          <div className="qc-success-icon">✓</div>
          <h2>{submitResult.count} Counts Recorded</h2>
          <p className="qc-success-location">
            {(() => { const loc = locations.find(l => l.id === selectedLocation); return loc ? SvgIcons[loc.iconKey]?.(loc.color) : null; })()}{' '}
            {locations.find(l => l.id === selectedLocation)?.label}
          </p>

          {withVariance.length > 0 && (
            <div className="qc-variance-summary">
              <h3>Variance Summary</h3>
              {withVariance.map(v => (
                <div key={v.id} className={`qc-variance-row ${v.variance > 0 ? 'positive' : 'negative'}`}>
                  <span className="qc-variance-name">{v.itemName}</span>
                  <span className="qc-variance-value">
                    {v.variance > 0 ? '+' : ''}{v.variance}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="qc-success-actions">
            <button className="btn btn-success qc-btn-large" onClick={handleContinue}>
              Count Another Location
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Location selection screen ---
  if (!selectedLocation) {
    return (
      <div className="quick-count">
        <div className="qc-header-row">
          <div />
          <button className={`qc-edit-toggle${isEditing ? ' active' : ''}`} onClick={() => { setIsEditing(!isEditing); setEditingLocId(null); }}>
            {isEditing ? 'Done' : 'Edit'}
          </button>
        </div>
        <p className="qc-subtitle">{isEditing ? 'Hold & drag to reorder. Tap to edit.' : 'Select a storage location to start counting'}</p>
        <div className="qc-location-grid">
          {locations.map((loc, index) => {
            const locItemCount = items.filter(i => i.storage_location === loc.id && i.is_active !== false).length;
            return (
              <div
                key={loc.id}
                className={`qc-loc-wrapper${isEditing && !isDragging ? ' qc-wiggle' : ''}`}
                data-index={index}
                onTouchStart={isEditing ? (e) => handleTouchStart(e, index) : undefined}
                onTouchMove={isEditing ? handleTouchMove : undefined}
                onTouchEnd={isEditing ? handleTouchEnd : undefined}
              >
                {isEditing && (
                  <button className="qc-delete-badge" onTouchEnd={(e) => { e.stopPropagation(); }} onClick={(e) => { e.stopPropagation(); handleDeleteLocation(loc); }}>×</button>
                )}
                <button
                  className="qc-location-btn"
                  onClick={() => isEditing ? openEditor(loc) : setSelectedLocation(loc.id)}
                >
                  <div className="qc-location-icon" style={{ width: 56, height: 56, borderRadius: 12, background: (loc.color || '#16a34a') + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {SvgIcons[loc.iconKey]?.(loc.color)}
                  </div>
                  <div className="qc-location-text">
                    <span className="qc-location-label">{loc.label}</span>
                    <span className="qc-location-count">{locItemCount} items</span>
                  </div>
                  {!isEditing && <span className="qc-location-chevron">›</span>}
                </button>
              </div>
            );
          })}
          {isEditing && (
            <button className="qc-add-location-btn" onClick={handleAddLocation}>
              <span style={{ fontSize: '2rem', lineHeight: 1 }}>+</span>
              <span>Add Location</span>
            </button>
          )}
        </div>

        {/* Inline editor */}
        {isEditing && editingLocId && (() => {
          const editLoc = locations.find(l => l.id === editingLocId);
          if (!editLoc) return null;
          return (
            <div className="qc-location-editor">
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: 'var(--text-primary)' }}>Edit Location</h3>
              <input
                type="text"
                className="qc-editor-name-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Location name"
                autoFocus
              />
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.75rem 0 0.35rem', display: 'block' }}>Icon</label>
              <div className="qc-icon-picker">
                {AVAILABLE_ICON_KEYS.map(key => (
                  <button key={key} className={`qc-icon-option${editIconKey === key ? ' selected' : ''}`} onClick={() => setEditIconKey(key)}>
                    {SvgIcons[key]?.(editIconKey === key ? editColor : '#64748b')}
                  </button>
                ))}
              </div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.75rem 0 0.35rem', display: 'block' }}>Color</label>
              <div className="qc-color-picker">
                {AVAILABLE_COLORS.map(c => (
                  <button key={c} className={`qc-color-dot${editColor === c ? ' selected' : ''}`} style={{ background: c }} onClick={() => setEditColor(c)} />
                ))}
              </div>
              <button className="btn btn-success" style={{ marginTop: '1rem', width: '100%', padding: '0.65rem', borderRadius: 10, fontWeight: 600 }} onClick={handleSaveEditor}>
                Save
              </button>
            </div>
          );
        })()}
      </div>
    );
  }

  // --- Count entry screen ---
  const currentLoc = locations.find(l => l.id === selectedLocation);

  return (
    <div className="quick-count">
      <div className="qc-header">
        <button className="qc-back-btn" onClick={() => setSelectedLocation(null)}>
          ← Back
        </button>
        <div className="qc-header-info">
          <h2>{currentLoc && SvgIcons[currentLoc.iconKey]?.(currentLoc.color)} {currentLoc?.label}</h2>
          <span className="qc-progress">{countedCount} of {totalCount} counted</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="qc-progress-bar">
        <div
          className="qc-progress-fill"
          style={{ width: totalCount > 0 ? `${(countedCount / totalCount) * 100}%` : '0%' }}
        />
      </div>

      {isLoading ? (
        <div className="qc-loading">Loading items...</div>
      ) : locationItems.length === 0 ? (
        <div className="qc-empty">
          <p>No items assigned to this location yet.</p>
          <p className="qc-empty-hint">Add items to inventory and set their storage location to see them here.</p>
        </div>
      ) : (
        <>
          <div className="qc-items-list">
            {locationItems.map(item => {
              const hasCount = countValues[item.id] !== '' && countValues[item.id] !== null && countValues[item.id] !== undefined;
              return (
                <div key={item.id} className={`qc-item ${hasCount ? 'counted' : ''}`}>
                  <div className="qc-item-main">
                    <div className="qc-item-info">
                      <span className="qc-item-name">{item.name}</span>
                      <span className="qc-item-last">
                        Last: {item.current_quantity} {item.unit_type}
                      </span>
                    </div>
                    <div className="qc-item-input-group">
                      <button
                        className="qc-adjust-btn minus"
                        onClick={() => handleAdjust(item.id, -1)}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        className="qc-count-input"
                        value={countValues[item.id] ?? ''}
                        onChange={(e) => handleCountChange(item.id, e.target.value === '' ? '' : parseFloat(e.target.value))}
                        placeholder="—"
                        min="0"
                        inputMode="decimal"
                      />
                      <button
                        className="qc-adjust-btn plus"
                        onClick={() => handleAdjust(item.id, 1)}
                      >
                        +
                      </button>
                    </div>
                    <span className="qc-item-unit">{item.unit_type}</span>
                  </div>
                  <button
                    className="qc-notes-toggle"
                    onClick={() => setExpandedNotes(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                  >
                    {expandedNotes[item.id] ? 'Hide notes' : '+ Note'}
                  </button>
                  {expandedNotes[item.id] && (
                    <input
                      type="text"
                      className="qc-note-input"
                      value={countNotes[item.id] || ''}
                      onChange={(e) => setCountNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                      placeholder="Add a note..."
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="qc-submit-bar">
            <button
              className="btn btn-success qc-btn-large"
              onClick={handleSubmit}
              disabled={isSubmitting || countedCount === 0}
            >
              {isSubmitting ? 'Submitting...' : `Submit ${countedCount} Count${countedCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// === DetectView Component ===
function DetectView({ onAddToInventory }) {
  const [mode, setMode] = useState('upload');
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState(null);
  const [error, setError] = useState(null);
  const [serviceStatus, setServiceStatus] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [isHeicUpload, setIsHeicUpload] = useState(false);
  const [editableItems, setEditableItems] = useState([]);
  const [isAddingToInventory, setIsAddingToInventory] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    checkHealth().then(setServiceStatus);
  }, []);

  useEffect(() => {
    if (mode === 'camera') {
      startCamera();
    }
    return () => stopCamera();
  }, [mode]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setError(null);
    } catch (err) {
      setError('Camera access denied. Please enable camera permissions.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) {
      setError('Camera not ready. Please wait and try again.');
      return;
    }

    const video = videoRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setError('Camera still loading. Please wait a moment.');
      return;
    }

    // Create a temporary canvas for capturing (don't rely on canvasRef)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;

    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    tempCanvas.toBlob(blob => {
      if (blob) {
        setCapturedImage(URL.createObjectURL(blob));
        runDetection(blobToFile(blob, 'capture.jpg'));
      } else {
        setError('Failed to capture image. Please try again.');
      }
    }, 'image/jpeg', IMAGE_QUALITY);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');

    if (isHeic) {
      // HEIC files can't be previewed in the browser, show placeholder instead
      setCapturedImage(null);
      setIsHeicUpload(true);
    } else {
      setIsHeicUpload(false);
      setCapturedImage(URL.createObjectURL(file));
    }
    runDetection(file);
  };

  const runDetection = async (file) => {
    setIsDetecting(true);
    setError(null);
    setDetectionResult(null);

    try {
      const result = await detectObjects(file, { confidence: DETECTION_CONFIDENCE, filterInventory: true });
      setDetectionResult(result);

      // Populate editable items from detection results
      if (result.summary?.length > 0) {
        setEditableItems(result.summary.map((item, idx) => ({
          id: idx,
          name: item.class_name,
          quantity: item.count,
          category: item.category || guessCategoryFromName(item.class_name),
          included: true,
        })));
      }

      // If the API returned a JPEG preview (useful for HEIC files the browser can't display),
      // use it as the captured image so the user can always see what was analyzed
      if (result.image_preview) {
        setCapturedImage(`data:image/jpeg;base64,${result.image_preview}`);
        setIsHeicUpload(false);
      }
    } catch (err) {
      const errorMsg = err.status
        ? `Error ${err.status}: ${err.message}`
        : `Network error: ${err.message || 'Could not connect to detection service'}`;
      setError(errorMsg);
    } finally {
      setIsDetecting(false);
    }
  };

  const drawDetections = (detections) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      detections.forEach(det => {
        const { bbox, class_name, confidence } = det;

        if (!bbox) return;

        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.strokeRect(bbox.x1, bbox.y1, bbox.x2 - bbox.x1, bbox.y2 - bbox.y1);

        const label = `${class_name} ${(confidence * 100).toFixed(0)}%`;
        ctx.font = 'bold 16px system-ui';
        const textWidth = ctx.measureText(label).width;

        ctx.fillStyle = '#22c55e';
        ctx.fillRect(bbox.x1, bbox.y1 - 24, textWidth + 8, 24);

        ctx.fillStyle = '#fff';
        ctx.fillText(label, bbox.x1 + 4, bbox.y1 - 6);
      });
    };
    img.src = capturedImage;
  };

  const resetDetection = () => {
    setDetectionResult(null);
    setCapturedImage(null);
    setIsHeicUpload(false);
    setEditableItems([]);
    setError(null);
    if (mode === 'camera') startCamera();
  };

  const serviceUnavailable = !serviceStatus || serviceStatus.status === 'unavailable' || serviceStatus.status === 'offline';

  if (serviceUnavailable) {
    return (
      <div className="detect-placeholder">
        <div className="detect-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48" style={{ color: 'var(--text-muted)' }}>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>AI Detection</h2>
        <p className="detect-subtitle" style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>Claude Vision</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Connecting to detection service...
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
          This may take a moment on first load.
        </p>
        <button className="btn btn-secondary" onClick={() => checkHealth().then(setServiceStatus)}>
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="detect-view">
      <div className="detect-mode-toggle">
        <button className={`mode-tab ${mode === 'camera' ? 'active' : ''}`} onClick={() => { setMode('camera'); resetDetection(); }}>
          Camera
        </button>
        <button className={`mode-tab ${mode === 'upload' ? 'active' : ''}`} onClick={() => { setMode('upload'); stopCamera(); resetDetection(); }}>
          Upload Photo
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="detect-camera-container">
        {mode === 'camera' && !capturedImage && (
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block' }} />
        )}

        {capturedImage && !isHeicUpload && (
          <img src={capturedImage} alt="Uploaded preview" style={{ width: '100%', display: 'block', borderRadius: '8px' }} />
        )}

        {isHeicUpload && (
          <div className="detect-heic-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
            <p>HEIC image uploaded</p>
          </div>
        )}

        {mode === 'upload' && !capturedImage && (
          <div className="detect-upload-area" onClick={() => fileInputRef.current?.click()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p>Tap to upload a photo</p>
            <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif" onChange={handleFileUpload} style={{ display: 'none' }} />
          </div>
        )}

        {isDetecting && (
          <div className="detect-loading-overlay">
            <div className="spinner" />
            <p>Analyzing image...</p>
          </div>
        )}
      </div>

      <div className="detect-controls">
        {mode === 'camera' && !capturedImage && (
          <button
            className="btn btn-primary btn-lg"
            onClick={capturePhoto}
            style={{ width: '100%' }}
          >
            Capture & Detect
          </button>
        )}

        {capturedImage && (
          <button className="btn btn-secondary" onClick={resetDetection} style={{ width: '100%' }}>
            {mode === 'camera' ? 'Take New Photo' : 'Upload Another'}
          </button>
        )}
      </div>

      {detectionResult && detectionResult.summary.length > 0 && (
        <div className="detect-results">
          <div className="detect-summary-header">
            <h3>Detected Items</h3>
            <span className="detect-time">{detectionResult.processing_time_ms.toFixed(0)}ms</span>
          </div>

          <div className="detect-summary-stats">
            <div className="stat-box">
              <span className="stat-value">{detectionResult.total_objects}</span>
              <span className="stat-label">Objects</span>
            </div>
            <div className="stat-box">
              <span className="stat-value">{detectionResult.summary.length}</span>
              <span className="stat-label">Types</span>
            </div>
          </div>

          <div className="detect-items-list">
            {editableItems.map((item, idx) => {
              const original = detectionResult.summary[idx];
              return (
                <div key={item.id} className={`detect-item-row ${original?.needs_review ? 'needs-review' : ''}`}>
                  <div className="detect-item-header">
                    <div className="detect-item-info">
                      <span className={`detect-confidence-badge ${original?.confidence_level || 'medium'}`}>
                        {original?.confidence_level || 'medium'}
                      </span>
                      {original?.needs_review && <span className="detect-review-flag">Needs Review</span>}
                    </div>
                    <label className="detect-item-toggle">
                      <input
                        type="checkbox"
                        checked={item.included}
                        onChange={() => {
                          const updated = [...editableItems];
                          updated[idx] = { ...updated[idx], included: !updated[idx].included };
                          setEditableItems(updated);
                        }}
                      />
                    </label>
                  </div>
                  <div className="detect-edit-fields">
                    <input
                      type="text"
                      className="detect-edit-name"
                      value={item.name}
                      onChange={(e) => {
                        const updated = [...editableItems];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        setEditableItems(updated);
                      }}
                    />
                    <input
                      type="number"
                      className="detect-edit-qty"
                      value={item.quantity}
                      min="0"
                      onChange={(e) => {
                        const updated = [...editableItems];
                        updated[idx] = { ...updated[idx], quantity: Math.max(0, parseInt(e.target.value) || 0) };
                        setEditableItems(updated);
                      }}
                    />
                  </div>
                  <select
                    className="detect-edit-category"
                    value={item.category}
                    onChange={(e) => {
                      const updated = [...editableItems];
                      updated[idx] = { ...updated[idx], category: e.target.value };
                      setEditableItems(updated);
                    }}
                  >
                    {DEFAULT_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {original?.sections && (
                    <div className="detect-grid">
                      <div className="detect-grid-row">
                        <span className="grid-cell">{original.sections.top_left}</span>
                        <span className="grid-cell">{original.sections.top_center}</span>
                        <span className="grid-cell">{original.sections.top_right}</span>
                      </div>
                      <div className="detect-grid-row">
                        <span className="grid-cell">{original.sections.middle_left}</span>
                        <span className="grid-cell">{original.sections.middle_center}</span>
                        <span className="grid-cell">{original.sections.middle_right}</span>
                      </div>
                      <div className="detect-grid-row">
                        <span className="grid-cell">{original.sections.bottom_left}</span>
                        <span className="grid-cell">{original.sections.bottom_center}</span>
                        <span className="grid-cell">{original.sections.bottom_right}</span>
                      </div>
                    </div>
                  )}
                  {original?.notes && <div className="detect-item-notes">{original.notes}</div>}
                </div>
              );
            })}
          </div>

          {onAddToInventory && editableItems.some(i => i.included) && (
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '1rem' }}
              disabled={isAddingToInventory}
              onClick={async () => {
                setIsAddingToInventory(true);
                try {
                  const itemsToAdd = editableItems
                    .filter(i => i.included && i.name.trim())
                    .map(i => ({ name: i.name.trim(), quantity: i.quantity, category: i.category }));
                  if (itemsToAdd.length > 0) {
                    await onAddToInventory(itemsToAdd);
                    resetDetection();
                  }
                } finally {
                  setIsAddingToInventory(false);
                }
              }}
            >
              {isAddingToInventory ? 'Adding...' : `Add ${editableItems.filter(i => i.included).length} Items to Inventory`}
            </button>
          )}
        </div>
      )}

      {detectionResult && detectionResult.summary.length === 0 && (
        <div className="detect-no-results">
          <p>No inventory items detected. Try adjusting the camera angle or lighting.</p>
        </div>
      )}
    </div>
  );
}

// Main App Component
// SVG icons for bottom nav
const NavIcons = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  inventory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  scan: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  orders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  ),
};

// More menu icons
const MoreIcons = {
  count: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  waste: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  barcode: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5v14" /><path d="M8 5v14" /><path d="M12 5v14" /><path d="M17 5v14" /><path d="M21 5v14" />
    </svg>
  ),
  suppliers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  darkMode: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  lightMode: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  signOut: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

// Bottom Navigation Bar
function BottomNav({ view, setView, setStockFilter, restockList, darkMode, onToggleDarkMode, userName, onLogout }) {
  const [showMore, setShowMore] = useState(false);

  const moreViews = ['count', 'waste', 'scan', 'suppliers'];
  const isMoreActive = moreViews.includes(view);

  const handleNav = (target) => {
    if (target === 'list') {
      setStockFilter(null);
    }
    setView(target);
  };

  const handleMoreItem = (target) => {
    setShowMore(false);
    handleNav(target);
  };

  return (
    <>
      <nav className="bottom-nav">
        <button className={`bottom-nav-tab ${view === 'home' ? 'active' : ''}`} onClick={() => handleNav('home')}>
          {NavIcons.home}
          <span>Home</span>
        </button>
        <button className={`bottom-nav-tab ${view === 'list' ? 'active' : ''}`} onClick={() => handleNav('list')}>
          {NavIcons.inventory}
          <span>Inventory</span>
        </button>
        <button className={`bottom-nav-tab detect-tab ${view === 'detect' ? 'active' : ''}`} onClick={() => handleNav('detect')}>
          <div className="detect-tab-circle">
            {NavIcons.scan}
          </div>
          <span>Detect</span>
        </button>
        <button className={`bottom-nav-tab ${view === 'restock' ? 'active' : ''}`} onClick={() => handleNav('restock')}>
          {NavIcons.orders}
          <span>Orders</span>
          {restockList.length > 0 && <span className="bottom-nav-badge">{restockList.length}</span>}
        </button>
        <button className={`bottom-nav-tab ${isMoreActive || showMore ? 'active' : ''}`} onClick={() => setShowMore(!showMore)}>
          {NavIcons.more}
          <span>More</span>
        </button>
      </nav>

      {showMore && (
        <div className="more-menu-overlay" onClick={() => setShowMore(false)}>
          <div className="more-menu-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="more-menu-handle" />
            <h3>More</h3>
            <button className="more-menu-item" onClick={() => handleMoreItem('count')}>
              {MoreIcons.count}
              Quick Count
            </button>
            <button className="more-menu-item" onClick={() => handleMoreItem('waste')}>
              {MoreIcons.waste}
              Waste Log
            </button>
            <button className="more-menu-item" onClick={() => handleMoreItem('scan')}>
              {MoreIcons.barcode}
              Barcode Scan
            </button>
            <button className="more-menu-item" onClick={() => handleMoreItem('suppliers')}>
              {MoreIcons.suppliers}
              Suppliers
            </button>
            <button className="more-menu-item" onClick={() => handleMoreItem('waste')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-6 4 4 5-8"/></svg>
              Reports
            </button>
            <div className="more-menu-divider" />
            <div className="more-menu-toggle">
              <span className="more-menu-toggle-label">
                {darkMode ? MoreIcons.lightMode : MoreIcons.darkMode}
                {darkMode ? 'Light Mode' : 'Dark Mode'}
              </span>
              <button className={`toggle-switch ${darkMode ? 'active' : ''}`} onClick={onToggleDarkMode} />
            </div>
            {onLogout && (
              <button className="more-menu-item danger" onClick={() => { onLogout(); setShowMore(false); }}>
                {MoreIcons.signOut}
                Sign Out
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function AppContent() {
  // Auth state
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [view, setView] = useState('home');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scannedBarcode, setScannedBarcode] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showQuickUpdate, setShowQuickUpdate] = useState(false);
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [alert, setAlert] = useState(null);
  const [customCategories, setCustomCategories] = useState([]);
  const [recentScans, setRecentScans] = useState([]);
  const [showScanSuccess, setShowScanSuccess] = useState(false);
  const [stockFilter, setStockFilter] = useState(null); // 'low', 'medium', 'good', or null
  const [cameFromQuickUpdate, setCameFromQuickUpdate] = useState(false);
  const [dashRecentCounts, setDashRecentCounts] = useState([]);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [restockList, setRestockList] = useState(() => {
    const saved = localStorage.getItem('restockList');
    return saved ? JSON.parse(saved) : [];
  });

  // Check for existing auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getAuthToken();
      if (token) {
        try {
          const userData = await api.getMe();
          if (userData) {
            setUser(userData);
          } else {
            clearAuthToken();
          }
        } catch (err) {
          clearAuthToken();
        }
      }
      setAuthLoading(false);
    };
    checkAuth();
  }, []);

  const handleAuth = (userData) => {
    setUser(userData);
    loadItems();
  };

  const handleLogout = () => {
    clearAuthToken();
    setUser(null);
    setItems([]);
    setRecentScans([]);
    setRestockList([]);
    setView('home');
  };

  // Save restock list to localStorage
  useEffect(() => {
    localStorage.setItem('restockList', JSON.stringify(restockList));
  }, [restockList]);

  const addToRestockList = (item) => {
    setRestockList(prev => {
      // Check if already in list
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        showAlert('info', `${item.name} is already in your restock list`);
        return prev;
      }
      // Calculate suggested order quantity (difference to reach min + 20% buffer)
      const needed = Math.max(0, item.min_quantity - item.current_quantity);
      const suggested = Math.ceil(needed * 1.2) || item.min_quantity || 10;
      showAlert('success', `Added ${item.name} to restock list`);
      return [...prev, {
        ...item,
        orderQuantity: suggested,
        addedAt: new Date().toISOString()
      }];
    });
  };

  const updateRestockQuantity = (itemId, quantity) => {
    setRestockList(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, orderQuantity: Math.max(0, quantity) } : item
      )
    );
  };

  const removeFromRestockList = (itemId) => {
    setRestockList(prev => prev.filter(item => item.id !== itemId));
  };

  const clearRestockList = () => {
    setRestockList([]);
    showAlert('success', 'Restock list cleared');
  };

  // Apply dark mode class to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  const handleEditThreshold = (item) => {
    setCameFromQuickUpdate(showQuickUpdate);
    setSelectedItem(item);
    setShowQuickUpdate(false);
    setShowThresholdModal(true);
  };

  const handleBackFromThreshold = () => {
    setShowThresholdModal(false);
    if (cameFromQuickUpdate && selectedItem) {
      setShowQuickUpdate(true);
    }
    setCameFromQuickUpdate(false);
  };

  const handleSaveThreshold = async (itemId, newThreshold) => {
    try {
      await api.updateItem(itemId, { min_quantity: newThreshold });
      showAlert('success', 'Alert threshold updated');
      await loadItems();
      setShowThresholdModal(false);
      setSelectedItem(null);
    } catch (err) {
      showAlert('error', 'Failed to update threshold');
    }
  };

  const handleBulkSaveThreshold = async (itemIds, newThreshold) => {
    try {
      await Promise.all(itemIds.map(id => api.updateItem(id, { min_quantity: newThreshold })));
      showAlert('success', `Updated threshold for ${itemIds.length} items`);
      await loadItems();
      setShowThresholdModal(false);
      setSelectedItem(null);
    } catch (err) {
      showAlert('error', 'Failed to update thresholds');
    }
  };

  const handleLogWaste = (item) => {
    setSelectedItem(item);
    setShowQuickUpdate(false);
    setShowWasteModal(true);
  };

  const handleSaveWaste = async (itemId, quantity, reason, notes, costEstimate) => {
    try {
      await api.recordWaste(itemId, quantity, reason, notes, costEstimate);
      showAlert('success', 'Waste logged successfully');
      await loadItems();
      setShowWasteModal(false);
      setSelectedItem(null);
    } catch (err) {
      showAlert('error', 'Failed to log waste');
    }
  };

  const handleNavigateToInventory = (filter) => {
    if (filter === 'all') {
      setStockFilter(null);
    } else {
      setStockFilter(filter);
    }
    setView('list');
  };

  const handleAddCategory = (category) => {
    if (!customCategories.includes(category)) {
      setCustomCategories([...customCategories, category]);
    }
  };

  const handleAddNewItem = () => {
    setSelectedItem(null);
    setScannedBarcode(null);
    setShowItemModal(true);
  };

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 3000);
  };

  const loadItems = async () => {
    try {
      const data = await api.getItems();
      setItems(data);
      // Also load recent counts for dashboard
      try {
        const counts = await api.getRecentCounts(24);
        setDashRecentCounts(counts);
      } catch (e) { /* non-critical */ }
    } catch (err) {
      showAlert('error', 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadItems();
    }
  }, [user]);

  const [lookupData, setLookupData] = useState(null);

  const handleScan = async (barcode) => {
    if (!barcode) return;

    try {
      setScannedBarcode(barcode);
      setLookupData(null);

      // Show success animation
      setShowScanSuccess(true);
      setTimeout(() => setShowScanSuccess(false), 500);

      let existingItem = null;
      try {
        existingItem = await api.getItemByBarcode(barcode);
      } catch (err) {
      }

      if (existingItem) {
        // Existing item - show add stock modal
        setRecentScans(prev => {
          const filtered = prev.filter(s => s.barcode !== barcode);
          return [{ ...existingItem, scannedAt: new Date() }, ...filtered].slice(0, 3);
        });
        setSelectedItem(existingItem);
        setShowQuickUpdate(true);
      } else {
        // New item - try to lookup product info
        showAlert('success', 'New item! Looking up product info...');

        let productInfo = null;
        try {
          productInfo = await lookupBarcode(barcode);
        } catch (err) {
        }

        setLookupData(productInfo);
        setSelectedItem(null);
        setShowItemModal(true);

        if (productInfo?.name) {
          showAlert('success', `Found: ${productInfo.name}`);
        }
      }
    } catch (err) {
      showAlert('error', 'Error processing scan. Please try again.');
    }
  };

  const handleSaveItem = async (itemData) => {
    try {
      if (itemData.id) {
        await api.updateItem(itemData.id, itemData);
        showAlert('success', 'Item updated successfully');
      } else {
        await api.createItem(itemData);
        showAlert('success', 'Item added successfully');
      }
      await loadItems();
      setShowItemModal(false);
      setShowQuickUpdate(false);
      setSelectedItem(null);
      setScannedBarcode(null);
    } catch (err) {
      showAlert('error', err.message);
    }
  };

  const handleQuickUpdate = async (id, quantity) => {
    try {
      await api.updateQuantity(id, quantity);
      showAlert('success', 'Quantity updated');
      await loadItems();
      setShowQuickUpdate(false);
      setSelectedItem(null);
      setScannedBarcode(null);
    } catch (err) {
      showAlert('error', 'Failed to update quantity');
    }
  };

  // Quick +/- buttons from scan view (doesn't close modals)
  const handleScanQuickAdjust = async (id, quantity) => {
    try {
      await api.updateQuantity(id, quantity);
      showAlert('success', 'Updated');
      await loadItems();
    } catch (err) {
      showAlert('error', 'Failed to update');
    }
  };

  const handleDeleteItem = async (id) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      await api.deleteItem(id);
      showAlert('success', 'Item deleted');
      await loadItems();
      setShowItemModal(false);
      setShowQuickUpdate(false);
      setSelectedItem(null);
    } catch (err) {
      showAlert('error', 'Failed to delete item');
    }
  };

  const handleItemClick = (item) => {
    setSelectedItem(item);
    setShowQuickUpdate(true);
  };

  const handleEditDetails = (item) => {
    setShowQuickUpdate(false);
    setSelectedItem(item);
    setShowItemModal(true);
  };

  const handleUpdateCategory = async (itemId, newCategory) => {
    try {
      // Add to custom categories if it's new
      if (!DEFAULT_CATEGORIES.includes(newCategory) && !customCategories.includes(newCategory)) {
        setCustomCategories([...customCategories, newCategory]);
      }
      await api.updateItem(itemId, { category: newCategory });
      showAlert('success', `Category updated to ${newCategory}`);
      await loadItems();
      // Update selected item with new category
      setSelectedItem(prev => prev ? { ...prev, category: newCategory } : null);
    } catch (err) {
      showAlert('error', 'Failed to update category');
    }
  };

  const closeModals = () => {
    setShowItemModal(false);
    setShowQuickUpdate(false);
    setSelectedItem(null);
    setScannedBarcode(null);
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  // Show auth screen if not logged in
  if (!user) {
    return (
      <div className={`app ${darkMode ? 'dark' : ''}`}>
        <AuthScreen onAuth={handleAuth} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div onClick={() => setView('home')} style={{ cursor: 'pointer' }}>
          <div className="header-subtitle">
            {view === 'home'
              ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
              : "MIKE'S RESTAURANT \u2022 MAIN KITCHEN"}
          </div>
          <h1>
            {view === 'home' ? `Hello, ${user?.name?.split(' ')[0] || 'there'}!` :
             view === 'list' ? 'Inventory' :
             view === 'restock' ? 'Restock & Orders' :
             view === 'waste' ? 'Waste Tracking' :
             view === 'suppliers' ? 'Suppliers' :
             view === 'count' ? 'Quick Count' :
             view === 'scan' ? 'Barcode Scan' :
             view === 'detect' ? 'AI Scan' :
             "Mike's Inventory"}
          </h1>
        </div>
        {user?.name && (
          <div className="header-avatar" title={user.name}>
            {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </div>
        )}
      </header>

      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.message}
        </div>
      )}

      {view === 'scan' && (
        <div>
          <BarcodeScanner
            onScan={handleScan}
            onError={(msg) => showAlert('error', msg)}
          />

          <div style={{ marginTop: '1rem' }}>
            <div className="form-group">
              <label>Or enter barcode manually</label>
              <input
                type="text"
                placeholder="Enter barcode..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    handleScan(e.target.value.trim());
                    e.target.value = '';
                  }
                }}
              />
            </div>
          </div>

          {recentScans.length > 0 && (
            <div className="recent-scans">
              <h3>Recent Scans</h3>
              {recentScans.map((scan) => {
                const status = getStockStatus(scan.current_quantity, scan.min_quantity);
                const currentItem = items.find(i => i.id === scan.id);
                const liveQuantity = currentItem?.current_quantity ?? scan.current_quantity;

                return (
                  <div key={scan.barcode} className={`recent-scan-item ${status}`}>
                    <div className="recent-scan-main" onClick={() => handleItemClick(currentItem || scan)}>
                      <div className="info">
                        <div className="icon">{getCategorySvgIcon(scan.category)}</div>
                        <div>
                          <div className="name">{scan.name}</div>
                          <div className="scan-meta">
                            <span className={`scan-quantity ${status}`}>{liveQuantity} {scan.unit_type}</span>
                            {scan.min_quantity > 0 && (
                              <span className={`scan-status ${status}`}>
                                {status === 'low' ? 'Low' : status === 'medium' ? 'Getting low' : 'OK'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="recent-scan-actions">
                      <button
                        className="quick-qty-btn minus"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleScanQuickAdjust(scan.id, Math.max(0, liveQuantity - 1));
                        }}
                        title="Remove 1"
                      >
                        −1
                      </button>
                      <button
                        className="quick-qty-btn plus"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleScanQuickAdjust(scan.id, liveQuantity + 1);
                        }}
                        title="Add 1"
                      >
                        +1
                      </button>
                      <button
                        className="quick-qty-btn plus large"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleScanQuickAdjust(scan.id, liveQuantity + 5);
                        }}
                        title="Add 5"
                      >
                        +5
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showScanSuccess && (
        <div className="scan-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

      {view === 'list' && (
        <InventoryList
          items={items}
          onItemClick={handleItemClick}
          onAddItem={handleAddNewItem}
          loading={loading}
          categories={customCategories}
          recentScans={recentScans}
          stockFilter={stockFilter}
          onClearFilter={() => setStockFilter(null)}
        />
      )}

      {view === 'home' && (
        <Dashboard
          items={items}
          loading={loading}
          onItemClick={handleItemClick}
          onNavigate={handleNavigateToInventory}
          onNavigateView={(v) => setView(v)}
          onEditThreshold={handleEditThreshold}
          onAddToRestock={addToRestockList}
          onStartCount={() => setView('count')}
          onStartScan={() => setView('detect')}
          recentCounts={dashRecentCounts}
          restockCount={restockList.length}
        />
      )}

      {view === 'restock' && (
        <RestockList
          items={restockList}
          allItems={items}
          onUpdateQuantity={updateRestockQuantity}
          onRemove={removeFromRestockList}
          onClear={clearRestockList}
          onItemClick={handleItemClick}
        />
      )}

      {view === 'waste' && (
        <WasteReport onItemClick={handleItemClick} />
      )}

      {view === 'suppliers' && (
        <SuppliersView showAlert={showAlert} />
      )}

      {view === 'count' && (
        <QuickCountView
          items={items}
          onCountsSubmitted={loadItems}
          showAlert={showAlert}
        />
      )}

      {view === 'detect' && (
        <DetectView onAddToInventory={async (items) => {
          let added = 0;
          const errors = [];
          for (const item of items) {
            try {
              await api.createItem({
                barcode: `detect-${Date.now()}-${added}`,
                name: item.name,
                category: item.category || 'Uncategorized',
                unit_type: 'units',
                current_quantity: item.quantity,
                min_quantity: 0,
              });
              added++;
            } catch (err) {
              errors.push(`${item.name}: ${err.message}`);
            }
          }
          await loadItems();
          if (errors.length > 0) {
            showAlert('error', `Added ${added} items. Errors: ${errors.join(', ')}`);
          } else {
            showAlert('success', `Added ${added} item${added !== 1 ? 's' : ''} to inventory`);
          }
          if (added > 0) setView('list');
        }} />
      )}

      <BottomNav
        view={view}
        setView={setView}
        setStockFilter={setStockFilter}
        restockList={restockList}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        userName={user?.name}
        onLogout={handleLogout}
      />

      {showItemModal && (
        <ItemModal
          item={selectedItem}
          barcode={scannedBarcode}
          lookupData={lookupData}
          onSave={handleSaveItem}
          onClose={closeModals}
          onDelete={selectedItem ? handleDeleteItem : undefined}
          categories={customCategories}
          onAddCategory={handleAddCategory}
        />
      )}

      {showQuickUpdate && selectedItem && (
        <QuickUpdateModal
          item={selectedItem}
          onSave={handleQuickUpdate}
          onClose={closeModals}
          onEdit={handleEditDetails}
          onEditThreshold={handleEditThreshold}
          onUpdateCategory={handleUpdateCategory}
          onLogWaste={handleLogWaste}
          categories={customCategories}
        />
      )}

      {showWasteModal && selectedItem && (
        <LogWasteModal
          item={selectedItem}
          onSave={handleSaveWaste}
          onClose={() => { setShowWasteModal(false); setSelectedItem(null); }}
        />
      )}

      {showThresholdModal && selectedItem && (
        <ThresholdEditModal
          item={selectedItem}
          allItems={items}
          onSave={handleSaveThreshold}
          onBulkSave={handleBulkSaveThreshold}
          onClose={() => { setShowThresholdModal(false); setSelectedItem(null); setCameFromQuickUpdate(false); }}
          onBack={cameFromQuickUpdate ? handleBackFromThreshold : null}
        />
      )}
    </div>
  );
}


// Wrap with ErrorBoundary
export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
