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

module.exports = { newId, paginate };
