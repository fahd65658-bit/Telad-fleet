'use strict';

const { VALID_ROLES } = require('./constants');

function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

function isNonEmptyString(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = { isValidRole, isNonEmptyString, isValidEmail };
