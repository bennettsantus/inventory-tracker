const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_PUBLIC_URL;

const poolConfig = { connectionString: dbUrl };
if (dbUrl && !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

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

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_barcode_user ON items(barcode, user_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS usage_history (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        quantity_used REAL NOT NULL,
        recorded_at TIMESTAMPTZ DEFAULT NOW(),
        day_of_week INTEGER
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_schedule (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        delivery_days TEXT NOT NULL,
        lead_time_days INTEGER DEFAULT 1
      )
    `);

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

    await client.query(`CREATE INDEX IF NOT EXISTS idx_barcode ON items(barcode)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_category ON items(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_usage_item ON usage_history(item_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_waste_item ON waste_log(item_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_history(recorded_at)`);
  } finally {
    client.release();
  }
}

async function getAll(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM items WHERE user_id = $1 ORDER BY category, name',
    [userId]
  );
  return rows;
}

async function getByBarcode(barcode, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM items WHERE barcode = $1 AND user_id = $2',
    [barcode, userId]
  );
  return rows[0] || null;
}

async function getById(id, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM items WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return rows[0] || null;
}

async function getLowStock(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM items WHERE user_id = $1 AND current_quantity <= min_quantity ORDER BY name',
    [userId]
  );
  return rows;
}

async function insert(item, userId) {
  const { rows } = await pool.query(
    `INSERT INTO items (user_id, barcode, name, category, unit_type, current_quantity, min_quantity, last_updated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING *`,
    [userId, item.barcode, item.name, item.category, item.unit_type, item.current_quantity, item.min_quantity]
  );
  return rows[0];
}

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

async function updateQuantity(id, quantity, userId) {
  const currentItem = await getById(id, userId);
  if (!currentItem) return null;

  const previousQty = currentItem.current_quantity;
  const difference = previousQty - quantity;

  if (difference > 0) {
    await recordUsage(id, difference);
  }

  const { rows } = await pool.query(
    `UPDATE items SET current_quantity = $1, last_updated = NOW() WHERE id = $2 AND user_id = $3 RETURNING *`,
    [quantity, id, userId]
  );
  return rows[0] || null;
}

async function recordUsage(itemId, quantityUsed) {
  const dayOfWeek = new Date().getDay();
  await pool.query(
    `INSERT INTO usage_history (item_id, quantity_used, recorded_at, day_of_week)
     VALUES ($1, $2, NOW(), $3)`,
    [itemId, quantityUsed, dayOfWeek]
  );
}

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

async function deleteItem(id, userId) {
  await pool.query('DELETE FROM items WHERE id = $1 AND user_id = $2', [id, userId]);
}

async function getCategories(userId) {
  const { rows } = await pool.query(
    'SELECT DISTINCT category FROM items WHERE user_id = $1 ORDER BY category',
    [userId]
  );
  return rows.map(r => r.category);
}

async function recordWaste(itemId, quantity, reason, notes, costEstimate, userId) {
  const item = await getById(itemId, userId);
  if (!item) return null;

  await pool.query(
    `INSERT INTO waste_log (item_id, quantity, reason, notes, cost_estimate, recorded_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [itemId, quantity, reason, notes, costEstimate]
  );

  const newQty = Math.max(0, item.current_quantity - quantity);
  await pool.query(
    `UPDATE items SET current_quantity = $1, last_updated = NOW() WHERE id = $2 AND user_id = $3`,
    [newQty, itemId, userId]
  );

  return await getById(itemId, userId);
}

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

async function getWasteAnalytics(days = 30, userId) {
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
     LIMIT 10`,
    [userId, days]
  );

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

async function createUser(email, password, name) {
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
     RETURNING id, email, name, created_at`,
    [email.toLowerCase(), passwordHash, name]
  );
  return rows[0];
}

async function getUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  return rows[0] || null;
}

async function getUserById(id) {
  const { rows } = await pool.query(
    'SELECT id, email, name, created_at FROM users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function verifyPassword(email, password) {
  const user = await getUserByEmail(email);
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;
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
  createUser,
  getUserByEmail,
  getUserById,
  verifyPassword
};
