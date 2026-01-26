const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'inventory.db');

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

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Uncategorized',
      unit_type TEXT DEFAULT 'units',
      current_quantity REAL DEFAULT 0,
      min_quantity REAL DEFAULT 0,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_barcode ON items(barcode)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_category ON items(category)`);

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

function getAll() {
  const stmt = db.prepare('SELECT * FROM items ORDER BY category, name');
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getByBarcode(barcode) {
  const stmt = db.prepare('SELECT * FROM items WHERE barcode = ?');
  stmt.bind([barcode]);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function getById(id) {
  const stmt = db.prepare('SELECT * FROM items WHERE id = ?');
  stmt.bind([id]);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function getLowStock() {
  const stmt = db.prepare('SELECT * FROM items WHERE current_quantity <= min_quantity ORDER BY name');
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function insert(item) {
  const stmt = db.prepare(`
    INSERT INTO items (barcode, name, category, unit_type, current_quantity, min_quantity, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run([item.barcode, item.name, item.category, item.unit_type, item.current_quantity, item.min_quantity]);
  stmt.free();
  saveDatabase();

  // Get the inserted row by barcode (more reliable with sql.js)
  return getByBarcode(item.barcode);
}

function update(id, item) {
  const stmt = db.prepare(`
    UPDATE items
    SET name = ?, category = ?, unit_type = ?, current_quantity = ?, min_quantity = ?, last_updated = datetime('now')
    WHERE id = ?
  `);
  stmt.run([item.name, item.category, item.unit_type, item.current_quantity, item.min_quantity, id]);
  stmt.free();
  saveDatabase();
  return getById(id);
}

function updateQuantity(id, quantity) {
  const stmt = db.prepare(`
    UPDATE items
    SET current_quantity = ?, last_updated = datetime('now')
    WHERE id = ?
  `);
  stmt.run([quantity, id]);
  stmt.free();
  saveDatabase();
  return getById(id);
}

function deleteItem(id) {
  const stmt = db.prepare('DELETE FROM items WHERE id = ?');
  stmt.run([id]);
  stmt.free();
  saveDatabase();
}

function getCategories() {
  const stmt = db.prepare('SELECT DISTINCT category FROM items ORDER BY category');
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject().category);
  }
  stmt.free();
  return results;
}

module.exports = {
  initDatabase,
  getAll,
  getByBarcode,
  getById,
  getLowStock,
  insert,
  update,
  updateQuantity,
  deleteItem,
  getCategories
};
