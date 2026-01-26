const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'inventory-app-secret-key-change-in-production';

// CORS configuration - allow all origins for flexibility
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

// Serve static files from frontend build in production
if (isProduction) {
  const frontendPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendPath));
}

// ============ AUTH MIDDLEWARE ============
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

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

// ============ AUTH ENDPOINTS ============

// Sign up
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existing = db.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const user = await db.createUser(email, password, name);
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name },
      token
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sign in
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

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  try {
    const user = db.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ PROTECTED INVENTORY ENDPOINTS ============

// Get all inventory items (with usage analytics)
app.get('/api/items', authenticateToken, (req, res) => {
  try {
    const items = db.getAllWithAnalytics(req.user.id);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get low stock items
app.get('/api/items/low-stock', authenticateToken, (req, res) => {
  try {
    const items = db.getLowStock(req.user.id);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get categories
app.get('/api/categories', authenticateToken, (req, res) => {
  try {
    const categories = db.getCategories(req.user.id);
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get item by barcode
app.get('/api/items/barcode/:barcode', authenticateToken, (req, res) => {
  try {
    const item = db.getByBarcode(req.params.barcode, req.user.id);
    if (item) {
      res.json(item);
    } else {
      res.status(404).json({ error: 'Item not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get item by ID
app.get('/api/items/:id', authenticateToken, (req, res) => {
  try {
    const item = db.getById(parseInt(req.params.id), req.user.id);
    if (item) {
      res.json(item);
    } else {
      res.status(404).json({ error: 'Item not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get usage history for an item
app.get('/api/items/:id/usage', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const days = parseInt(req.query.days) || 30;

    const item = db.getById(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const history = db.getUsageHistory(id, days);
    const analytics = db.getDailyAverage(id, days);

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
    res.status(500).json({ error: error.message });
  }
});

// Create new item
app.post('/api/items', authenticateToken, (req, res) => {
  try {
    const { barcode, name, category, unit_type, current_quantity, min_quantity } = req.body;

    if (!barcode || !name) {
      return res.status(400).json({ error: 'Barcode and name are required' });
    }

    // Check if barcode already exists for this user
    const existing = db.getByBarcode(barcode, req.user.id);
    if (existing) {
      return res.status(409).json({ error: 'Item with this barcode already exists' });
    }

    const newItem = db.insert({
      barcode,
      name,
      category: category || 'Uncategorized',
      unit_type: unit_type || 'units',
      current_quantity: current_quantity || 0,
      min_quantity: min_quantity || 0
    }, req.user.id);

    res.status(201).json(newItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update item
app.put('/api/items/:id', authenticateToken, (req, res) => {
  try {
    const { name, category, unit_type, current_quantity, min_quantity } = req.body;
    const id = parseInt(req.params.id);

    const existing = db.getById(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updatedItem = db.update(id, {
      name: name || existing.name,
      category: category || existing.category,
      unit_type: unit_type || existing.unit_type,
      current_quantity: current_quantity ?? existing.current_quantity,
      min_quantity: min_quantity ?? existing.min_quantity
    }, req.user.id);

    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Quick quantity update
app.patch('/api/items/:id/quantity', authenticateToken, (req, res) => {
  try {
    const { quantity } = req.body;
    const id = parseInt(req.params.id);

    const existing = db.getById(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updatedItem = db.updateQuantity(id, quantity, req.user.id);
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete item
app.delete('/api/items/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = db.getById(id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    db.deleteItem(id, req.user.id);
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ WASTE TRACKING ENDPOINTS ============

// Record waste
app.post('/api/waste', authenticateToken, (req, res) => {
  try {
    const { item_id, quantity, reason, notes, cost_estimate } = req.body;

    if (!item_id || !quantity || !reason) {
      return res.status(400).json({ error: 'item_id, quantity, and reason are required' });
    }

    const item = db.getById(item_id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updatedItem = db.recordWaste(item_id, quantity, reason, notes, cost_estimate, req.user.id);
    res.status(201).json({ message: 'Waste recorded', item: updatedItem });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all waste records
app.get('/api/waste', authenticateToken, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const waste = db.getAllWaste(days, req.user.id);
    res.json(waste);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get waste analytics
app.get('/api/waste/analytics', authenticateToken, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const analytics = db.getWasteAnalytics(days, req.user.id);
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get waste history for specific item
app.get('/api/items/:id/waste', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const days = parseInt(req.query.days) || 30;

    const item = db.getById(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const history = db.getWasteHistory(id, days, req.user.id);
    res.json({ item, history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend for any non-API route in production (SPA catch-all)
if (isProduction) {
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

// Initialize database and start server
db.initDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${isProduction ? 'production' : 'development'}`);
    if (isProduction) {
      console.log('Serving static frontend from ../frontend/dist');
    }
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
