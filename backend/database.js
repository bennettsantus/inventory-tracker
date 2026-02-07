/**
 * database.js - PostgreSQL Database Layer
 *
 * All database operations for the inventory tracker.
 * Uses connection pooling via the 'pg' module with parameterized
 * queries throughout to prevent SQL injection.
 *
 * Schema:
 *   users          - User accounts with bcrypt-hashed passwords
 *   items          - Inventory items, scoped per user via user_id
 *   usage_history  - Tracks quantity consumed over time (auto-recorded on quantity decrease)
 *   waste_log      - Manually logged waste events with reason and cost
 *   delivery_schedule - Delivery patterns (reserved for future use)
 *
 * Key relationships:
 *   users 1:N items (user_id FK)
 *   items 1:N usage_history (item_id FK, CASCADE delete)
 *   items 1:N waste_log (item_id FK, CASCADE delete)
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

/* === Connection Setup === */

// Support multiple Railway/Render database URL env var names
const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_PUBLIC_URL;

const poolConfig = { connectionString: dbUrl };
// Enable SSL for remote databases (not localhost)
if (dbUrl && !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

// Bcrypt hash rounds for password hashing
const BCRYPT_ROUNDS = 10;

// Top N items shown in waste analytics
const WASTE_TOP_ITEMS_LIMIT = 10;

/* === Schema Initialization === */

/**
 * Create all tables and indexes if they don't exist.
 * Safe to call on every server start (uses IF NOT EXISTS).
 */
async function initDatabase() {
  const client = await pool.connect();
  try {
    // Users table - authentication and multi-tenancy
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Items table - core inventory data, scoped per user
    await client.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        barcode TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT DEFAULT 'Uncategorized',
        unit_type TEXT DEFAULT 'units',
        current_quantity REAL DEFAULT 0,
        min_quantity REAL DEFAULT 0,
        last_updated TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Unique barcode per user (same barcode can exist for different users)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_barcode_user ON items(barcode, user_id)
    `);

    // Usage history - auto-recorded when quantity decreases
    await client.query(`
      CREATE TABLE IF NOT EXISTS usage_history (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        quantity_used REAL NOT NULL,
        recorded_at TIMESTAMPTZ DEFAULT NOW(),
        day_of_week INTEGER
      )
    `);

    // Delivery schedule - reserved for future delivery tracking feature
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_schedule (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        delivery_days TEXT NOT NULL,
        lead_time_days INTEGER DEFAULT 1
      )
    `);

    // Waste log - manually recorded waste events
    await client.query(`
      CREATE TABLE IF NOT EXISTS waste_log (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        quantity REAL NOT NULL,
        reason TEXT NOT NULL,
        notes TEXT,
        cost_estimate REAL,
        recorded_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Performance indexes for common queries
    await client.query(`CREATE INDEX IF NOT EXISTS idx_barcode ON items(barcode)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_category ON items(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_usage_item ON usage_history(item_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_waste_item ON waste_log(item_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_history(recorded_at)`);
  } finally {
    client.release();
  }
}

/* === Item Queries === */

/** Get all items for a user, sorted by category then name. */
async function getAll(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM items WHERE user_id = $1 ORDER BY category, name',
    [userId]
  );
  return rows;
}

/** Look up a single item by its barcode. */
async function getByBarcode(barcode, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM items WHERE barcode = $1 AND user_id = $2',
    [barcode, userId]
  );
  return rows[0] || null;
}

/** Get a single item by its database ID. */
async function getById(id, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM items WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return rows[0] || null;
}

/** Get items where current_quantity is at or below min_quantity. */
async function getLowStock(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM items WHERE user_id = $1 AND current_quantity <= min_quantity ORDER BY name',
    [userId]
  );
  return rows;
}

/** Insert a new inventory item. */
async function insert(item, userId) {
  const { rows } = await pool.query(
    `INSERT INTO items (user_id, barcode, name, category, unit_type, current_quantity, min_quantity, last_updated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING *`,
    [userId, item.barcode, item.name, item.category, item.unit_type, item.current_quantity, item.min_quantity]
  );
  return rows[0];
}

/** Update an existing inventory item's fields. */
async function update(id, item, userId) {
  const { rows } = await pool.query(
    `UPDATE items
     SET name = $1, category = $2, unit_type = $3, current_quantity = $4, min_quantity = $5, last_updated = NOW()
     WHERE id = $6 AND user_id = $7
     RETURNING *`,
    [item.name, item.category, item.unit_type, item.current_quantity, item.min_quantity, id, userId]
  );
  return rows[0] || null;
}

/**
 * Set an item's quantity. If the new quantity is lower than the previous,
 * automatically records the difference as usage in usage_history.
 */
async function updateQuantity(id, quantity, userId) {
  const currentItem = await getById(id, userId);
  if (!currentItem) return null;

  const previousQty = currentItem.current_quantity;
  const difference = previousQty - quantity;

  // Auto-record usage when quantity decreases
  if (difference > 0) {
    await recordUsage(id, difference);
  }

  const { rows } = await pool.query(
    `UPDATE items SET current_quantity = $1, last_updated = NOW() WHERE id = $2 AND user_id = $3 RETURNING *`,
    [quantity, id, userId]
  );
  return rows[0] || null;
}

/** Permanently delete an item and its associated usage/waste history (CASCADE). */
async function deleteItem(id, userId) {
  await pool.query('DELETE FROM items WHERE id = $1 AND user_id = $2', [id, userId]);
}

/** Get distinct category names for a user. */
async function getCategories(userId) {
  const { rows } = await pool.query(
    'SELECT DISTINCT category FROM items WHERE user_id = $1 ORDER BY category',
    [userId]
  );
  return rows.map(r => r.category);
}

/* === Usage Analytics === */

/** Record a usage event (called automatically by updateQuantity). */
async function recordUsage(itemId, quantityUsed) {
  const dayOfWeek = new Date().getDay();
  await pool.query(
    `INSERT INTO usage_history (item_id, quantity_used, recorded_at, day_of_week)
     VALUES ($1, $2, NOW(), $3)`,
    [itemId, quantityUsed, dayOfWeek]
  );
}

/** Get raw usage history records for an item within a time window. */
async function getUsageHistory(itemId, days = 30) {
  const { rows } = await pool.query(
    `SELECT * FROM usage_history
     WHERE item_id = $1
     AND recorded_at >= NOW() - INTERVAL '1 day' * $2
     ORDER BY recorded_at DESC`,
    [itemId, days]
  );
  return rows;
}

/** Calculate average daily usage for an item over a time window. */
async function getDailyAverage(itemId, days = 30) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(quantity_used), 0) as total_used,
            COUNT(DISTINCT DATE(recorded_at)) as days_with_usage
     FROM usage_history
     WHERE item_id = $1
     AND recorded_at >= NOW() - INTERVAL '1 day' * $2`,
    [itemId, days]
  );

  const result = rows[0] || { total_used: 0, days_with_usage: 0 };
  const avgPerDay = parseFloat(result.total_used) / Math.max(days, 1);

  return {
    totalUsed: parseFloat(result.total_used),
    daysTracked: days,
    daysWithUsage: parseInt(result.days_with_usage),
    averagePerDay: Math.round(avgPerDay * 100) / 100
  };
}

/**
 * Get all items with usage analytics attached.
 * NOTE: This queries each item's usage individually (N+1 pattern).
 * Acceptable for small inventories (<500 items). For larger datasets,
 * consider a single JOIN query with window functions.
 */
async function getAllWithAnalytics(userId) {
  const items = await getAll(userId);
  const results = [];

  for (const item of items) {
    const usage = await getDailyAverage(item.id, 30);
    const daysRemaining = usage.averagePerDay > 0
      ? Math.floor(item.current_quantity / usage.averagePerDay)
      : null;

    results.push({
      ...item,
      usage: {
        averagePerDay: usage.averagePerDay,
        daysRemaining,
        daysTracked: usage.daysTracked,
        hasData: usage.daysWithUsage > 0
      }
    });
  }

  return results;
}

/* === Waste Tracking === */

/**
 * Record a waste event and reduce the item's quantity accordingly.
 * Quantity will not go below zero.
 */
async function recordWaste(itemId, quantity, reason, notes, costEstimate, userId) {
  const item = await getById(itemId, userId);
  if (!item) return null;

  await pool.query(
    `INSERT INTO waste_log (item_id, quantity, reason, notes, cost_estimate, recorded_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [itemId, quantity, reason, notes, costEstimate]
  );

  // Ensure quantity never goes negative
  const newQty = Math.max(0, item.current_quantity - quantity);
  await pool.query(
    `UPDATE items SET current_quantity = $1, last_updated = NOW() WHERE id = $2 AND user_id = $3`,
    [newQty, itemId, userId]
  );

  return await getById(itemId, userId);
}

/** Get waste history for a specific item within a time window. */
async function getWasteHistory(itemId, days = 30, userId) {
  const item = await getById(itemId, userId);
  if (!item) return [];

  const { rows } = await pool.query(
    `SELECT * FROM waste_log
     WHERE item_id = $1
     AND recorded_at >= NOW() - INTERVAL '1 day' * $2
     ORDER BY recorded_at DESC`,
    [itemId, days]
  );
  return rows;
}

/** Get all waste records across all items within a time window. */
async function getAllWaste(days = 30, userId) {
  const { rows } = await pool.query(
    `SELECT w.*, i.name as item_name, i.category, i.unit_type
     FROM waste_log w
     JOIN items i ON w.item_id = i.id
     WHERE i.user_id = $1 AND w.recorded_at >= NOW() - INTERVAL '1 day' * $2
     ORDER BY w.recorded_at DESC`,
    [userId, days]
  );
  return rows;
}

/**
 * Compute waste analytics: totals by reason, top wasted items, and overall summary.
 * Returns { summary, byReason, topItems, days }.
 */
async function getWasteAnalytics(days = 30, userId) {
  // Waste grouped by reason (expired, spoiled, damaged, etc.)
  const { rows: byReason } = await pool.query(
    `SELECT w.reason, SUM(w.quantity) as total_quantity, COUNT(*) as count,
            SUM(COALESCE(w.cost_estimate, 0)) as total_cost
     FROM waste_log w
     JOIN items i ON w.item_id = i.id
     WHERE i.user_id = $1 AND w.recorded_at >= NOW() - INTERVAL '1 day' * $2
     GROUP BY w.reason
     ORDER BY total_quantity DESC`,
    [userId, days]
  );

  // Top items by total waste quantity
  const { rows: topItems } = await pool.query(
    `SELECT i.id, i.name, i.category, i.unit_type,
            SUM(w.quantity) as total_wasted,
            SUM(COALESCE(w.cost_estimate, 0)) as total_cost,
            COUNT(*) as waste_count
     FROM waste_log w
     JOIN items i ON w.item_id = i.id
     WHERE i.user_id = $1 AND w.recorded_at >= NOW() - INTERVAL '1 day' * $2
     GROUP BY i.id, i.name, i.category, i.unit_type
     ORDER BY total_wasted DESC
     LIMIT $3`,
    [userId, days, WASTE_TOP_ITEMS_LIMIT]
  );

  // Overall totals
  const { rows: summaryRows } = await pool.query(
    `SELECT COALESCE(SUM(w.quantity), 0) as total_quantity,
            COALESCE(SUM(COALESCE(w.cost_estimate, 0)), 0) as total_cost,
            COUNT(*) as total_records
     FROM waste_log w
     JOIN items i ON w.item_id = i.id
     WHERE i.user_id = $1 AND w.recorded_at >= NOW() - INTERVAL '1 day' * $2`,
    [userId, days]
  );

  const summary = summaryRows[0] || { total_quantity: 0, total_cost: 0, total_records: 0 };

  return { summary, byReason, topItems, days };
}

/* === User Authentication === */

/** Create a new user with a bcrypt-hashed password. Email is stored lowercase. */
async function createUser(email, password, name) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
     RETURNING id, email, name, created_at`,
    [email.toLowerCase(), passwordHash, name]
  );
  return rows[0];
}

/** Look up a user by email (case-insensitive). */
async function getUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  return rows[0] || null;
}

/** Look up a user by ID. Returns only safe fields (no password_hash). */
async function getUserById(id) {
  const { rows } = await pool.query(
    'SELECT id, email, name, created_at FROM users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

/** Verify email + password combination. Returns user object or null. */
async function verifyPassword(email, password) {
  const user = await getUserByEmail(email);
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;
  return { id: user.id, email: user.email, name: user.name };
}

/* === Exports === */

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
  createUser,
  getUserByEmail,
  getUserById,
  verifyPassword
};
