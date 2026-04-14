-- ═══════════════════════════════════════════════════════════════════════
-- TELAD FLEET – PostgreSQL Database Schema
-- Domain: fna.sa  |  Version: 2.0.0
-- Run: psql -U telad_user -d telad_fleet -f schema.sql
-- ═══════════════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  name         TEXT        NOT NULL,
  username     TEXT        NOT NULL UNIQUE,
  email        TEXT,
  password_hash TEXT       NOT NULL,
  role         TEXT        NOT NULL DEFAULT 'viewer'
                           CHECK (role IN ('admin','supervisor','operator','viewer')),
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default super-admin: F / 0241 (bcrypt hash — regenerate for production)
-- To regenerate: node -e "const b=require('bcryptjs');console.log(b.hashSync('0241',10))"
INSERT INTO users (name, username, email, password_hash, role)
VALUES (
  'مدير النظام',
  'F',
  'admin@fna.sa',
  '$2a$10$PLACEHOLDER_REPLACE_WITH_REAL_BCRYPT_HASH',
  'admin'
) ON CONFLICT (username) DO NOTHING;

-- ─── CITIES ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cities (
  id         SERIAL PRIMARY KEY,
  name       TEXT        NOT NULL,
  region     TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PROJECTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  city_id     INTEGER     REFERENCES cities(id) ON DELETE SET NULL,
  status      TEXT        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','completed','suspended')),
  start_date  DATE,
  end_date    DATE,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── VEHICLES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id           SERIAL PRIMARY KEY,
  name         TEXT,
  plate        TEXT        NOT NULL UNIQUE,
  model        TEXT,
  year         INTEGER,
  city         TEXT,
  project_id   INTEGER     REFERENCES projects(id) ON DELETE SET NULL,
  driver       TEXT,
  status       TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','maintenance','inactive')),

  -- أعمدة الفحص الفني الدوري
  inspection_status TEXT    NOT NULL DEFAULT 'unknown'
                            CHECK (inspection_status IN ('valid','expired','unknown')),
  inspection_expiry DATE,

  -- أعمدة التأمين
  insurance_status  TEXT    NOT NULL DEFAULT 'unknown'
                            CHECK (insurance_status IN ('valid','expired','unknown')),
  insurance_expiry  DATE,

  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── GPS TRACKING ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gps_tracking (
  id          BIGSERIAL   PRIMARY KEY,
  vehicle_id  INTEGER     NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  latitude    NUMERIC(10,7) NOT NULL,
  longitude   NUMERIC(10,7) NOT NULL,
  speed       NUMERIC(6,2),
  heading     NUMERIC(5,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gps_vehicle_time ON gps_tracking(vehicle_id, recorded_at DESC);

-- ─── EMPLOYEES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id          SERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  role        TEXT,
  phone       TEXT,
  national_id TEXT,
  city        TEXT,
  project_id  INTEGER     REFERENCES projects(id) ON DELETE SET NULL,
  vehicle_id  INTEGER     REFERENCES vehicles(id) ON DELETE SET NULL,
  status      TEXT        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','inactive','leave')),
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── MAINTENANCE ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance (
  id           SERIAL PRIMARY KEY,
  vehicle_id   INTEGER     NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL,
  description  TEXT,
  cost         NUMERIC(12,2),
  workshop     TEXT,
  service_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  next_date    DATE,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ACCIDENTS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accidents (
  id           SERIAL PRIMARY KEY,
  vehicle_id   INTEGER     NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver       TEXT,
  description  TEXT,
  damage_cost  NUMERIC(12,2),
  location     TEXT,
  incident_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── VIOLATIONS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS violations (
  id           SERIAL PRIMARY KEY,
  vehicle_id   INTEGER     REFERENCES vehicles(id) ON DELETE SET NULL,
  driver       TEXT,
  type         TEXT        NOT NULL,
  fine_amount  NUMERIC(12,2),
  violation_at DATE        NOT NULL DEFAULT CURRENT_DATE,
  paid         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── FINANCIAL CUSTODY ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS financial_custody (
  id           SERIAL PRIMARY KEY,
  employee_id  INTEGER     REFERENCES employees(id) ON DELETE SET NULL,
  description  TEXT        NOT NULL,
  amount       NUMERIC(12,2) NOT NULL,
  issued_at    DATE        NOT NULL DEFAULT CURRENT_DATE,
  returned_at  DATE,
  status       TEXT        NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','closed','overdue')),
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AUDIT LOG ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL   PRIMARY KEY,
  action     TEXT        NOT NULL,
  username   TEXT        NOT NULL,
  ip_address TEXT,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(username);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);
