#!/usr/bin/env node
'use strict';
/**
 * TELAD FLEET – Connection diagnostics
 * Usage: node tests/test-connections.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });

const http = require('http');

async function checkHttp(label, url) {
  return new Promise(resolve => {
    const req = http.get(url, res => {
      console.log(`  ✅ ${label}: HTTP ${res.statusCode}`);
      resolve(true);
    });
    req.on('error', err => {
      console.log(`  ❌ ${label}: ${err.message}`);
      resolve(false);
    });
    req.setTimeout(3000, () => {
      console.log(`  ❌ ${label}: timeout`);
      req.destroy();
      resolve(false);
    });
  });
}

async function run() {
  console.log('\n🔌 TELAD FLEET – Connection Diagnostics\n');
  console.log('── Environment ────────────────────────────────');
  console.log(`  NODE_ENV : ${process.env.NODE_ENV || 'not set'}`);
  console.log(`  PORT     : ${process.env.PORT     || '5000 (default)'}`);
  console.log(`  DB_HOST  : ${process.env.DB_HOST  || 'not set'}`);
  console.log(`  DB_NAME  : ${process.env.DB_NAME  || 'not set'}`);

  console.log('\n── Backend Health ─────────────────────────────');
  const port = process.env.PORT || 5000;
  await checkHttp('Backend API', `http://localhost:${port}/health`);

  console.log('\n── Summary ────────────────────────────────────');
  console.log('  Run the backend first: cd backend && npm start');
  console.log('  Then re-run this script.\n');
}

run().catch(err => {
  console.error('Diagnostics error:', err.message);
  process.exit(1);
});
