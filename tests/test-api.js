#!/usr/bin/env node
'use strict';
/**
 * TELAD FLEET – Basic API smoke tests
 * Usage: node tests/test-api.js [baseUrl]
 * Default baseUrl: http://localhost:5000
 */

const http    = require('http');
const https   = require('https');
const baseUrl = process.argv[2] || 'http://localhost:5000';

let passed = 0;
let failed = 0;

async function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url     = new URL(path, baseUrl);
    const isHttps = url.protocol === 'https:';
    const mod     = isHttps ? https : http;
    const data    = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type':  'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    const req = mod.request(options, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(label, condition, extra = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label} ${extra}`);
    failed++;
  }
}

async function run() {
  console.log(`\n🧪 TELAD FLEET API Tests → ${baseUrl}\n`);

  // Health check
  console.log('── Health ─────────────────────────────────────');
  const health = await request('GET', '/health');
  assert('GET /health returns 200',             health.status === 200);
  assert('health.status is "ok"',               health.body.status === 'ok');
  assert('health.system is "TELAD FLEET"',      health.body.system === 'TELAD FLEET');

  // Auth – bad credentials
  console.log('\n── Auth ───────────────────────────────────────');
  const badLogin = await request('POST', '/auth/login', { username: 'bad', password: 'bad' });
  assert('Login with bad creds returns 401',    badLogin.status === 401);

  // Auth – missing fields
  const noBody = await request('POST', '/auth/login', {});
  assert('Login without body returns 400',      noBody.status === 400);

  // Auth – valid login
  const login = await request('POST', '/auth/login', { username: 'F', password: '0241' });
  assert('Login with admin creds returns 200',  login.status === 200);
  assert('Login returns a token',               typeof login.body.token === 'string');

  const token = login.body.token;

  // Auth/me
  const me = await request('GET', '/auth/me', null, token);
  assert('GET /auth/me returns 200',            me.status === 200);
  assert('/auth/me returns username F',          me.body.username === 'F');

  // Protected route without token
  const noAuth = await request('GET', '/vehicles');
  assert('GET /vehicles without token → 401',   noAuth.status === 401);

  // Vehicles
  console.log('\n── Vehicles ───────────────────────────────────');
  const vList = await request('GET', '/vehicles', null, token);
  assert('GET /vehicles returns 200',            vList.status === 200);
  assert('Vehicles response is array',           Array.isArray(vList.body));

  const vNew = await request('POST', '/vehicles', { name: 'Test Vehicle', plate: 'TST-9999' }, token);
  assert('POST /vehicles creates vehicle',       vNew.status === 201);
  assert('New vehicle has id',                   typeof vNew.body.id === 'string');

  if (vNew.body.id) {
    const vDel = await request('DELETE', `/vehicles/${vNew.body.id}`, null, token);
    assert('DELETE /vehicles/:id returns ok',    vDel.body.ok === true);
  }

  // Dashboard
  console.log('\n── Dashboard ──────────────────────────────────');
  const dash = await request('GET', '/dashboard', null, token);
  assert('GET /dashboard returns 200',           dash.status === 200);

  // 404
  console.log('\n── 404 ────────────────────────────────────────');
  const miss = await request('GET', '/nonexistent', null, token);
  assert('Unknown route returns 404',            miss.status === 404);

  // Summary
  console.log(`\n${'─'.repeat(48)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});
