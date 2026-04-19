'use strict';
/**
 * TELAD FLEET – PostgreSQL Adapter
 * ─────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for lib/db.js when DATABASE_URL is set.
 * Uses the same public API: db.store (getter), db.find, db.findOne,
 * db.insert, db.update, db.remove, db.addLog, db.pushAlert …
 * 
 * To activate:  DATABASE_URL=postgres://user:pass@host:5432/telad_fleet
 * 
 * Schema is auto-migrated on first boot via /database/schema.sql
 * ─────────────────────────────────────────────────────────────────────────
 * TABLES (all auto-created):
 *   users, vehicles, drivers, maintenance, appointments,
 *   regions, accidents, violations, financial, handovers,
 *   employees, reports, logs, alerts, devRequests
 */

const fs         = require('fs');
const path       = require('path');
const { Pool }   = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Not configured – export nothing; server.js uses lib/db.js instead
  module.exports = null;
  return;
}

// ── Connection Pool ──────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max:              10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => console.error('[PG] Unexpected pool error:', err.message));

// ── Schema migration ─────────────────────────────────────────────────────────
async function migrate() {
  const schemaFile = path.join(__dirname, '..', 'database', 'pg-schema.sql');
  if (!fs.existsSync(schemaFile)) {
    await createDefaultSchema();
    return;
  }
  const sql = fs.readFileSync(schemaFile, 'utf8');
  await pool.query(sql);
  console.log('[PG] Schema migration applied');
}

