'use strict';

function logEvent(type, deliveryId, data = {}) {
  const payload = {
    type,
    deliveryId,
    timestamp: new Date().toISOString(),
    data,
  };

  console.log('[GITHUB_APP_EVENT]', JSON.stringify(payload));
}

function logError(error, context = {}) {
  const payload = {
    message: error?.message || 'Unknown error',
    stack: error?.stack || null,
    timestamp: new Date().toISOString(),
    context,
  };

  console.error('[GITHUB_APP_ERROR]', JSON.stringify(payload));
}

module.exports = {
  logEvent,
  logError,
};
