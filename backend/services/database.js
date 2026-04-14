'use strict';

const logger = require('../utils/logger');

let pool = null;
let usingPostgres = false;

if (process.env.DATABASE_URL || process.env.DB_HOST) {
  try {
    const { Pool } = require('pg');
    const config = process.env.DATABASE_URL
      ? {
          connectionString: process.env.DATABASE_URL,
          // DB_SSL=true enables SSL; use DB_SSL_REJECT_UNAUTHORIZED=true in production with valid certs
          ssl: process.env.DB_SSL === 'true'
            ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
            : false,
        }
      : {
          host:     process.env.DB_HOST     || 'localhost',
          port:     Number(process.env.DB_PORT) || 5432,
          database: process.env.DB_NAME     || 'telad_fleet',
          user:     process.env.DB_USER     || 'postgres',
          password: process.env.DB_PASS     || '',
        };
    pool = new Pool(config);
    pool.on('error', err => logger.warn('PostgreSQL pool error:', err.message));
    usingPostgres = true;
    logger.info('PostgreSQL connection pool created');
  } catch (err) {
    logger.warn('pg module not available or config error:', err.message);
  }
} else {
  logger.warn('DATABASE_URL not set — running with in-memory store');
}

async function query(text, params) {
  if (!pool) throw new Error('PostgreSQL not configured');
  return pool.query(text, params);
}

module.exports = { query, pool, usingPostgres };
