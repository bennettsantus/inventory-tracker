/**
 * database.js - PostgreSQL Database Layer
 *
 * All database operations for the inventory tracker.
 * Uses connection pooling via the 'pg' module with parameterized
 * queries throughout to prevent SQL injection.
 *
 * Schema:
 *   users            - User accounts with bcrypt-hashed passwords and role
 *   items            - Inventory items, scoped per user via user_id
 *   suppliers        - Vendor/supplier contacts, scoped per user
 *   inventory_counts - Formal count history with variance tracking
 *   usage_history    - Tracks quantity consumed over time (auto-recorded on quantity decrease)
 *   waste_log        - Manually logged waste events with reason and cost
 *   delivery_schedule - Delivery patterns (reserved for future use)
 *
 * Key relationships:
 *   users 1:N items (user_id FK)
 *   users 1:N suppliers (user_id FK)
 *   suppliers 1:N items (supplier_id FK, SET NULL on delete)
 *   items 1:N inventory_counts (item_id FK, CASCADE delete)
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

    // === Wave 1 schema additions (backwards-compatible) ===

    // Extend users with role
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'staff'`);

    // Extend items with cost, par level, storage location, supplier, soft-delete
    await client.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS cost_per_unit REAL DEFAULT 0`);
    await client.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS par_level REAL DEFAULT 0`);
    await client.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS storage_location TEXT DEFAULT 'dry_storage'`);
    await client.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS supplier_id INTEGER`);
    await client.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_items_location ON items(storage_location)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_items_supplier ON items(supplier_id)`);

    // Suppliers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        contact_name TEXT,
        phone TEXT,
        email TEXT,
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_suppliers_user ON suppliers(user_id)`);

    // Inventory counts table - formal count history with variance tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_counts (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        count_value REAL NOT NULL,
        counted_by INTEGER REFERENCES users(id),
        counted_at TIMESTAMPTZ DEFAULT NOW(),
        storage_location TEXT,
        notes TEXT,
        previous_count REAL,
        variance REAL
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_counts_item ON inventory_counts(item_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_counts_date ON inventory_counts(counted_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_counts_user ON inventory_counts(counted_by)`);
  } finally {
    client.release();
  }
}

/* === Item Queries === */

/**
 * Get items for a user with optional filters.
 * By default excludes soft-deleted items (is_active=false).
 */
