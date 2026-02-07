/**
 * server.js - Inventory Tracker API Server
 *
 * Express.js REST API for Mike's restaurant inventory system.
 * Handles authentication (JWT), inventory CRUD, usage analytics,
 * and waste tracking. All data is stored in PostgreSQL.
 *
 * Endpoints:
 *   POST /api/auth/signup     - Create new account
 *   POST /api/auth/login      - Sign in and receive JWT
 *   GET  /api/auth/me         - Get current user info
 *   GET  /api/items           - List all inventory items with analytics
 *   GET  /api/items/low-stock - List items below minimum threshold
 *   GET  /api/categories      - List distinct categories
 *   GET  /api/items/barcode/:barcode - Look up item by barcode
 *   GET  /api/items/:id       - Get single item
 *   GET  /api/items/:id/usage - Get usage analytics for item
 *   POST /api/items           - Create new item
 *   PUT  /api/items/:id       - Update item
 *   PATCH /api/items/:id/quantity - Quick quantity update
 *   DELETE /api/items/:id     - Delete item
 *   POST /api/waste           - Record waste event
 *   GET  /api/waste           - List waste records
 *   GET  /api/waste/analytics - Waste analytics summary
 *   GET  /api/items/:id/waste - Waste history for item
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('./database');

/* === Server Configuration === */

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// JWT tokens expire after 30 days
const JWT_EXPIRY = '30d';

// Minimum password length for signup
const MIN_PASSWORD_LENGTH = 6;

// Default number of days for analytics queries
const DEFAULT_ANALYTICS_DAYS = 30;

// Require DATABASE_URL in production to prevent silent failures
const hasDbUrl = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_PUBLIC_URL;
if (isProduction && !hasDbUrl) {
  console.error('FATAL: No database URL found. Set DATABASE_URL in environment variables.');
  process.exit(1);
}

// WARNING: In production, always set JWT_SECRET to a strong random value.
// The default key is only for local development.
if (isProduction && !process.env.JWT_SECRET) {
  console.error('WARNING: JWT_SECRET not set. Set JWT_SECRET in environment variables for security.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'inventory-app-secret-key-change-in-production';

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

// In production, serve the frontend build from the same server
if (isProduction) {
  const frontendPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendPath));
}

/* === Helper: Validate ID Parameter === */

function parseId(raw) {
  const id = parseInt(raw, 10);
  if (isNaN(id) || id <= 0) return null;
  return id;
}

function parseDays(raw) {
  const days = parseInt(raw, 10);
  if (isNaN(days) || days <= 0) return DEFAULT_ANALYTICS_DAYS;
  return Math.min(days, 365);
}

/* === Auth Middleware === */

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

