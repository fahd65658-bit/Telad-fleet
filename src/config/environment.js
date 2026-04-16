'use strict';

require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD  = NODE_ENV === 'production';

// Fail fast in production if critical secrets are missing
if (IS_PROD) {
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DB_PASS'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

module.exports = {
  NODE_ENV,
  IS_PROD,
  PORT:         parseInt(process.env.PORT, 10) || 5000,

  JWT_SECRET:         process.env.JWT_SECRET         || 'telad-fleet-dev-only-not-for-production',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'telad-fleet-refresh-dev-only',
  JWT_EXPIRES_IN:     process.env.JWT_EXPIRES_IN     || '8h',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  CORS_ORIGINS: [
    'https://fna.sa',
    'https://www.fna.sa',
    'https://fleet.fna.sa',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5500',
    'null',
  ],

  DB: {
    host:     process.env.DB_HOST || 'localhost',
    port:     parseInt(process.env.DB_PORT, 10) || 5432,
    name:     process.env.DB_NAME || 'telad_fleet',
    user:     process.env.DB_USER || 'telad_user',
    password: process.env.DB_PASS || '',
  },

  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',
  SIGNING_KEY:    process.env.SIGNING_KEY    || '',

  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  REDIS_URL:      process.env.REDIS_URL      || 'redis://localhost:6379',
  APP_URL:        process.env.APP_URL        || 'http://localhost:5000',
};