async function getAll(userId, filters = {}) {
  const conditions = ['user_id = $1'];
  const params = [userId];
  let idx = 2;

  if (!filters.include_inactive) {
    conditions.push('is_active = true');
  }
  if (filters.location) {
    conditions.push(`storage_location = $${idx++}`);
    params.push(filters.location);
  }
  if (filters.category) {
    conditions.push(`category = $${idx++}`);
    params.push(filters.category);
  }
  if (filters.below_par) {
    conditions.push('current_quantity < par_level AND par_level > 0');
  }

  const { rows } = await pool.query(
    `SELECT * FROM items WHERE ${conditions.join(' AND ')} ORDER BY category, name`,
    params
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

/** Insert a new inventory item (with Wave 1 fields). */
async function insert(item, userId) {
  const { rows } = await pool.query(
    `INSERT INTO items (user_id, barcode, name, category, unit_type, current_quantity, min_quantity,
       cost_per_unit, par_level, storage_location, supplier_id, last_updated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     RETURNING *`,
    [
      userId, item.barcode, item.name, item.category, item.unit_type,
      item.current_quantity, item.min_quantity,
      item.cost_per_unit || 0,
      item.par_level || 0,
      item.storage_location || 'dry_storage',
      item.supplier_id || null
    ]
  );
  return rows[0];
}

/** Update an existing inventory item's fields (with Wave 1 fields). */
async function update(id, item, userId) {
  const { rows } = await pool.query(
    `UPDATE items
     SET name = $1, category = $2, unit_type = $3, current_quantity = $4, min_quantity = $5,
         cost_per_unit = $6, par_level = $7, storage_location = $8, supplier_id = $9,
         last_updated = NOW()
     WHERE id = $10 AND user_id = $11
     RETURNING *`,
    [
      item.name, item.category, item.unit_type, item.current_quantity, item.min_quantity,
      item.cost_per_unit, item.par_level, item.storage_location, item.supplier_id,
      id, userId
    ]
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
 * Get all active items with usage analytics attached.
 * NOTE: This queries each item's usage individually (N+1 pattern).
 * Acceptable for small inventories (<500 items). For larger datasets,
 * consider a single JOIN query with window functions.
 */
async function getAllWithAnalytics(userId) {
  const items = await getAll(userId, { include_inactive: false });
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

/* === Soft Delete === */

/** Soft-delete an item (set is_active=false instead of removing). */
async function softDeleteItem(id, userId) {
  const { rows } = await pool.query(
    `UPDATE items SET is_active = false, last_updated = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  );
  return rows[0] || null;
}

/* === Inventory Counting === */

/**
 * Record a single inventory count.
 * Gets previous count, calculates variance, updates item's current_quantity.
 */
async function insertCount(itemId, countValue, userId, location, notes) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get current quantity as previous count
    const { rows: itemRows } = await client.query(
      'SELECT current_quantity FROM items WHERE id = $1',
      [itemId]
    );
    const previousCount = itemRows[0] ? itemRows[0].current_quantity : 0;
    const variance = countValue - previousCount;

    // Insert count record
    const { rows: countRows } = await client.query(
      `INSERT INTO inventory_counts (item_id, count_value, counted_by, storage_location, notes, previous_count, variance)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [itemId, countValue, userId, location, notes, previousCount, variance]
    );

    // Update item's current quantity
    await client.query(
      `UPDATE items SET current_quantity = $1, last_updated = NOW() WHERE id = $2`,
      [countValue, itemId]
    );

    await client.query('COMMIT');
    return countRows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Record multiple counts in a single transaction.
 * Each entry: { item_id, count_value, notes? }
 */
async function bulkInsertCounts(counts, userId, location) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];

    for (const c of counts) {
      const { rows: itemRows } = await client.query(
        'SELECT current_quantity FROM items WHERE id = $1',
        [c.item_id]
      );
      const previousCount = itemRows[0] ? itemRows[0].current_quantity : 0;
      const variance = c.count_value - previousCount;

      const { rows: countRows } = await client.query(
        `INSERT INTO inventory_counts (item_id, count_value, counted_by, storage_location, notes, previous_count, variance)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [c.item_id, c.count_value, userId, location, c.notes || null, previousCount, variance]
      );

      await client.query(
        `UPDATE items SET current_quantity = $1, last_updated = NOW() WHERE id = $2`,
        [c.count_value, c.item_id]
      );

      results.push(countRows[0]);
    }

    await client.query('COMMIT');
    return results;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Get recent counts (last N hours) for a user's items. */
async function getRecentCounts(userId, hours = 24) {
  const { rows } = await pool.query(
    `SELECT ic.*, i.name as item_name, i.category, i.unit_type
     FROM inventory_counts ic
     JOIN items i ON ic.item_id = i.id
     WHERE i.user_id = $1 AND ic.counted_at >= NOW() - INTERVAL '1 hour' * $2
     ORDER BY ic.counted_at DESC`,
    [userId, hours]
  );
  return rows;
}

/** Get count history for a single item. */
async function getCountHistory(itemId, limit = 30) {
  const { rows } = await pool.query(
    `SELECT * FROM inventory_counts WHERE item_id = $1 ORDER BY counted_at DESC LIMIT $2`,
    [itemId, limit]
  );
  return rows;
}

/* === Dashboard === */

/** Compute dashboard stats for a user. */
async function getDashboardStats(userId) {
  // Total active items
  const { rows: totalRows } = await pool.query(
    'SELECT COUNT(*) as count FROM items WHERE user_id = $1 AND is_active = true',
    [userId]
  );

  // Critical: below min_quantity (reorder threshold)
  const { rows: criticalRows } = await pool.query(
    `SELECT COUNT(*) as count FROM items
     WHERE user_id = $1 AND is_active = true AND current_quantity <= min_quantity AND min_quantity > 0`,
    [userId]
  );

  // Items to order: below par_level but above min_quantity
  const { rows: orderRows } = await pool.query(
    `SELECT COUNT(*) as count FROM items
     WHERE user_id = $1 AND is_active = true AND par_level > 0
       AND current_quantity < par_level AND current_quantity > min_quantity`,
    [userId]
  );

  // In stock: at or above par_level
  const { rows: inStockRows } = await pool.query(
    `SELECT COUNT(*) as count FROM items
     WHERE user_id = $1 AND is_active = true AND (par_level = 0 OR current_quantity >= par_level)`,
    [userId]
  );

  // Total inventory value
  const { rows: valueRows } = await pool.query(
    `SELECT COALESCE(SUM(current_quantity * cost_per_unit), 0) as total_value
     FROM items WHERE user_id = $1 AND is_active = true`,
    [userId]
  );

  // Recent counts (last 10)
  const { rows: recentCounts } = await pool.query(
    `SELECT ic.id, ic.count_value, ic.previous_count, ic.variance, ic.counted_at,
            i.name as item_name, i.category, i.unit_type
     FROM inventory_counts ic
     JOIN items i ON ic.item_id = i.id
     WHERE i.user_id = $1
     ORDER BY ic.counted_at DESC LIMIT 10`,
    [userId]
  );

  return {
    total_items: parseInt(totalRows[0].count),
    critical_items: parseInt(criticalRows[0].count),
    items_to_order: parseInt(orderRows[0].count),
    in_stock: parseInt(inStockRows[0].count),
    total_inventory_value: parseFloat(valueRows[0].total_value),
    recent_counts: recentCounts
  };
}

/* === Suppliers === */

/** Get active suppliers for a user. */
async function getSuppliers(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM suppliers WHERE user_id = $1 AND is_active = true ORDER BY name',
    [userId]
  );
  return rows;
}

/** Create a new supplier. */
async function insertSupplier(supplier, userId) {
  const { rows } = await pool.query(
    `INSERT INTO suppliers (user_id, name, contact_name, phone, email, notes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, supplier.name, supplier.contact_name || null, supplier.phone || null,
     supplier.email || null, supplier.notes || null]
  );
  return rows[0];
}

/** Update a supplier. */
async function updateSupplier(id, supplier, userId) {
  const { rows } = await pool.query(
    `UPDATE suppliers
     SET name = $1, contact_name = $2, phone = $3, email = $4, notes = $5
     WHERE id = $6 AND user_id = $7 AND is_active = true
     RETURNING *`,
    [supplier.name, supplier.contact_name, supplier.phone, supplier.email, supplier.notes, id, userId]
  );
  return rows[0] || null;
}

/** Soft-delete a supplier. */
async function softDeleteSupplier(id, userId) {
  const { rows } = await pool.query(
    `UPDATE suppliers SET is_active = false WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  );
  return rows[0] || null;
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
  softDeleteItem,
  getCategories,
  recordUsage,
  getUsageHistory,
  getDailyAverage,
  recordWaste,
  getWasteHistory,
  getAllWaste,
  getWasteAnalytics,
  insertCount,
  bulkInsertCounts,
  getRecentCounts,
  getCountHistory,
  getDashboardStats,
  getSuppliers,
  insertSupplier,
  updateSupplier,
  softDeleteSupplier,
  createUser,
  getUserByEmail,
  getUserById,
  verifyPassword
};
