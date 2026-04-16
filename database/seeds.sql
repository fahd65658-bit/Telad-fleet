-- ═══════════════════════════════════════════════════════════════════════
-- TELAD FLEET – Seed Data
-- Run AFTER schema.sql: psql -U telad_user -d telad_fleet -f seeds.sql
-- ═══════════════════════════════════════════════════════════════════════

-- Users (passwords are bcrypt hashes — regenerate for production)
-- admin: F / 0241
INSERT INTO users (name, username, email, password_hash, role) VALUES
  ('مدير النظام',   'F',        'admin@fna.sa',       '$2a$10$eCM3DqJSdxNWBHF8AqHUhuH5R.g.uEjcBBTX1xtsMh6RdM/H8j3Ve', 'admin'),
  ('مشرف العمليات', 'supervisor1','super@fna.sa',     '$2a$10$eCM3DqJSdxNWBHF8AqHUhuH5R.g.uEjcBBTX1xtsMh6RdM/H8j3Ve', 'supervisor'),
  ('مشغل النظام',   'operator1',  'op@fna.sa',        '$2a$10$eCM3DqJSdxNWBHF8AqHUhuH5R.g.uEjcBBTX1xtsMh6RdM/H8j3Ve', 'operator')
ON CONFLICT (username) DO NOTHING;

-- Cities
INSERT INTO cities (name, region, created_by) VALUES
  ('الرياض',  'منطقة الرياض',   'F'),
  ('جدة',     'منطقة مكة',      'F'),
  ('الدمام',  'المنطقة الشرقية','F'),
  ('أبها',    'منطقة عسير',     'F'),
  ('المدينة المنورة','منطقة المدينة','F')
ON CONFLICT DO NOTHING;

-- Projects
INSERT INTO projects (name, city_id, status, start_date, created_by) VALUES
  ('مشروع صيانة الطرق - الرياض',  1, 'active',    '2024-01-01', 'F'),
  ('مشروع النقل الحضري - جدة',     2, 'active',    '2024-02-01', 'F'),
  ('مشروع توزيع البضائع - الدمام', 3, 'active',    '2024-03-01', 'F'),
  ('مشروع خدمات أبها',             4, 'suspended', '2023-06-01', 'F')
ON CONFLICT DO NOTHING;

-- Vehicles
INSERT INTO vehicles (name, plate, model, year, city, project_id, status, created_by) VALUES
  ('شاحنة رقم 1',   'ABC-1234', 'Toyota Hilux',    2022, 'الرياض', 1, 'active',      'F'),
  ('شاحنة رقم 2',   'DEF-5678', 'Ford Transit',    2021, 'جدة',    2, 'active',      'F'),
  ('سيارة رقم 3',   'GHI-9012', 'Toyota Camry',    2023, 'الدمام', 3, 'active',      'F'),
  ('حافلة رقم 4',   'JKL-3456', 'Mercedes Sprinter',2020,'الرياض', 1, 'maintenance', 'F'),
  ('شاحنة رقم 5',   'MNO-7890', 'Isuzu NQR',       2019, 'جدة',    2, 'inactive',    'F')
ON CONFLICT (plate) DO NOTHING;

-- Employees
INSERT INTO employees (name, role, phone, national_id, city, project_id, status, created_by) VALUES
  ('محمد عبدالله',  'سائق',     '0501234567', '1000000001', 'الرياض', 1, 'active',   'F'),
  ('أحمد محمد',     'سائق',     '0509876543', '1000000002', 'جدة',    2, 'active',   'F'),
  ('خالد إبراهيم',  'مشرف',     '0555555555', '1000000003', 'الدمام', 3, 'active',   'F'),
  ('فهد سالم',      'سائق',     '0544444444', '1000000004', 'الرياض', 1, 'leave',    'F'),
  ('عمر يوسف',      'فني',      '0533333333', '1000000005', 'جدة',    2, 'active',   'F')
ON CONFLICT DO NOTHING;

-- Maintenance records
INSERT INTO maintenance (vehicle_id, type, description, cost, workshop, service_date, next_date, created_by) VALUES
  (1, 'صيانة دورية',    'تغيير زيت ومرشحات',          500.00,  'ورشة الرياض',  '2024-01-15', '2024-04-15', 'F'),
  (2, 'إصلاح إطارات',   'تغيير 4 إطارات',             1200.00, 'ورشة جدة',     '2024-02-10', NULL,         'F'),
  (4, 'صيانة شاملة',    'فحص كامل وإصلاح الفرامل',   3500.00, 'ورشة الرياض',  '2024-03-01', '2024-09-01', 'F'),
  (1, 'فحص دوري',       'فحص السلامة السنوي',          200.00,  'مركز الفحص',   '2024-03-20', '2025-03-20', 'F')
ON CONFLICT DO NOTHING;
