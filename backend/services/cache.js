'use strict';

const logger = require('../utils/logger');

let client = null;

async function connect() {
  if (!process.env.REDIS_URL) {
    logger.warn('REDIS_URL not set — caching disabled');
    return;
  }
  try {
    const redis = require('redis');
    client = redis.createClient({ url: process.env.REDIS_URL });
    client.on('error', err => logger.warn('Redis error:', err.message));
    await client.connect();
    logger.info('Redis connected');
  } catch (err) {
    logger.warn('Redis unavailable — caching disabled:', err.message);
    client = null;
  }
}

async function get(key) {
  if (!client) return null;
  try {
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

async function set(key, value, ttl = 60) {
  if (!client) return;
  try {
    await client.set(key, JSON.stringify(value), { EX: ttl });
  } catch { /* silent */ }
}

async function del(key) {
  if (!client) return;
  try { await client.del(key); } catch { /* silent */ }
}

module.exports = { connect, get, set, del };
