// backend/db.js - اتصال مرن بقاعدة البيانات PostgreSQL
'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'telad_fleet',
  user:     process.env.DB_USER || 'telad_user',
  password: process.env.DB_PASS || '',
  max:      10,
  idleTimeoutMillis: 30000,
});

// اختبار الاتصال عند بدء التشغيل
pool.query('SELECT NOW()')
  .then(() => console.log('✅ PostgreSQL متصل بنجاح'))
  .catch(err => console.warn('⚠️ PostgreSQL غير متصل — يعمل بالذاكرة المؤقتة:', err.message));

module.exports = { pool };
