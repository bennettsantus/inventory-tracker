const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

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

// Get all inventory items
app.get('/api/items', (req, res) => {
  try {
    const items = db.getAll();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get low stock items
app.get('/api/items/low-stock', (req, res) => {
  try {
    const items = db.getLowStock();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get categories
app.get('/api/categories', (req, res) => {
  try {
    const categories = db.getCategories();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get item by barcode
app.get('/api/items/barcode/:barcode', (req, res) => {
  try {
    const item = db.getByBarcode(req.params.barcode);
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
app.get('/api/items/:id', (req, res) => {
  try {
    const item = db.getById(parseInt(req.params.id));
    if (item) {
      res.json(item);
    } else {
      res.status(404).json({ error: 'Item not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new item
app.post('/api/items', (req, res) => {
  try {
    const { barcode, name, category, unit_type, current_quantity, min_quantity } = req.body;

    if (!barcode || !name) {
      return res.status(400).json({ error: 'Barcode and name are required' });
    }

    // Check if barcode already exists
    const existing = db.getByBarcode(barcode);
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
    });

    res.status(201).json(newItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update item
app.put('/api/items/:id', (req, res) => {
  try {
    const { name, category, unit_type, current_quantity, min_quantity } = req.body;
    const id = parseInt(req.params.id);

    const existing = db.getById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updatedItem = db.update(id, {
      name: name || existing.name,
      category: category || existing.category,
      unit_type: unit_type || existing.unit_type,
      current_quantity: current_quantity ?? existing.current_quantity,
      min_quantity: min_quantity ?? existing.min_quantity
    });

    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Quick quantity update
app.patch('/api/items/:id/quantity', (req, res) => {
  try {
    const { quantity } = req.body;
    const id = parseInt(req.params.id);

    const existing = db.getById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updatedItem = db.updateQuantity(id, quantity);
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete item
app.delete('/api/items/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = db.getById(id);

    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    db.deleteItem(id);
    res.json({ message: 'Item deleted successfully' });
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
