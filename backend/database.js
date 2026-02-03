const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// In production (Railway), use persistent volume at /data; locally use the backend folder
const DB_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'inventory.db')
  : path.join(__dirname, 'inventory.db');

let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create items table with user_id
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      barcode TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Uncategorized',
      unit_type TEXT DEFAULT 'units',
      current_quantity REAL DEFAULT 0,
      min_quantity REAL DEFAULT 0,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Add user_id column if it doesn't exist (migration for existing data)
  try {
    db.run(`ALTER TABLE items ADD COLUMN user_id INTEGER REFERENCES users(id)`);
  } catch (e) {
    // Column already exists
  }

  // Create unique index on barcode + user_id (each user can have same barcode)
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_barcode_user ON items(barcode, user_id)`);

  // Usage history table for tracking consumption patterns
  db.run(`
    CREATE TABLE IF NOT EXISTS usage_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      quantity_used REAL NOT NULL,
      recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      day_of_week INTEGER,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )
  `);

  // Delivery schedule table
  db.run(`
    CREATE TABLE IF NOT EXISTS delivery_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      delivery_days TEXT NOT NULL,
      lead_time_days INTEGER DEFAULT 1
    )
  `);

  // Waste tracking table
  db.run(`
    CREATE TABLE IF NOT EXISTS waste_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      reason TEXT NOT NULL,
      notes TEXT,
      cost_estimate REAL,
      recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_barcode ON items(barcode)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_category ON items(category)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_usage_item ON usage_history(item_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_waste_item ON waste_log(item_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_history(recorded_at)`);

  saveDatabase();
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function getAll(userId) {
  const stmt = db.prepare('SELECT * FROM items WHERE user_id = ? ORDER BY category, name');
  stmt.bind([userId]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getByBarcode(barcode, userId) {
  const stmt = db.prepare('SELECT * FROM items WHERE barcode = ? AND user_id = ?');
  stmt.bind([barcode, userId]);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function getById(id, userId) {
  const stmt = db.prepare('SELECT * FROM items WHERE id = ? AND user_id = ?');
  stmt.bind([id, userId]);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function getLowStock(userId) {
  const stmt = db.prepare('SELECT * FROM items WHERE user_id = ? AND current_quantity <= min_quantity ORDER BY name');
  stmt.bind([userId]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function insert(item, userId) {
  const stmt = db.prepare(`
    INSERT INTO items (user_id, barcode, name, category, unit_type, current_quantity, min_quantity, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run([userId, item.barcode, item.name, item.category, item.unit_type, item.current_quantity, item.min_quantity]);
  stmt.free();
  saveDatabase();

  // Get the inserted row by barcode (more reliable with sql.js)
  return getByBarcode(item.barcode, userId);
}

function update(id, item, userId) {
  const stmt = db.prepare(`
    UPDATE items
    SET name = ?, category = ?, unit_type = ?, current_quantity = ?, min_quantity = ?, last_updated = datetime('now')
    WHERE id = ? AND user_id = ?
  `);
  stmt.run([item.name, item.category, item.unit_type, item.current_quantity, item.min_quantity, id, userId]);
  stmt.free();
  saveDatabase();
  return getById(id, userId);
}

function updateQuantity(id, quantity, userId) {
  // Get current quantity to calculate usage
  const currentItem = getById(id, userId);
  if (!currentItem) return null;

  const previousQty = currentItem.current_quantity;
  const difference = previousQty - quantity;

  // If quantity decreased, record as usage
  if (difference > 0) {
    recordUsage(id, difference);
  }

  const stmt = db.prepare(`
    UPDATE items
    SET current_quantity = ?, last_updated = datetime('now')
    WHERE id = ? AND user_id = ?
  `);
  stmt.run([quantity, id, userId]);
  stmt.free();
  saveDatabase();
  return getById(id, userId);
}

// Record usage for an item
function recordUsage(itemId, quantityUsed) {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

  const stmt = db.prepare(`
    INSERT INTO usage_history (item_id, quantity_used, recorded_at, day_of_week)
    VALUES (?, ?, datetime('now'), ?)
  `);
  stmt.run([itemId, quantityUsed, dayOfWeek]);
  stmt.free();
  saveDatabase();
}

// Get usage history for an item (last N days)
function getUsageHistory(itemId, days = 30) {
  const stmt = db.prepare(`
    SELECT * FROM usage_history
    WHERE item_id = ?
    AND recorded_at >= datetime('now', '-' || ? || ' days')
    ORDER BY recorded_at DESC
  `);
  stmt.bind([itemId, days]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Calculate average daily usage for an item
function getDailyAverage(itemId, days = 30) {
  const stmt = db.prepare(`
    SELECT COALESCE(SUM(quantity_used), 0) as total_used,
           COUNT(DISTINCT date(recorded_at)) as days_with_usage
    FROM usage_history
    WHERE item_id = ?
    AND recorded_at >= datetime('now', '-' || ? || ' days')
  `);
  stmt.bind([itemId, days]);
  let result = { total_used: 0, days_with_usage: 0 };
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();

  // Calculate average (use actual days passed, not just days with usage)
  const avgPerDay = result.total_used / Math.max(days, 1);
  return {
    totalUsed: result.total_used,
    daysTracked: days,
    daysWithUsage: result.days_with_usage,
    averagePerDay: Math.round(avgPerDay * 100) / 100
  };
}

// Get all items with their usage analytics
function getAllWithAnalytics(userId) {
  const items = getAll(userId);
  return items.map(item => {
    const usage = getDailyAverage(item.id, 30);
    const daysRemaining = usage.averagePerDay > 0
      ? Math.floor(item.current_quantity / usage.averagePerDay)
      : null; // null means we don't have enough data

    return {
      ...item,
      usage: {
        averagePerDay: usage.averagePerDay,
        daysRemaining: daysRemaining,
        daysTracked: usage.daysTracked,
        hasData: usage.daysWithUsage > 0
      }
    };
  });
}

function deleteItem(id, userId) {
  const stmt = db.prepare('DELETE FROM items WHERE id = ? AND user_id = ?');
  stmt.run([id, userId]);
  stmt.free();
  saveDatabase();
}

function getCategories(userId) {
  const stmt = db.prepare('SELECT DISTINCT category FROM items WHERE user_id = ? ORDER BY category');
  stmt.bind([userId]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject().category);
  }
  stmt.free();
  return results;
}

// Record waste for an item
function recordWaste(itemId, quantity, reason, notes = null, costEstimate = null, userId) {
  // Verify item belongs to user
  const item = getById(itemId, userId);
  if (!item) return null;

  const stmt = db.prepare(`
    INSERT INTO waste_log (item_id, quantity, reason, notes, cost_estimate, recorded_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run([itemId, quantity, reason, notes, costEstimate]);
  stmt.free();
  saveDatabase();

  // Also decrease the item quantity
  const newQty = Math.max(0, item.current_quantity - quantity);
  const updateStmt = db.prepare(`
    UPDATE items SET current_quantity = ?, last_updated = datetime('now') WHERE id = ? AND user_id = ?
  `);
  updateStmt.run([newQty, itemId, userId]);
  updateStmt.free();
  saveDatabase();

  return getById(itemId, userId);
}

// Get waste history for an item
function getWasteHistory(itemId, days = 30, userId) {
  // Verify item belongs to user
  const item = getById(itemId, userId);
  if (!item) return [];

  const stmt = db.prepare(`
    SELECT * FROM waste_log
    WHERE item_id = ?
    AND recorded_at >= datetime('now', '-' || ? || ' days')
    ORDER BY recorded_at DESC
  `);
  stmt.bind([itemId, days]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Get all waste records (for reports)
function getAllWaste(days = 30, userId) {
  const stmt = db.prepare(`
    SELECT w.*, i.name as item_name, i.category, i.unit_type
    FROM waste_log w
    JOIN items i ON w.item_id = i.id
    WHERE i.user_id = ? AND w.recorded_at >= datetime('now', '-' || ? || ' days')
    ORDER BY w.recorded_at DESC
  `);
  stmt.bind([userId, days]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Get waste analytics summary
function getWasteAnalytics(days = 30, userId) {
  // Total waste by reason (filtered by user's items)
  const byReasonStmt = db.prepare(`
    SELECT w.reason, SUM(w.quantity) as total_quantity, COUNT(*) as count,
           SUM(COALESCE(w.cost_estimate, 0)) as total_cost
    FROM waste_log w
    JOIN items i ON w.item_id = i.id
    WHERE i.user_id = ? AND w.recorded_at >= datetime('now', '-' || ? || ' days')
    GROUP BY w.reason
    ORDER BY total_quantity DESC
  `);
  byReasonStmt.bind([userId, days]);
  const byReason = [];
  while (byReasonStmt.step()) {
    byReason.push(byReasonStmt.getAsObject());
  }
  byReasonStmt.free();

  // Top wasted items
  const topItemsStmt = db.prepare(`
    SELECT i.id, i.name, i.category, i.unit_type,
           SUM(w.quantity) as total_wasted,
           SUM(COALESCE(w.cost_estimate, 0)) as total_cost,
           COUNT(*) as waste_count
    FROM waste_log w
    JOIN items i ON w.item_id = i.id
    WHERE i.user_id = ? AND w.recorded_at >= datetime('now', '-' || ? || ' days')
    GROUP BY w.item_id
    ORDER BY total_wasted DESC
    LIMIT 10
  `);
  topItemsStmt.bind([userId, days]);
  const topItems = [];
  while (topItemsStmt.step()) {
    topItems.push(topItemsStmt.getAsObject());
  }
  topItemsStmt.free();

  // Total summary
  const summaryStmt = db.prepare(`
    SELECT SUM(w.quantity) as total_quantity,
           SUM(COALESCE(w.cost_estimate, 0)) as total_cost,
           COUNT(*) as total_records
    FROM waste_log w
    JOIN items i ON w.item_id = i.id
    WHERE i.user_id = ? AND w.recorded_at >= datetime('now', '-' || ? || ' days')
  `);
  summaryStmt.bind([userId, days]);
  let summary = { total_quantity: 0, total_cost: 0, total_records: 0 };
  if (summaryStmt.step()) {
    summary = summaryStmt.getAsObject();
  }
  summaryStmt.free();

  return {
    summary,
    byReason,
    topItems,
    days
  };
}

// ============ USER AUTHENTICATION ============

async function createUser(email, password, name) {
  const passwordHash = await bcrypt.hash(password, 10);
  const stmt = db.prepare(`
    INSERT INTO users (email, password_hash, name)
    VALUES (?, ?, ?)
  `);
  stmt.run([email.toLowerCase(), passwordHash, name]);
  stmt.free();
  saveDatabase();
  return getUserByEmail(email);
}

function getUserByEmail(email) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  stmt.bind([email.toLowerCase()]);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function getUserById(id) {
  const stmt = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?');
  stmt.bind([id]);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

async function verifyPassword(email, password) {
  const user = getUserByEmail(email);
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;
  // Return user without password hash
  return { id: user.id, email: user.email, name: user.name };
}

module.exports = {
  initDatabase,
  getAll,
  getAllWithAnalytics,
  getByBarcode,
  getById,
  getLowStock,
  insert,
  update,
  updateQuantity,
  deleteItem,
  getCategories,
  recordUsage,
  getUsageHistory,
  getDailyAverage,
  recordWaste,
  getWasteHistory,
  getAllWaste,
  getWasteAnalytics,
  // User authentication
  createUser,
  getUserByEmail,
  getUserById,
  verifyPassword
};