/* === Auth Endpoints === */

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const existing = await db.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const user = await db.createUser(email, password, name);
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name },
      token
    });
  } catch (error) {
    console.error('Signup error:', error.message);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db.verifyPassword(email, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Failed to sign in' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error.message);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/* === Inventory Endpoints === */

app.get('/api/items', authenticateToken, async (req, res) => {
  try {
    const items = await db.getAllWithAnalytics(req.user.id);
    res.json(items);
  } catch (error) {
    console.error('Get items error:', error.message);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

app.get('/api/items/low-stock', authenticateToken, async (req, res) => {
  try {
    const items = await db.getLowStock(req.user.id);
    res.json(items);
  } catch (error) {
    console.error('Get low stock error:', error.message);
    res.status(500).json({ error: 'Failed to fetch low stock items' });
  }
});

app.get('/api/categories', authenticateToken, async (req, res) => {
  try {
    const categories = await db.getCategories(req.user.id);
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error.message);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.get('/api/items/barcode/:barcode', authenticateToken, async (req, res) => {
  try {
    const item = await db.getByBarcode(req.params.barcode, req.user.id);
    if (item) {
      res.json(item);
    } else {
      res.status(404).json({ error: 'Item not found' });
    }
  } catch (error) {
    console.error('Get item by barcode error:', error.message);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

app.get('/api/items/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid item ID' });

    const item = await db.getById(id, req.user.id);
    if (item) {
      res.json(item);
    } else {
      res.status(404).json({ error: 'Item not found' });
    }
  } catch (error) {
    console.error('Get item error:', error.message);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

app.get('/api/items/:id/usage', authenticateToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid item ID' });

    const days = parseDays(req.query.days);

    const item = await db.getById(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const history = await db.getUsageHistory(id, days);
    const analytics = await db.getDailyAverage(id, days);

    res.json({
      item,
      history,
      analytics: {
        ...analytics,
        daysRemaining: analytics.averagePerDay > 0
          ? Math.floor(item.current_quantity / analytics.averagePerDay)
          : null
      }
    });
  } catch (error) {
    console.error('Get usage error:', error.message);
    res.status(500).json({ error: 'Failed to fetch usage data' });
  }
});

app.post('/api/items', authenticateToken, async (req, res) => {
  try {
    const { barcode, name, category, unit_type, current_quantity, min_quantity } = req.body;

    if (!barcode || !name) {
      return res.status(400).json({ error: 'Barcode and name are required' });
    }

    const existing = await db.getByBarcode(barcode, req.user.id);
    if (existing) {
      return res.status(409).json({ error: 'Item with this barcode already exists' });
    }

    const newItem = await db.insert({
      barcode,
      name,
      category: category || 'Uncategorized',
      unit_type: unit_type || 'units',
      current_quantity: Math.max(0, current_quantity || 0),
      min_quantity: Math.max(0, min_quantity || 0)
    }, req.user.id);

    res.status(201).json(newItem);
  } catch (error) {
    console.error('Create item error:', error.message);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

app.put('/api/items/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid item ID' });

    const { name, category, unit_type, current_quantity, min_quantity } = req.body;

    const existing = await db.getById(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updatedItem = await db.update(id, {
      name: name || existing.name,
      category: category || existing.category,
      unit_type: unit_type || existing.unit_type,
      current_quantity: current_quantity ?? existing.current_quantity,
      min_quantity: min_quantity ?? existing.min_quantity
    }, req.user.id);

    res.json(updatedItem);
  } catch (error) {
    console.error('Update item error:', error.message);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

app.patch('/api/items/:id/quantity', authenticateToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid item ID' });

    const { quantity } = req.body;
    if (quantity === undefined || quantity === null || typeof quantity !== 'number') {
      return res.status(400).json({ error: 'Quantity is required and must be a number' });
    }
    if (quantity < 0) {
      return res.status(400).json({ error: 'Quantity cannot be negative' });
    }

    const existing = await db.getById(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updatedItem = await db.updateQuantity(id, quantity, req.user.id);
    res.json(updatedItem);
  } catch (error) {
    console.error('Update quantity error:', error.message);
    res.status(500).json({ error: 'Failed to update quantity' });
  }
});

app.delete('/api/items/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid item ID' });

    const existing = await db.getById(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await db.deleteItem(id, req.user.id);
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Delete item error:', error.message);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

/* === Waste Tracking Endpoints === */

app.post('/api/waste', authenticateToken, async (req, res) => {
  try {
    const { item_id, quantity, reason, notes, cost_estimate } = req.body;

    if (!item_id || !quantity || !reason) {
      return res.status(400).json({ error: 'item_id, quantity, and reason are required' });
    }

    if (quantity <= 0) {
      return res.status(400).json({ error: 'Waste quantity must be greater than 0' });
    }

    const item = await db.getById(item_id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updatedItem = await db.recordWaste(item_id, quantity, reason, notes, cost_estimate, req.user.id);
    res.status(201).json({ message: 'Waste recorded', item: updatedItem });
  } catch (error) {
    console.error('Record waste error:', error.message);
    res.status(500).json({ error: 'Failed to record waste' });
  }
});

app.get('/api/waste', authenticateToken, async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const waste = await db.getAllWaste(days, req.user.id);
    res.json(waste);
  } catch (error) {
    console.error('Get waste error:', error.message);
    res.status(500).json({ error: 'Failed to fetch waste records' });
  }
});

app.get('/api/waste/analytics', authenticateToken, async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const analytics = await db.getWasteAnalytics(days, req.user.id);
    res.json(analytics);
  } catch (error) {
    console.error('Get waste analytics error:', error.message);
    res.status(500).json({ error: 'Failed to fetch waste analytics' });
  }
});

app.get('/api/items/:id/waste', authenticateToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid item ID' });

    const days = parseDays(req.query.days);

    const item = await db.getById(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const history = await db.getWasteHistory(id, days, req.user.id);
    res.json({ item, history });
  } catch (error) {
    console.error('Get item waste error:', error.message);
    res.status(500).json({ error: 'Failed to fetch waste history' });
  }
});

/* === Frontend Catch-All (Production Only) === */

if (isProduction) {
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

/* === Start Server === */

db.initDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${isProduction ? 'production' : 'development'}`);
    console.log(`Database: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'No DATABASE_URL set'}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