async function createDefaultSchema() {
  // Create all tables if they don't exist
  const ddl = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      email TEXT,
      role TEXT DEFAULT 'viewer',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      plate TEXT,
      city TEXT,
      driver_id TEXT,
      driver TEXT,
      status TEXT DEFAULT 'active',
      location TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      km INTEGER DEFAULT 0,
      fuel_level INTEGER DEFAULT 0,
      year INTEGER,
      color TEXT,
      brand TEXT,
      model TEXT,
      insurance JSONB DEFAULT '{}',
      inspection JSONB DEFAULT '{}',
      documents JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      license_no TEXT,
      license_expiry DATE,
      national_id TEXT,
      status TEXT DEFAULT 'active',
      vehicle_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS maintenance (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT,
      type TEXT,
      description TEXT,
      status TEXT DEFAULT 'pending',
      scheduled_date DATE,
      completed_date DATE,
      cost NUMERIC(10,2),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS maintenance_cards (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL,
      plate TEXT,
      driver_during_maintenance TEXT,
      maintenance_date DATE,
      maintenance_type TEXT NOT NULL,
      description TEXT,
      total_cost NUMERIC(10,2) DEFAULT 0,
      service_provider TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','cancelled')),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT,
      type TEXT,
      scheduled_at TIMESTAMPTZ,
      notes TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS regions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS accidents (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT,
      employee_id TEXT,
      date DATE,
      location TEXT,
      description TEXT,
      status TEXT DEFAULT 'open',
      injuries_count INTEGER DEFAULT 0,
      damage_amount NUMERIC(12,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS violations (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT,
      employee_id TEXT,
      date DATE,
      type TEXT,
      amount NUMERIC(10,2) DEFAULT 0,
      description TEXT,
      status TEXT DEFAULT 'unpaid',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS financial (
      id TEXT PRIMARY KEY,
      type TEXT,
      amount NUMERIC(12,2) NOT NULL,
      description TEXT,
      vehicle_id TEXT,
      date DATE,
      receipt_no TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS handovers (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT,
      vehicle_name TEXT,
      vehicle_plate TEXT,
      type TEXT,
      employee_id TEXT,
      employee_name TEXT,
      date TIMESTAMPTZ DEFAULT NOW(),
      km INTEGER DEFAULT 0,
      fuel_level INTEGER DEFAULT 0,
      condition TEXT DEFAULT 'جيد',
      notes TEXT,
      images JSONB DEFAULT '[]',
      ai_report TEXT,
      comparison JSONB,
      signed_by TEXT,
      witness TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      national_id TEXT,
      phone TEXT,
      email TEXT,
      department TEXT,
      job_title TEXT,
      status TEXT DEFAULT 'active',
      vehicle_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      title TEXT,
      type TEXT,
      content JSONB DEFAULT '{}',
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS logs (
      id BIGSERIAL PRIMARY KEY,
      action TEXT,
      username TEXT,
      ip TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      message TEXT,
      type TEXT DEFAULT 'info',
      read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dev_requests (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      priority TEXT DEFAULT 'متوسطة',
      status TEXT DEFAULT 'مفتوح',
      ai_estimate TEXT,
      requested_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- GPS live positions (latest per vehicle)
    CREATE TABLE IF NOT EXISTS gps_positions (
      vehicle_id TEXT PRIMARY KEY,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      speed DOUBLE PRECISION DEFAULT 0,
      heading DOUBLE PRECISION DEFAULT 0,
      accuracy DOUBLE PRECISION DEFAULT 10,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_vehicles_status            ON vehicles(status);
    CREATE INDEX IF NOT EXISTS idx_maintenance_vehicle_status ON maintenance(vehicle_id, status);
    CREATE INDEX IF NOT EXISTS idx_maintenance_cards_vehicle  ON maintenance_cards(vehicle_id, maintenance_date DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_handovers_vehicle          ON handovers(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_handovers_employee         ON handovers(employee_id);
    CREATE INDEX IF NOT EXISTS idx_accidents_vehicle          ON accidents(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_violations_vehicle         ON violations(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_logs_created               ON logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_gps_updated                ON gps_positions(updated_at DESC);
  `;
  await pool.query(ddl);
  console.log('[PG] Default schema created');
}

// ── Helper: camelCase ↔ snake_case row mapping ───────────────────────────────
function rowToCamel(row) {
  if (!row) return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}

// Every table has a known set of columns (for dynamic INSERT / UPDATE)
const TABLE_COLUMNS = {
  users:       ['id','username','password_hash','name','email','role','active'],
  vehicles:    ['id','name','plate','city','driver_id','driver','status','location','lat','lng','km','fuel_level','year','color','brand','model','insurance','inspection','documents'],
  drivers:     ['id','name','phone','license_no','license_expiry','national_id','status','vehicle_id'],
  maintenance: ['id','vehicle_id','type','description','status','scheduled_date','cost'],
  maintenance_cards: ['id','vehicle_id','plate','driver_during_maintenance','maintenance_date','maintenance_type','description','total_cost','service_provider','status','notes'],
  appointments:['id','vehicle_id','type','scheduled_at','notes','status'],
  regions:     ['id','name','description'],
  accidents:   ['id','vehicle_id','employee_id','date','location','description','status','injuries_count','damage_amount'],
  violations:  ['id','vehicle_id','employee_id','date','type','amount','description','status'],
  financial:   ['id','type','amount','description','vehicle_id','date','receipt_no'],
  handovers:   ['id','vehicle_id','vehicle_name','vehicle_plate','type','employee_id','employee_name','km','fuel_level','condition','notes','images','ai_report','comparison','signed_by','witness'],
  employees:   ['id','name','national_id','phone','email','department','job_title','status','vehicle_id'],
  reports:     ['id','title','type','content','created_by'],
  alerts:      ['id','message','type','read'],
  dev_requests:['id','title','description','priority','status','ai_estimate','requested_by'],
  gps_positions:['vehicle_id','lat','lng','speed','heading','accuracy'],
};

// camelCase input key → snake_case DB column
function toSnake(str) { return str.replace(/([A-Z])/g, '_$1').toLowerCase(); }

function buildInsertParams(table, obj) {
  const allowed = TABLE_COLUMNS[table] || [];
  const cols = [], vals = [], params = [];
  let i = 1;
  for (const [k, v] of Object.entries(obj)) {
    const col = toSnake(k);
    if (!allowed.includes(col) && col !== 'id') continue;
    cols.push(col); vals.push(`$${i++}`); params.push(
      (typeof v === 'object' && v !== null && !Buffer.isBuffer(v)) ? JSON.stringify(v) : v
    );
  }
  return { cols, vals, params };
}

// ── uid helper (same as db.js) ───────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function nowIso() { return new Date().toISOString(); }

// ── Public PG DB API ──────────────────────────────────────────────────────────
// NOTE: All methods are async for PG but the interface mirrors lib/db.js
// The server uses `await db.find(...)` etc. when PG is active.

const pgDb = {
  uid,
  nowIso,
  pool,
  migrate,

  async find(table, predicate) {
    const rows = await pool.query(`SELECT * FROM ${table} ORDER BY created_at DESC NULLS LAST`);
    return rows.rows.map(rowToCamel).filter(predicate || (() => true));
  },

  async findOne(table, predicate) {
    const all = await this.find(table, predicate);
    return all[0] || null;
  },

  async insert(table, item) {
    if (!item.id) item.id = uid();
    item.createdAt = nowIso();
    const { cols, vals, params } = buildInsertParams(table, item);
    if (!cols.length) return item;
    const q = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO NOTHING RETURNING *`;
    const res = await pool.query(q, params);
    return rowToCamel(res.rows[0]) || item;
  },

  async update(table, id, patch) {
    const sets = [], params = [];
    let i = 1;
    const allowed = TABLE_COLUMNS[table] || [];
    for (const [k, v] of Object.entries(patch)) {
      const col = toSnake(k);
      if (col === 'id') continue;
      if (!allowed.includes(col)) continue;
      sets.push(`${col} = $${i++}`);
      params.push((typeof v === 'object' && v !== null) ? JSON.stringify(v) : v);
    }
    if (!sets.length) return null;
    sets.push(`updated_at = NOW()`);
    params.push(id);
    const q = `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`;
    const res = await pool.query(q, params);
    return rowToCamel(res.rows[0]) || null;
  },

  async remove(table, id) {
    const res = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    return res.rowCount > 0;
  },

  async addLog(action, username = 'system', ip = '') {
    await pool.query(`INSERT INTO logs (action, username, ip) VALUES ($1, $2, $3)`, [action, username, ip]);
  },

  async pushAlert(message, type = 'info') {
    await this.insert('alerts', { message, type });
  },

  // GPS upsert (high-frequency, uses ON CONFLICT UPDATE)
  async upsertGps(vehicleId, lat, lng, speed = 0, heading = 0, accuracy = 10) {
    await pool.query(`
      INSERT INTO gps_positions (vehicle_id, lat, lng, speed, heading, accuracy, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (vehicle_id) DO UPDATE
        SET lat = EXCLUDED.lat, lng = EXCLUDED.lng,
            speed = EXCLUDED.speed, heading = EXCLUDED.heading,
            accuracy = EXCLUDED.accuracy, updated_at = NOW()
    `, [vehicleId, lat, lng, speed, heading, accuracy]);
    // Also update vehicle row
    await pool.query(`UPDATE vehicles SET lat=$1, lng=$2, updated_at=NOW() WHERE id=$3`, [lat, lng, vehicleId]);
  },

  async getGpsPositions() {
    const res = await pool.query(`SELECT * FROM gps_positions ORDER BY updated_at DESC`);
    return res.rows.map(rowToCamel);
  },

  async dashboardStats() {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
    const today = new Date().toISOString().slice(0,10);
    const [v, act, drv, emp, mnt, apt, acc, viol, fin, hd, insExp, insSpd, eff] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM vehicles`),
      pool.query(`SELECT COUNT(*) FROM vehicles WHERE status='active'`),
      pool.query(`SELECT COUNT(*) FROM drivers`),
      pool.query(`SELECT COUNT(*) FROM employees`),
      pool.query(`SELECT COUNT(*) FROM maintenance WHERE status='pending'`),
      pool.query(`SELECT COUNT(*) FROM appointments WHERE status='pending'`),
      pool.query(`SELECT COUNT(*) FROM accidents WHERE status != 'closed'`),
      pool.query(`SELECT COUNT(*) FROM violations WHERE status='unpaid'`),
      pool.query(`SELECT COALESCE(SUM(amount),0) FROM financial WHERE date >= $1`, [monthStart]),
      pool.query(`SELECT COUNT(*) FROM handovers WHERE date::date = $1`, [today]),
      pool.query(`SELECT COUNT(*) FROM vehicles WHERE insurance->>'status' = 'expiring'`),
      pool.query(`SELECT COUNT(*) FROM vehicles WHERE inspection->>'status' = 'منتهي'`),
      pool.query(`SELECT COUNT(*) FROM vehicles`),
    ]);
    const total    = parseInt(v.rows[0].count, 10);
    const active   = parseInt(act.rows[0].count, 10);
    return {
      vehicles: total, activeVehicles: active,
      drivers: parseInt(drv.rows[0].count,10),
      employees: parseInt(emp.rows[0].count,10),
      maintenance: parseInt(mnt.rows[0].count,10),
      appointments: parseInt(apt.rows[0].count,10),
      accidents: parseInt(acc.rows[0].count,10),
      violationsUnpaid: parseInt(viol.rows[0].count,10),
      financialMonth: parseFloat(fin.rows[0].coalesce||0).toFixed(2),
      handoversToday: parseInt(hd.rows[0].count,10),
      insuranceExpiring: parseInt(insExp.rows[0].count,10),
      inspectionExpired: parseInt(insSpd.rows[0].count,10),
      efficiency: Math.round(active / Math.max(total,1) * 100),
      alerts: 0,  // calculated separately
    };
  },
};

module.exports = pgDb;
