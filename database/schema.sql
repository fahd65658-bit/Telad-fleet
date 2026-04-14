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

-- ─── VEHICLE CONDITION REPORTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_condition_reports (
  id            SERIAL      PRIMARY KEY,
  vehicle_id    INTEGER     NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  report_type   TEXT        NOT NULL CHECK (report_type IN ('delivery','receipt')),
  mileage       INTEGER,
  fuel_level    INTEGER     CHECK (fuel_level BETWEEN 0 AND 100),
  tires_status  TEXT,
  oil_status    TEXT,
  battery_status TEXT,
  glass_status  TEXT,
  lights_status TEXT,
  overall_condition TEXT    CHECK (overall_condition IN ('excellent','good','fair','poor')),
  notes         TEXT,
  ai_analysis   JSONB,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vcr_vehicle ON vehicle_condition_reports(vehicle_id, created_at DESC);

-- ─── VEHICLE DAMAGES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_damages (
  id            SERIAL      PRIMARY KEY,
  report_id     INTEGER     NOT NULL REFERENCES vehicle_condition_reports(id) ON DELETE CASCADE,
  vehicle_id    INTEGER     NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  damage_type   TEXT        NOT NULL,
  severity      TEXT        NOT NULL CHECK (severity IN ('minor','moderate','severe')),
  location      TEXT,
  description   TEXT,
  repair_cost   NUMERIC(12,2),
  repaired      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_damages_vehicle ON vehicle_damages(vehicle_id);

-- ─── VEHICLE PHOTO HISTORY ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_photo_history (
  id            SERIAL      PRIMARY KEY,
  report_id     INTEGER     REFERENCES vehicle_condition_reports(id) ON DELETE CASCADE,
  vehicle_id    INTEGER     NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  photo_type    TEXT        NOT NULL,
  photo_url     TEXT        NOT NULL,
  annotations   JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_photos_vehicle ON vehicle_photo_history(vehicle_id, created_at DESC);

-- ─── PETROMIN SERVICES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS petromin_services (
  id              SERIAL      PRIMARY KEY,
  vehicle_id      INTEGER     NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  service_type    TEXT        NOT NULL,
  service_date    DATE        NOT NULL,
  mileage_at_service INTEGER,
  next_service_mileage INTEGER,
  next_service_date DATE,
  cost            NUMERIC(12,2),
  oil_type        TEXT,
  oil_brand       TEXT,
  workshop_name   TEXT,
  workshop_city   TEXT,
  invoice_number  TEXT,
  notes           TEXT,
  synced_from_api BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_petromin_vehicle ON petromin_services(vehicle_id, service_date DESC);

-- ─── FUEL LOGS (AL-DREES) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fuel_logs (
  id              SERIAL      PRIMARY KEY,
  vehicle_id      INTEGER     NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  fill_date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  liters          NUMERIC(8,2) NOT NULL,
  cost_per_liter  NUMERIC(6,3),
  total_cost      NUMERIC(12,2),
  mileage         INTEGER,
  fuel_card_number TEXT,
  station_name    TEXT,
  station_city    TEXT,
  driver          TEXT,
  notes           TEXT,
  synced_from_api BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fuel_vehicle ON fuel_logs(vehicle_id, fill_date DESC);

-- ─── INTEGRATION CREDENTIALS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_credentials (
  id              SERIAL      PRIMARY KEY,
  service         TEXT        NOT NULL CHECK (service IN ('petromin','aldrees')),
  username        TEXT,
  api_key_hash    TEXT,
  account_number  TEXT,
  card_number     TEXT,
  last_sync_at    TIMESTAMPTZ,
  sync_status     TEXT        NOT NULL DEFAULT 'idle' CHECK (sync_status IN ('idle','syncing','ok','error')),
  error_message   TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (service)
);

-- ─── SYNC LOGS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_logs (
  id              SERIAL      PRIMARY KEY,
  service         TEXT        NOT NULL,
  records_synced  INTEGER     NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL CHECK (status IN ('ok','error','partial')),
  error_message   TEXT,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sync_service ON sync_logs(service, synced_at DESC);

-- ─── MAINTENANCE ALERTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_alerts (
  id              SERIAL      PRIMARY KEY,
  vehicle_id      INTEGER     NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  alert_type      TEXT        NOT NULL,
  message         TEXT        NOT NULL,
  severity        TEXT        NOT NULL CHECK (severity IN ('info','warning','critical')),
  due_date        DATE,
  due_mileage     INTEGER,
  resolved        BOOLEAN     NOT NULL DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alerts_vehicle ON maintenance_alerts(vehicle_id, resolved, created_at DESC);
