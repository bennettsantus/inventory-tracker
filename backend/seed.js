/**
 * seed.js - Seed the database with demo data for development/testing.
 *
 * Run manually: node seed.js
 *
 * Creates:
 *   - 2 users (admin + manager)
 *   - 3 suppliers
 *   - 30+ realistic restaurant items across all storage locations
 *   - 5-10 historical counts per item from the past 2 weeks
 *   - Some items intentionally below reorder threshold
 *
 * IMPORTANT: This script is destructive — it will insert duplicate data
 * if run multiple times. Only use on a fresh or dev database.
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_PUBLIC_URL;
if (!dbUrl) {
  console.error('No DATABASE_URL set. Set it in .env or environment.');
  process.exit(1);
}

const poolConfig = { connectionString: dbUrl };
if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
  poolConfig.ssl = { rejectUnauthorized: false };
}
const pool = new Pool(poolConfig);

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // --- Users ---
    const pw = await bcrypt.hash('password123', 10);
    const { rows: [admin] } = await client.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ('admin@mikes.com', $1, 'Mike (Admin)', 'admin') RETURNING id`, [pw]
    );
    const { rows: [manager] } = await client.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ('manager@mikes.com', $1, 'Sarah (Manager)', 'manager') RETURNING id`, [pw]
    );
    const userId = admin.id;
    console.log(`Created users: admin(${admin.id}), manager(${manager.id})`);

    // --- Suppliers ---
    const suppliers = [
      { name: 'Sysco', contact_name: 'Tom Rivera', phone: '555-100-2000', email: 'tom@sysco.example.com', notes: 'Main broadline distributor, delivers Tue/Thu' },
      { name: 'US Foods', contact_name: 'Linda Park', phone: '555-200-3000', email: 'linda@usfoods.example.com', notes: 'Backup distributor, good for specialty items' },
      { name: 'Local Farms Co-op', contact_name: 'Jake Hernandez', phone: '555-300-4000', email: 'jake@localfarms.example.com', notes: 'Fresh produce Mon/Wed/Fri' },
    ];
    const supplierIds = [];
    for (const s of suppliers) {
      const { rows: [row] } = await client.query(
        `INSERT INTO suppliers (user_id, name, contact_name, phone, email, notes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userId, s.name, s.contact_name, s.phone, s.email, s.notes]
      );
      supplierIds.push(row.id);
    }
    console.log(`Created ${supplierIds.length} suppliers`);

    // --- Items ---
    const items = [
      // Walk-in cooler
      { name: 'Shredded Mozzarella', category: 'Dairy', unit_type: 'lbs', qty: 25, min: 10, par: 40, cost: 4.50, location: 'walk_in', supplier: 0 },
      { name: 'Sliced Provolone', category: 'Dairy', unit_type: 'lbs', qty: 8, min: 5, par: 15, cost: 5.25, location: 'walk_in', supplier: 0 },
      { name: 'Heavy Cream', category: 'Dairy', unit_type: 'quarts', qty: 6, min: 4, par: 12, cost: 3.80, location: 'walk_in', supplier: 0 },
      { name: 'Butter (unsalted)', category: 'Dairy', unit_type: 'lbs', qty: 10, min: 5, par: 20, cost: 4.00, location: 'walk_in', supplier: 0 },
      { name: 'Sliced Pepperoni', category: 'Meat', unit_type: 'lbs', qty: 12, min: 5, par: 20, cost: 6.50, location: 'walk_in', supplier: 0 },
      { name: 'Italian Sausage (ground)', category: 'Meat', unit_type: 'lbs', qty: 3, min: 5, par: 15, cost: 5.75, location: 'walk_in', supplier: 0 }, // below min
      { name: 'Chicken Breast', category: 'Meat', unit_type: 'lbs', qty: 18, min: 10, par: 30, cost: 7.50, location: 'walk_in', supplier: 1 },
      { name: 'Romaine Lettuce', category: 'Produce', unit_type: 'heads', qty: 8, min: 4, par: 12, cost: 2.25, location: 'walk_in', supplier: 2 },
      { name: 'Tomatoes (Roma)', category: 'Produce', unit_type: 'lbs', qty: 15, min: 5, par: 20, cost: 1.80, location: 'walk_in', supplier: 2 },
      { name: 'Fresh Basil', category: 'Produce', unit_type: 'bunches', qty: 2, min: 3, par: 6, cost: 2.50, location: 'walk_in', supplier: 2 }, // below min
      { name: 'Green Peppers', category: 'Produce', unit_type: 'each', qty: 10, min: 5, par: 15, cost: 0.75, location: 'walk_in', supplier: 2 },
      { name: 'Red Onions', category: 'Produce', unit_type: 'each', qty: 12, min: 5, par: 20, cost: 0.90, location: 'walk_in', supplier: 2 },

      // Freezer
      { name: 'Pizza Dough Balls (16oz)', category: 'Frozen', unit_type: 'each', qty: 40, min: 20, par: 60, cost: 1.50, location: 'freezer', supplier: 0 },
      { name: 'Frozen Meatballs', category: 'Frozen', unit_type: 'lbs', qty: 10, min: 5, par: 20, cost: 4.25, location: 'freezer', supplier: 0 },
      { name: 'Frozen French Fries', category: 'Frozen', unit_type: 'lbs', qty: 30, min: 10, par: 40, cost: 2.10, location: 'freezer', supplier: 0 },
      { name: 'Ice Cream (Vanilla)', category: 'Frozen', unit_type: 'gallons', qty: 3, min: 2, par: 5, cost: 8.50, location: 'freezer', supplier: 1 },
      { name: 'Frozen Shrimp (21-25)', category: 'Seafood', unit_type: 'lbs', qty: 4, min: 3, par: 8, cost: 12.00, location: 'freezer', supplier: 1 },

      // Dry storage
      { name: 'All-Purpose Flour', category: 'Dry Goods', unit_type: 'lbs', qty: 50, min: 20, par: 75, cost: 0.60, location: 'dry_storage', supplier: 0 },
      { name: 'Semolina Flour', category: 'Dry Goods', unit_type: 'lbs', qty: 15, min: 5, par: 25, cost: 0.85, location: 'dry_storage', supplier: 0 },
      { name: 'Crushed Tomatoes (28oz can)', category: 'Dry Goods', unit_type: 'cans', qty: 24, min: 12, par: 36, cost: 2.50, location: 'dry_storage', supplier: 0 },
      { name: 'Olive Oil (Extra Virgin)', category: 'Dry Goods', unit_type: 'liters', qty: 4, min: 2, par: 6, cost: 9.00, location: 'dry_storage', supplier: 0 },
      { name: 'Garlic Powder', category: 'Dry Goods', unit_type: 'oz', qty: 16, min: 8, par: 32, cost: 0.35, location: 'dry_storage', supplier: 0 },
      { name: 'Dried Oregano', category: 'Dry Goods', unit_type: 'oz', qty: 10, min: 4, par: 16, cost: 0.50, location: 'dry_storage', supplier: 0 },
      { name: 'Red Pepper Flakes', category: 'Dry Goods', unit_type: 'oz', qty: 8, min: 4, par: 12, cost: 0.40, location: 'dry_storage', supplier: 0 },

      // Bar
      { name: 'Coca-Cola (12oz cans)', category: 'Beverages', unit_type: 'cases', qty: 5, min: 3, par: 8, cost: 6.50, location: 'bar', supplier: 1 },
      { name: 'Sprite (12oz cans)', category: 'Beverages', unit_type: 'cases', qty: 3, min: 2, par: 6, cost: 6.50, location: 'bar', supplier: 1 },
      { name: 'Water Bottles (16.9oz)', category: 'Beverages', unit_type: 'cases', qty: 4, min: 2, par: 8, cost: 4.00, location: 'bar', supplier: 1 },
      { name: 'Sweet Tea (gallon)', category: 'Beverages', unit_type: 'gallons', qty: 2, min: 1, par: 4, cost: 3.00, location: 'bar', supplier: 1 },

      // Prep area
      { name: 'Pizza Sauce (prepped)', category: 'Dairy', unit_type: 'quarts', qty: 6, min: 3, par: 10, cost: 2.00, location: 'prep_area', supplier: null },
      { name: 'Ranch Dressing', category: 'Dairy', unit_type: 'gallons', qty: 1, min: 1, par: 3, cost: 7.50, location: 'prep_area', supplier: 1 }, // at min
      { name: 'To-Go Containers (large)', category: 'Supplies', unit_type: 'sleeves', qty: 8, min: 4, par: 12, cost: 3.50, location: 'prep_area', supplier: 0 },
      { name: 'Aluminum Foil', category: 'Supplies', unit_type: 'rolls', qty: 3, min: 2, par: 6, cost: 5.00, location: 'prep_area', supplier: 0 },
    ];

    const itemIds = [];
    for (const item of items) {
      const barcode = `seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const supplierId = item.supplier !== null ? supplierIds[item.supplier] : null;
      const { rows: [row] } = await client.query(
        `INSERT INTO items (user_id, barcode, name, category, unit_type, current_quantity, min_quantity,
           cost_per_unit, par_level, storage_location, supplier_id, last_updated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()) RETURNING id, name`,
        [userId, barcode, item.name, item.category, item.unit_type, item.qty, item.min,
         item.cost, item.par, item.location, supplierId]
      );
      itemIds.push({ id: row.id, qty: item.qty });
    }
    console.log(`Created ${itemIds.length} items`);

    // --- Historical counts (5-10 per item, spread over past 14 days) ---
    let countTotal = 0;
    for (const { id, qty } of itemIds) {
      const numCounts = 5 + Math.floor(Math.random() * 6); // 5-10
      for (let i = 0; i < numCounts; i++) {
        const daysAgo = Math.floor(Math.random() * 14);
        const hoursAgo = Math.floor(Math.random() * 24);
        const countedAt = new Date(Date.now() - (daysAgo * 86400000 + hoursAgo * 3600000));
        // Vary count around current qty (80%-120%)
        const countValue = Math.max(0, Math.round(qty * (0.8 + Math.random() * 0.4)));
        const previousCount = Math.max(0, Math.round(qty * (0.8 + Math.random() * 0.4)));
        const variance = countValue - previousCount;

        await client.query(
          `INSERT INTO inventory_counts (item_id, count_value, counted_by, counted_at, storage_location, previous_count, variance)
           VALUES ($1, $2, $3, $4, (SELECT storage_location FROM items WHERE id = $1), $5, $6)`,
          [id, countValue, userId, countedAt, previousCount, variance]
        );
        countTotal++;
      }
    }
    console.log(`Created ${countTotal} historical counts`);

    await client.query('COMMIT');
    console.log('\nSeed complete! Login with:');
    console.log('  Email: admin@mikes.com');
    console.log('  Password: password123');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
