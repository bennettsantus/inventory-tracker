import { useState, useEffect, useRef, useCallback, Component } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

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
  async getItems() {
    const res = await fetch(`${API_BASE}/items`);
    if (!res.ok) throw new Error('Failed to fetch items');
    return res.json();
  },

  async getItemByBarcode(barcode) {
    const res = await fetch(`${API_BASE}/items/barcode/${barcode}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch item');
    return res.json();
  },

  async createItem(item) {
    const res = await fetch(`${API_BASE}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error('Failed to update item');
    return res.json();
  },

  async updateQuantity(id, quantity) {
    const res = await fetch(`${API_BASE}/items/${id}/quantity`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });
    if (!res.ok) throw new Error('Failed to update quantity');
    return res.json();
  },

  async deleteItem(id) {
    const res = await fetch(`${API_BASE}/items/${id}`, { method: 'DELETE' });
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
function QuantityInput({ value, onChange, unit }) {
  const increment = () => onChange(Math.max(0, value + 1));
  const decrement = () => onChange(Math.max(0, value - 1));

  return (
    <div className="quantity-input">
      <button className="quantity-btn minus" onClick={decrement}>−</button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => {
          const val = e.target.value.replace(/[^0-9.]/g, '');
          onChange(Math.max(0, parseFloat(val) || 0));
        }}
        min="0"
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
              />
              <span className="threshold-unit">{formData.unit_type}</span>
            </div>
            <div className="threshold-suggestions">
              <span className="suggestion-label">Quick set:</span>
              {[5, 10, 15, 20].map(val => (
                <button
                  key={val}
                  type="button"
                  className={`suggestion-btn ${formData.min_quantity === val ? 'active' : ''}`}
                  onClick={() => setFormData({ ...formData, min_quantity: val })}
                >
                  {val}
                </button>
              ))}
              <button
                type="button"
                className={`suggestion-btn ${formData.min_quantity === getDefaultThreshold(formData.category) ? 'active' : ''}`}
                onClick={() => setFormData({ ...formData, min_quantity: getDefaultThreshold(formData.category) })}
              >
                Auto ({getDefaultThreshold(formData.category)})
              </button>
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

        <div className="threshold-suggestions">
          <span className="suggestion-label">Quick:</span>
          {[0, 5, 10, 15, 20, 25].map(val => (
            <button
              key={val}
              type="button"
              className={`suggestion-btn ${threshold === val ? 'active' : ''}`}
              onClick={() => setThreshold(val)}
            >
              {val === 0 ? 'Off' : val}
            </button>
          ))}
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

// Quick Update Modal (for existing items)
function QuickUpdateModal({ item, onSave, onClose, onEdit, onEditThreshold, onUpdateCategory, categories = [] }) {
  const [mode, setMode] = useState('add'); // 'add' or 'set'
  const [amount, setAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);

  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...categories])].filter(c => c !== 'Uncategorized').sort();

  const newTotal = mode === 'add'
    ? Math.max(0, item.current_quantity + amount)
    : Math.max(0, amount);

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
              {item.min_quantity > 0 ? '⚙️ Adjust' : '+ Set Alert'}
            </button>
          </div>
          {stockStatus === 'low' && (
            <div className="stock-warning">⚠️ {getStockSeverity(item.current_quantity, item.min_quantity)}% below target</div>
          )}
        </div>

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
          <QuantityInput value={amount} onChange={setAmount} unit={item.unit_type} />
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
                {status === 'low' ? `${severity}% below` : status === 'medium' ? 'Getting low' : 'OK'}
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
function Dashboard({ items, onItemClick, onNavigate, onEditThreshold }) {
  const totalItems = items.length;

  // Get low stock items and sort by severity (most critical first)
  const lowStockItems = items
    .filter((i) => i.current_quantity <= i.min_quantity && i.min_quantity > 0)
    .sort((a, b) => getStockSeverity(b.current_quantity, b.min_quantity) - getStockSeverity(a.current_quantity, a.min_quantity));

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
        <div className="alert-banner danger" onClick={() => onNavigate?.('low')}>
          <div className="alert-banner-icon">🚨</div>
          <div className="alert-banner-content">
            <strong>{lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} need restocking</strong>
            <span>Tap to view low stock items</span>
          </div>
        </div>
      )}

      {lowStockItems.length === 0 && items.length > 0 && (
        <div className="alert-banner success">
          <div className="alert-banner-icon">✅</div>
          <div className="alert-banner-content">
            <strong>All items well stocked!</strong>
            <span>No items below minimum threshold</span>
          </div>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card primary clickable" onClick={() => onNavigate?.('all')}>
          <div className="stat-icon">📦</div>
          <div className="stat-value">{totalItems}</div>
          <div className="stat-label">Total Items</div>
        </div>
        <div className={`stat-card ${lowStockItems.length > 0 ? 'danger' : 'success'} clickable`} onClick={() => onNavigate?.('low')}>
          <div className="stat-icon">{lowStockItems.length > 0 ? '⚠️' : '✅'}</div>
          <div className="stat-value">{lowStockItems.length}</div>
          <div className="stat-label">Low Stock</div>
        </div>
        <div className="stat-card warning clickable" onClick={() => onNavigate?.('medium')}>
          <div className="stat-icon">⚡</div>
          <div className="stat-value">{mediumStockItems.length}</div>
          <div className="stat-label">Running Low</div>
        </div>
        <div className="stat-card success clickable" onClick={() => onNavigate?.('good')}>
          <div className="stat-icon">✓</div>
          <div className="stat-value">{goodStockItems.length}</div>
          <div className="stat-label">Well Stocked</div>
        </div>
      </div>

      {/* Low Stock Items - Priority Section */}
      {lowStockItems.length > 0 && (
        <div className="alert-section">
          <div className="section-header danger">
            <span className="section-icon">🚨</span>
            <span>Low Stock Alerts</span>
            <span className={`alert-count-badge ${lowStockItems.length >= 3 ? 'critical' : 'warning'}`}>
              {lowStockItems.length}
            </span>
          </div>
          <div className="alert-list">
            {lowStockItems.map((item) => {
              const percentage = getStockPercentage(item.current_quantity, item.min_quantity);
              const needed = item.min_quantity - item.current_quantity;
              // Severity based on percentage remaining
              const severityClass = percentage <= 25 ? 'critical' : percentage <= 50 ? 'high' : 'moderate';
              const severityLabel = percentage <= 25 ? 'CRITICAL' : percentage <= 50 ? 'LOW' : 'RUNNING LOW';

              return (
                <div key={item.id} className={`alert-card ${severityClass}`}>
                  <div className="alert-card-content" onClick={() => onItemClick?.(item)}>
                    <div className="alert-card-left">
                      <div className="alert-card-icon">{getCategoryIcon(item.category)}</div>
                      <div className="alert-card-info">
                        <div className="alert-card-name">{item.name}</div>
                        <div className={`alert-card-status ${severityClass}`}>
                          Need {needed} more {item.unit_type}
                        </div>
                      </div>
                    </div>
                    <div className="alert-card-right">
                      <div className="alert-card-quantity">
                        <span className="qty-current">{item.current_quantity}</span>
                        <span className="qty-separator">/</span>
                        <span className="qty-target">{item.min_quantity}</span>
                      </div>
                      <div className={`alert-card-label ${severityClass}`}>{severityLabel}</div>
                    </div>
                  </div>
                  <div className="alert-card-actions">
                    <button className="alert-btn primary" onClick={() => onItemClick?.(item)}>
                      + Restock
                    </button>
                    <button className="alert-btn secondary" onClick={(e) => { e.stopPropagation(); onEditThreshold?.(item); }}>
                      Adjust Alert
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mediumStockItems.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>⚡</span> Running Low
          </div>
          <div className="inventory-list">
            {mediumStockItems.map((item) => (
              <div
                key={item.id}
                className="inventory-item medium-stock"
                onClick={() => onItemClick?.(item)}
                style={{ cursor: 'pointer' }}
              >
                <div className="item-info">
                  <div className="item-name">{getCategoryIcon(item.category)} {item.name}</div>
                  <div className="item-meta">
                    <span className="category-badge">{item.category}</span>
                  </div>
                </div>
                <div className="item-quantity medium">
                  <div className="value">{item.current_quantity}</div>
                  <div className="unit">{item.unit_type}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
          <p>No inventory items yet</p>
          <p style={{ fontSize: '0.875rem' }}>Go to Scan to add your first item</p>
        </div>
      )}
    </div>
  );
}

// Main App Component
function AppContent() {
  const [view, setView] = useState('home');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scannedBarcode, setScannedBarcode] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showQuickUpdate, setShowQuickUpdate] = useState(false);
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [alert, setAlert] = useState(null);
  const [customCategories, setCustomCategories] = useState([]);
  const [recentScans, setRecentScans] = useState([]);
  const [showScanSuccess, setShowScanSuccess] = useState(false);
  const [stockFilter, setStockFilter] = useState(null); // 'low', 'medium', 'good', or null
  const [cameFromQuickUpdate, setCameFromQuickUpdate] = useState(false);

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
    loadItems();
  }, []);

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

  return (
    <div className="app">
      <header className="header">
        <h1>
          <span className="header-primary">INVENTORY</span>
          <span className="header-secondary">tracker</span>
        </h1>
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
              {recentScans.map((scan) => (
                <div
                  key={scan.barcode}
                  className="recent-scan-item"
                  onClick={() => handleItemClick(scan)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="info">
                    <div className="icon">{getCategoryIcon(scan.category)}</div>
                    <div>
                      <div className="name">{scan.name}</div>
                      <div className="time">{scan.current_quantity} {scan.unit_type}</div>
                    </div>
                  </div>
                  <div style={{ color: 'var(--gray-400)', fontSize: '0.75rem' }}>
                    {scan.scannedAt && new Date(scan.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
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

      {view === 'home' && <Dashboard items={items} onItemClick={handleItemClick} onNavigate={handleNavigateToInventory} onEditThreshold={handleEditThreshold} />}

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
          categories={customCategories}
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
