'use strict';

const crypto = require('crypto');

function newId() {
  return crypto.randomUUID();
}

function paginate(arr, page = 1, limit = 20) {
  const start = (page - 1) * limit;
  return {
    data:  arr.slice(start, start + limit),
    total: arr.length,
    page,
    pages: Math.ceil(arr.length / limit),
  };
}

/**
 * Append an audit entry to the given store.
 * @param {object[]} auditLogs - reference to store.auditLogs array
 * @param {string} action
 * @param {string} username
 */
function audit(auditLogs, action, username) {
  auditLogs.push({ id: newId(), action, user: username, time: new Date().toISOString() });
}

module.exports = { newId, paginate, audit };
