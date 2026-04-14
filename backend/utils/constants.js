'use strict';

const ROLES = {
  ADMIN:      'admin',
  SUPERVISOR: 'supervisor',
  OPERATOR:   'operator',
  VIEWER:     'viewer',
};

const VALID_ROLES = Object.values(ROLES);

const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT:     100,
};

const JWT_SECRET_FALLBACK = 'telad-fleet-dev-only-not-for-production';

module.exports = { ROLES, VALID_ROLES, PAGINATION, JWT_SECRET_FALLBACK };
