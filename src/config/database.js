'use strict';
/**
 * Database configuration module.
 * Currently uses in-memory store.  Swap the exported `query` function
 * for a real pg.Pool when PostgreSQL is available.
 */

const env = require('./environment');

// In-memory data store (replace with pg.Pool for PostgreSQL)
const store = {
  users:            [],
  cities:           [],
  projects:         [],
  vehicles:         [],
  employees:        [],
  maintenance:      [],
  drivers:          [],
  forms:            [],
  deliveries:       [],
  auditLogs:        [],
};

// Seeded default admin
const bcrypt = require('bcryptjs');
store.users.push({
  id:           1,
  name:         'مدير النظام',
  username:     'F',
  email:        'admin@fna.sa',
  passwordHash: bcrypt.hashSync('0241', 10),
  role:         'admin',
  active:       true,
  createdAt:    new Date().toISOString(),
});

module.exports = { store, env };
