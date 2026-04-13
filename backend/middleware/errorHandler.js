'use strict';

const logger = require('../utils/logger');

function notFound(_req, res) {
  res.status(404).json({ error: 'المسار غير موجود' });
}

function globalErrorHandler(err, _req, res, _next) {
  logger.error('[TELAD FLEET ERROR]', err.message);
  res.status(500).json({ error: 'خطأ داخلي في الخادم' });
}

module.exports = { notFound, globalErrorHandler };
