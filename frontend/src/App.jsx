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
    console.error('App Error:', error, errorInfo);
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
              background: '#2563eb',
              color: 'white',
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
    console.error('Barcode lookup failed:', err);
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
      console.error('Flash toggle failed:', err);
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
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (text) => {
            if (!stopped && !scannedCode) {
              scannedCode = text;
              stopped = true;
              // Stop scanner first, then notify parent
              scanner.stop()
                .catch(() => {})
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
        console.error('Camera start failed:', err);
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
          scanner.stop().catch(() => {});
        } catch (e) {}
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
          {flashOn ? '🔦' : '💡'}
        </button>
      )}
    </div>
  );
}

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
        console.error('Scan handler error:', err);
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
const CATEGORY_ICONS = {
  'Uncategorized': '📦',
  'Produce': '🥬',
  'Dairy': '🧀',
  'Meat': '🥩',
  'Seafood': '🦐',
  'Dry Goods': '🥫',
  'Beverages': '🥤',
  'Frozen': '🧊',
  'Supplies': '🧹',
};

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

const getCategoryIcon = (category) => CATEGORY_ICONS[category] || '📦';

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
  });
  const [saving, setSaving] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [isLookedUp, setIsLookedUp] = useState(!!lookupData?.name);

  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...categories])].sort();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    if (!formData.barcode.trim()) return;

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
        <div className="modal-header">
          <h2>{item ? 'Edit Item' : 'New Item'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Barcode *</label>
            <input
              type="text"
              value={formData.barcode}
              onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
              placeholder="Enter barcode"
              required
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
          <div className="item-icon">{getCategoryIcon(item?.category)}</div>
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
                <span className="preview-icon">🔕</span>
                <span>Alerts disabled for this item</span>
              </>
            ) : item?.current_quantity <= threshold ? (
              <>
                <span className="preview-icon">⚠️</span>
                <span>Will show alert immediately</span>
              </>
            ) : (
              <>
                <span className="preview-icon">✓</span>
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
        console.error('Failed to fetch usage:', err);
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
  { value: 'expired', label: 'Expired', icon: '📅' },
  { value: 'spoiled', label: 'Spoiled', icon: '🦠' },
  { value: 'damaged', label: 'Damaged', icon: '💔' },
  { value: 'overprepped', label: 'Over-prepared', icon: '🍳' },
  { value: 'dropped', label: 'Dropped/Spilled', icon: '💧' },
  { value: 'quality', label: 'Quality Issue', icon: '👎' },
  { value: 'other', label: 'Other', icon: '📝' },
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
        <div className="modal-header">
          <h2>Log Waste</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="item-header-card">
          <div className="item-icon">{getCategoryIcon(item.category)}</div>
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
                  <span className="reason-icon">{r.icon}</span>
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
        console.error('Failed to fetch waste data:', err);
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
  const reasonIcon = (reason) => WASTE_REASONS.find(r => r.value === reason)?.icon || '📝';

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
        <div className="modal-header">
          <h2>Update Stock</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="item-header-card">
          <div className="item-icon">{getCategoryIcon(item.category)}</div>
          <div className="item-details">
            <div className="item-title">{item.name}</div>
            <div className="item-subtitle">{item.category} • {item.barcode}</div>
            <div className="item-timestamp">Last updated: {lastUpdated}</div>
          </div>
        </div>

        {/* Uncategorized Warning & Quick Category Picker */}
        {item.category === 'Uncategorized' && (
          <div className="uncategorized-warning">
            <div className="uncategorized-header">
              <span>📦</span>
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
                          <span className="category-option-icon">{getCategoryIcon(cat)}</span>
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

        {/* No Threshold Warning */}
        {item.min_quantity === 0 && (
          <div className="no-threshold-warning">
            <div className="no-threshold-header">
              <span>🔔</span>
              <span>No low-stock alert set</span>
            </div>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => onEditThreshold?.(item)}>
              Set Alert Threshold
            </button>
          </div>
        )}

        <div className={`stock-summary current ${stockStatus}`}>
          <div className="stock-row">
            <span>Current Stock:</span>
            <span className="stock-value">{item.current_quantity} / {item.min_quantity} {item.unit_type}</span>
          </div>
          <div className="stock-progress-bar">
            <div
              className={`stock-progress-fill ${stockStatus}`}
              style={{ width: `${Math.min(100, getStockPercentage(item.current_quantity, item.min_quantity))}%` }}
            />
          </div>
          <div className="stock-row" style={{ marginTop: '0.5rem' }}>
            <span className="stock-percentage">
              {item.min_quantity > 0 ? `${getStockPercentage(item.current_quantity, item.min_quantity)}% of target` : 'No threshold set'}
            </span>
            <button className="threshold-edit-btn" onClick={() => onEditThreshold?.(item)}>
              {item.min_quantity > 0 ? '🔔 Alert' : '+ Set Alert'}
            </button>
          </div>
          {stockStatus === 'low' && (
            <div className="stock-warning">⚠️ {getStockSeverity(item.current_quantity, item.min_quantity)}% below target</div>
          )}
          {item.usage?.hasData && (
            <div className="usage-info">
              <span>Usage: ~{item.usage.averagePerDay} {item.unit_type}/day</span>
              {item.usage.daysRemaining !== null && (
                <span className={`days-remaining ${item.usage.daysRemaining <= 3 ? 'urgent' : ''}`}>
                  {item.usage.daysRemaining === 0 ? 'Out today' :
                   item.usage.daysRemaining === 1 ? 'Out tomorrow' :
                   `${item.usage.daysRemaining} days remaining`}
                </span>
              )}
            </div>
          )}
          <button
            className="view-analytics-btn"
            onClick={() => setShowUsageAnalytics(!showUsageAnalytics)}
          >
            {showUsageAnalytics ? 'Hide Analytics' : 'View Usage Analytics'}
          </button>
        </div>

        {/* Usage Analytics Panel */}
        {showUsageAnalytics && (
          <UsageAnalytics item={item} />
        )}

        {/* Mode Toggle */}
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

        <div className="form-group">
          <label>{mode === 'add' ? 'Adjust by:' : 'Set to:'}</label>
          <QuantityInput
            value={amount}
            onChange={setAmount}
            unit={item.unit_type}
            allowNegative={mode === 'add'}
          />
        </div>

        {/* New Total Preview */}
        <div className={`stock-summary preview ${newStockStatus}`}>
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
            <div className="stock-warning">⚠️ Will be below minimum</div>
          )}
        </div>

        {/* Confirmation for large changes */}
        {showConfirm && (
          <div className="confirm-warning">
            <strong>Large change detected!</strong>
            <p>You're changing stock by {Math.abs(difference)} {item.unit_type}. Confirm?</p>
          </div>
        )}

        <div className="action-row">
          <button className="btn btn-secondary" onClick={() => onEdit(item)}>
            Edit Details
          </button>
          <button className="btn btn-danger-outline" onClick={() => onLogWaste?.(item)}>
            Log Waste
          </button>
          <button
            className="btn btn-success"
            onClick={handleSave}
            disabled={saving || difference === 0}
          >
            {saving ? 'Saving...' : showConfirm ? 'Confirm Update' : 'Update Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Inventory Item Card Component
function InventoryItemCard({ item, onClick, showThreshold = true }) {
  const status = getStockStatus(item.current_quantity, item.min_quantity);
  const percentage = getStockPercentage(item.current_quantity, item.min_quantity);
  const severity = getStockSeverity(item.current_quantity, item.min_quantity);
  const daysRemaining = item.usage?.daysRemaining;
  const hasUsageData = item.usage?.hasData;

  // Build status indicator text
  let statusText;
  if (daysRemaining !== null && daysRemaining !== undefined && status !== 'good') {
    if (daysRemaining === 0) statusText = 'Out today';
    else if (daysRemaining === 1) statusText = 'Out tomorrow';
    else if (daysRemaining <= 3) statusText = `${daysRemaining} days left`;
    else statusText = `${daysRemaining}d remaining`;
  } else if (status === 'low') {
    statusText = `${severity}% below`;
  } else if (status === 'medium') {
    statusText = 'Getting low';
  } else {
    statusText = hasUsageData && daysRemaining ? `${daysRemaining}d supply` : 'OK';
  }

  return (
    <div
      className={`inventory-item ${status}-stock`}
      onClick={() => onClick(item)}
      style={{ cursor: 'pointer' }}
    >
      <div className="item-info">
        <div className="item-name">{getCategoryIcon(item.category)} {item.name}</div>
        <div className="item-meta">
          <span className="category-badge">{item.category}</span>
          {item.min_quantity > 0 && showThreshold && (
            <>
              <span style={{ color: 'var(--gray-400)' }}>•</span>
              <span className={`stock-indicator ${status}`}>
                {statusText}
              </span>
            </>
          )}
        </div>
      </div>
      <div className={`item-quantity-display ${status}`}>
        <div className="quantity-fraction">
          <span className="current">{item.current_quantity}</span>
          {item.min_quantity > 0 && (
            <span className="threshold">/ {item.min_quantity}</span>
          )}
        </div>
        <div className="unit">{item.unit_type}</div>
        {item.min_quantity > 0 && (
          <div className="mini-progress">
            <div
              className={`mini-progress-fill ${status}`}
              style={{ width: `${Math.min(100, percentage)}%` }}
            />
          </div>
        )}
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

  return (
    <div>
      {/* Active Filter Banner */}
      {stockFilter && (
        <div className={`filter-banner ${stockFilter}`}>
          <span className="filter-label">
            Showing: <strong>{stockFilterLabels[stockFilter]}</strong> ({filteredByStock.length} items)
          </span>
          <button className="filter-clear" onClick={onClearFilter}>
            ✕ Clear Filter
          </button>
        </div>
      )}

      <div className="inventory-controls">
        <CustomDropdown
          value={viewMode}
          options={[
            { value: 'category', label: 'View by Category' },
            { value: 'all', label: 'View All' }
          ]}
          onChange={setViewMode}
        />
        <button className="btn btn-primary" onClick={onAddItem}>
          + Add Item
        </button>
      </div>

      {/* Recent Scans Section - only show when no filter */}
      {!stockFilter && recentScans && recentScans.length > 0 && (
        <div className="recent-scans-section">
          <div className="section-header">
            <span className="section-icon">🕐</span>
            <span>Recent Scans</span>
          </div>
          <div className="inventory-list">
            {recentScans.map((scan) => (
              <InventoryItemCard key={`recent-${scan.barcode}`} item={scan} onClick={onItemClick} />
            ))}
          </div>
        </div>
      )}

      {filteredByStock.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{stockFilter ? '✓' : '📦'}</div>
          <p>{stockFilter ? `No ${stockFilterLabels[stockFilter].toLowerCase()} items` : 'No inventory items yet'}</p>
          <p style={{ fontSize: '0.875rem' }}>
            {stockFilter ? 'Great job keeping stock levels healthy!' : 'Tap "+ Add Item" to add one manually'}
          </p>
        </div>
      ) : viewMode === 'category' ? (
        /* Category View */
        <div className="category-sections">
          {itemCategories.map((category) => (
            <div key={category} className="category-section">
              <div className="section-header">
                <span className="section-icon">{getCategoryIcon(category)}</span>
                <span>{category}</span>
                <span className="section-count">{itemsByCategory[category].length}</span>
              </div>
              <div className="inventory-list">
                {itemsByCategory[category].map((item) => (
                  <InventoryItemCard key={item.id} item={item} onClick={onItemClick} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* All Items View */
        <div className="inventory-list">
          {items.map((item) => (
            <InventoryItemCard key={item.id} item={item} onClick={onItemClick} />
          ))}
        </div>
      )}
    </div>
  );
}

// Dashboard Component
function Dashboard({ items, onItemClick, onNavigate, onEditThreshold, onAddToRestock }) {
  const totalItems = items.length;

  // Get low stock items and sort by urgency (days remaining, then severity)
  const lowStockItems = items
    .filter((i) => i.current_quantity <= i.min_quantity && i.min_quantity > 0)
    .sort((a, b) => {
      // Items with usage data and fewer days remaining come first
      const aDays = a.usage?.daysRemaining;
      const bDays = b.usage?.daysRemaining;

      // If both have days remaining data, sort by that
      if (aDays !== null && aDays !== undefined && bDays !== null && bDays !== undefined) {
        return aDays - bDays;
      }
      // Items with days remaining data come before those without
      if (aDays !== null && aDays !== undefined) return -1;
      if (bDays !== null && bDays !== undefined) return 1;

      // Fall back to severity sorting
      return getStockSeverity(b.current_quantity, b.min_quantity) - getStockSeverity(a.current_quantity, a.min_quantity);
    });

  const mediumStockItems = items.filter((i) => {
    const status = getStockStatus(i.current_quantity, i.min_quantity);
    return status === 'medium';
  });
  const goodStockItems = items.filter((i) => getStockStatus(i.current_quantity, i.min_quantity) === 'good');
  const categories = [...new Set(items.map((i) => i.category))];

  // Calculate total inventory value (just count for now)
  const totalUnits = items.reduce((sum, i) => sum + i.current_quantity, 0);

  return (
    <div>
      {/* Prominent Low Stock Alert Banner */}
      {lowStockItems.length > 0 && (
        <div className="alert-banner critical" onClick={() => onNavigate?.('low')}>
          <div className="alert-banner-icon">!</div>
          <div className="alert-banner-content">
            <strong>{lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} need restocking</strong>
            <span>Tap to view and take action</span>
          </div>
        </div>
      )}

      {lowStockItems.length === 0 && items.length > 0 && (
        <div className="alert-banner safe">
          <div className="alert-banner-icon">✓</div>
          <div className="alert-banner-content">
            <strong>All items well stocked</strong>
            <span>No items below threshold</span>
          </div>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card neutral" onClick={() => onNavigate?.('all')}>
          <div className="stat-value">{totalItems}</div>
          <div className="stat-label">Total Items</div>
        </div>
        <div className={`stat-card ${lowStockItems.length > 0 ? 'critical' : 'safe'}`} onClick={() => onNavigate?.('low')}>
          <div className="stat-value">{lowStockItems.length}</div>
          <div className="stat-label">Critical</div>
        </div>
        <div className="stat-card warning" onClick={() => onNavigate?.('medium')}>
          <div className="stat-value">{mediumStockItems.length}</div>
          <div className="stat-label">Order Soon</div>
        </div>
        <div className="stat-card safe" onClick={() => onNavigate?.('good')}>
          <div className="stat-value">{goodStockItems.length}</div>
          <div className="stat-label">In Stock</div>
        </div>
      </div>

      {/* Low Stock Items - Priority Section */}
      {lowStockItems.length > 0 && (
        <div className="alert-section">
          <div className="section-header critical">
            <span>Action Required</span>
            <span className="section-count">{lowStockItems.length}</span>
          </div>
          <div className="alert-list">
            {lowStockItems.map((item) => {
              const percentage = getStockPercentage(item.current_quantity, item.min_quantity);
              const needed = item.min_quantity - item.current_quantity;
              const daysRemaining = item.usage?.daysRemaining;
              const hasUsageData = item.usage?.hasData;

              // Determine severity based on days remaining (if available) or percentage
              let severityClass = 'warning';
              if (daysRemaining !== null && daysRemaining !== undefined) {
                if (daysRemaining <= 1) severityClass = 'critical';
                else if (daysRemaining <= 3) severityClass = 'warning';
              } else if (percentage <= 25) {
                severityClass = 'critical';
              }

              // Build status message
              let statusMessage;
              if (daysRemaining !== null && daysRemaining !== undefined) {
                if (daysRemaining === 0) {
                  statusMessage = 'Out today';
                } else if (daysRemaining === 1) {
                  statusMessage = 'Out tomorrow';
                } else {
                  statusMessage = `${daysRemaining} days left`;
                }
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
                      <div className={`alert-card-status ${severityClass}`}>
                        {statusMessage}
                      </div>
                      {item.usage?.averagePerDay > 0 && (
                        <div className="alert-card-usage">
                          Using ~{item.usage.averagePerDay}/{item.unit_type} per day
                        </div>
                      )}
                    </div>
                    <div className="alert-card-quantity">
                      <span className="current">{item.current_quantity}</span>
                      <span className="target">/ {item.min_quantity} {item.unit_type}</span>
                    </div>
                  </div>
                  <div className="alert-card-actions">
                    <button className="alert-btn primary" onClick={(e) => { e.stopPropagation(); onAddToRestock?.(item); }}>
                      Add to Order
                    </button>
                    <button className="alert-btn secondary" onClick={(e) => { e.stopPropagation(); onEditThreshold?.(item); }}>
                      Adjust
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mediumStockItems.length > 0 && (
        <div className="alert-section">
          <div className="section-header warning">
            <span>Order Soon</span>
            <span className="section-count">{mediumStockItems.length}</span>
          </div>
          <div className="inventory-list">
            {mediumStockItems.map((item) => (
              <div
                key={item.id}
                className="inventory-item warning"
                onClick={() => onItemClick?.(item)}
              >
                <div className="item-info">
                  <div className="item-name">{item.name}</div>
                  <div className="item-meta">
                    <span className="item-category">{item.category}</span>
                  </div>
                </div>
                <div className="item-quantity">
                  <div className="quantity-value">{item.current_quantity}</div>
                  <div className="quantity-unit">{item.unit_type}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="empty-state">
          <p>No inventory items yet</p>
          <p>Go to Scan to add your first item</p>
        </div>
      )}
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

// Auth Screen Component
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
          <h1>Inventory Manager</h1>
          <p>{mode === 'login' ? 'Sign in to your account' : 'Create a new account'}</p>
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
              placeholder="you@example.com"
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
              placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
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
                Sign up
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
              <span className="user-icon">👤</span>
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

// Detection View Component
function DetectView({ onAddToInventory }) {
  const [mode, setMode] = useState('camera');
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState(null);
  const [error, setError] = useState(null);
  const [serviceStatus, setServiceStatus] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [liveMode, setLiveMode] = useState(false);
  const [liveDetections, setLiveDetections] = useState([]);
  const [fps, setFps] = useState(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const liveIntervalRef = useRef(null);
  const isDetectingRef = useRef(false);

  useEffect(() => {
    checkHealth().then(setServiceStatus);
  }, []);

  useEffect(() => {
    if (mode === 'camera') {
      startCamera();
    }
    return () => {
      stopCamera();
      stopLiveDetection();
    };
  }, [mode]);

  // Live detection loop
  useEffect(() => {
    if (liveMode && mode === 'camera' && !capturedImage) {
      startLiveDetection();
    } else {
      stopLiveDetection();
    }
    return () => stopLiveDetection();
  }, [liveMode, mode, capturedImage]);

  // Draw overlay for live detections
  useEffect(() => {
    if (liveMode && liveDetections.length >= 0) {
      drawLiveOverlay();
    }
  }, [liveDetections, liveMode]);

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
    stopLiveDetection();
  };

  const startLiveDetection = () => {
    if (liveIntervalRef.current) return;

    let lastTime = performance.now();
    let frameCount = 0;

    const runFrame = async () => {
      if (!liveMode || !videoRef.current || isDetectingRef.current) {
        liveIntervalRef.current = setTimeout(runFrame, 100);
        return;
      }

      isDetectingRef.current = true;

      try {
        const video = videoRef.current;
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          isDetectingRef.current = false;
          liveIntervalRef.current = setTimeout(runFrame, 100);
          return;
        }

        // Create a temporary canvas to capture frame
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        // Convert to blob and detect
        const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/jpeg', 0.8));
        if (blob) {
          const file = blobToFile(blob, 'frame.jpg');
          const result = await detectObjects(file, { confidence: 0.3, filterInventory: true });

          if (result.detections) {
            setLiveDetections(result.detections);
          }

          // Calculate FPS
          frameCount++;
          const now = performance.now();
          if (now - lastTime >= 1000) {
            setFps(frameCount);
            frameCount = 0;
            lastTime = now;
          }
        }
      } catch (err) {
        console.error('Live detection error:', err);
      }

      isDetectingRef.current = false;

      // Run next frame (throttled to avoid overwhelming the server)
      if (liveMode) {
        liveIntervalRef.current = setTimeout(runFrame, 200); // ~5 fps max
      }
    };

    runFrame();
  };

  const stopLiveDetection = () => {
    if (liveIntervalRef.current) {
      clearTimeout(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
    isDetectingRef.current = false;
    setLiveDetections([]);
    setFps(0);
  };

  const drawLiveOverlay = () => {
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;
    if (!video || !overlay) return;

    const rect = video.getBoundingClientRect();
    overlay.width = rect.width;
    overlay.height = rect.height;

    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (liveDetections.length === 0) return;

    // Scale factors from video resolution to display size
    const scaleX = rect.width / video.videoWidth;
    const scaleY = rect.height / video.videoHeight;

    liveDetections.forEach(det => {
      const { bbox, class_name, confidence } = det;

      // Scale bbox to display size
      const x1 = bbox.x1 * scaleX;
      const y1 = bbox.y1 * scaleY;
      const x2 = bbox.x2 * scaleX;
      const y2 = bbox.y2 * scaleY;

      // Draw bounding box
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      // Draw label background
      const label = `${class_name} ${(confidence * 100).toFixed(0)}%`;
      ctx.font = 'bold 14px system-ui';
      const textWidth = ctx.measureText(label).width;

      ctx.fillStyle = 'rgba(34, 197, 94, 0.9)';
      ctx.fillRect(x1, y1 - 22, textWidth + 8, 22);

      // Draw label text
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x1 + 4, y1 - 6);
    });
  };

  const capturePhoto = () => {
    console.log('📸 Capture button clicked!');
    console.log('  videoRef:', !!videoRef.current);

    if (!videoRef.current) {
      console.error('❌ Video ref not available');
      setError('Camera not ready. Please wait and try again.');
      return;
    }

    const video = videoRef.current;
    console.log('  video dimensions:', video.videoWidth, 'x', video.videoHeight);

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.error('❌ Video not ready - dimensions are 0');
      setError('Camera still loading. Please wait a moment.');
      return;
    }

    // Create a temporary canvas for capturing (don't rely on canvasRef)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;

    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    console.log('✅ Frame captured to canvas');

    tempCanvas.toBlob(blob => {
      if (blob) {
        console.log('✅ Blob created:', blob.size, 'bytes');
        setCapturedImage(URL.createObjectURL(blob));
        runDetection(blobToFile(blob, 'capture.jpg'));
      } else {
        console.error('❌ Failed to create blob from canvas');
        setError('Failed to capture image. Please try again.');
      }
    }, 'image/jpeg', 0.9);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');

    if (isHeic) {
      setCapturedImage('heic-placeholder');
    } else {
      setCapturedImage(URL.createObjectURL(file));
    }
    runDetection(file);
  };

  const runDetection = async (file) => {
    setIsDetecting(true);
    setError(null);
    setDetectionResult(null);

    console.log('Starting detection for file:', file.name, 'Type:', file.type, 'Size:', file.size);

    try {
      const result = await detectObjects(file, { confidence: 0.3, filterInventory: true });
      console.log('Detection result:', result);
      setDetectionResult(result);

      if (result.detections?.length > 0 && canvasRef.current) {
        drawDetections(result.detections);
      }
    } catch (err) {
      console.error('Detection error:', err);
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
    setError(null);
    if (mode === 'camera') startCamera();
  };

  const serviceUnavailable = !serviceStatus || serviceStatus.status === 'unavailable' || serviceStatus.status === 'offline';

  if (serviceUnavailable) {
    return (
      <div className="detect-placeholder">
        <div className="detect-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="64" height="64">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
        </div>
        <h2>AI Detection</h2>
        <p className="detect-subtitle">YOLOv10 Object Detection</p>
        <div className="detect-status">Service Starting...</div>
        <p className="detect-description">
          The detection service is initializing. This may take a moment on first load.
        </p>
        <button className="btn btn-primary" onClick={() => checkHealth().then(setServiceStatus)} style={{ marginTop: '1rem' }}>
          Check Status
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

      <div className="detect-camera-container" style={{ position: 'relative' }}>
        {mode === 'camera' && !capturedImage && (
          <>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block' }} />
            {liveMode && (
              <canvas
                ref={overlayCanvasRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none'
                }}
              />
            )}
            {liveMode && (
              <div style={{
                position: 'absolute',
                top: 8,
                left: 8,
                background: 'rgba(0,0,0,0.7)',
                color: '#22c55e',
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 'bold'
              }}>
                LIVE {fps > 0 && `• ${fps} fps`} • {liveDetections.length} objects
              </div>
            )}
          </>
        )}

        {capturedImage && capturedImage !== 'heic-placeholder' && (
          <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} />
        )}

        {capturedImage === 'heic-placeholder' && (
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
          <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className={`btn ${liveMode ? 'btn-secondary' : 'btn-primary'} btn-lg`}
                onClick={capturePhoto}
                disabled={liveMode}
                style={{ flex: 1 }}
              >
                Capture & Detect
              </button>
              <button
                className={`btn ${liveMode ? 'btn-primary' : 'btn-secondary'} btn-lg`}
                onClick={() => setLiveMode(!liveMode)}
                style={{ flex: 1 }}
              >
                {liveMode ? 'Stop Live' : 'Live Detect'}
              </button>
            </div>
            {liveMode && liveDetections.length > 0 && (
              <div style={{
                background: 'var(--card-bg, #f3f4f6)',
                padding: '0.75rem',
                borderRadius: 8,
                fontSize: 14
              }}>
                <strong>Detected:</strong> {[...new Set(liveDetections.map(d => d.class_name))].join(', ')}
              </div>
            )}
          </div>
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
            {detectionResult.summary.map((item, idx) => (
              <div key={idx} className="detect-item-row">
                <div className="detect-item-info">
                  <span className="detect-item-name">{item.class_name}</span>
                  <span className="detect-item-conf">{(item.avg_confidence * 100).toFixed(0)}% confidence</span>
                </div>
                <div className="detect-item-count">x{item.count}</div>
              </div>
            ))}
          </div>
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
          console.error('Auth check failed:', err);
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
        console.error('API lookup error:', err);
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
          console.error('Product lookup error:', err);
        }

        setLookupData(productInfo);
        setSelectedItem(null);
        setShowItemModal(true);

        if (productInfo?.name) {
          showAlert('success', `Found: ${productInfo.name}`);
        }
      }
    } catch (err) {
      console.error('Scan handling error:', err);
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
        <SettingsMenu
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
          userName={user?.name}
          onLogout={handleLogout}
        />
        <h1 onClick={() => setView('home')} style={{ cursor: 'pointer' }}>Mike's Inventory Manager</h1>
        <div className="header-spacer" />
      </header>

      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.message}
        </div>
      )}

      <nav className="nav">
        <button
          className={`nav-btn ${view === 'home' ? 'active' : ''}`}
          onClick={() => setView('home')}
        >
          Home
        </button>
        <button
          className={`nav-btn ${view === 'detect' ? 'active' : ''}`}
          onClick={() => setView('detect')}
        >
          Detect
        </button>
        <button
          className={`nav-btn ${view === 'scan' ? 'active' : ''}`}
          onClick={() => setView('scan')}
        >
          Scan
        </button>
        <button
          className={`nav-btn ${view === 'list' ? 'active' : ''}`}
          onClick={() => { setStockFilter(null); setView('list'); }}
        >
          Inventory
        </button>
        <button
          className={`nav-btn ${view === 'restock' ? 'active' : ''}`}
          onClick={() => setView('restock')}
        >
          Restock
          {restockList.length > 0 && (
            <span className="nav-badge">{restockList.length}</span>
          )}
        </button>
        <button
          className={`nav-btn ${view === 'waste' ? 'active' : ''}`}
          onClick={() => setView('waste')}
        >
          Waste
        </button>
      </nav>

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
                        <div className="icon">{getCategoryIcon(scan.category)}</div>
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
          onItemClick={handleItemClick}
          onNavigate={handleNavigateToInventory}
          onEditThreshold={handleEditThreshold}
          onAddToRestock={addToRestockList}
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

      {view === 'detect' && (
        <DetectView />
      )}

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
