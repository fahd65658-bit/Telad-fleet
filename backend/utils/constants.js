'use strict';

const ROLES = {
  ADMIN:      'admin',
  SUPERVISOR: 'supervisor',
  OPERATOR:   'operator',
  VIEWER:     'viewer',
};

const VALID_ROLES = Object.values(ROLES);

module.exports = { ROLES, VALID_ROLES };
