'use strict';

function notFound(req, res) {
  res.status(404).json({ error: 'المسار غير موجود' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[TELAD FLEET ERROR]', err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'خطأ داخلي في الخادم' });
}

module.exports = { notFound, errorHandler };
