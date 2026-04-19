'use strict';

function logEvent(eventType, deliveryId, data) {
  console.log('[github-app:event]', {
    timestamp: new Date().toISOString(),
    eventType: eventType || 'unknown',
    deliveryId: deliveryId || 'n/a',
    data: data || {},
  });
}

function logError(error, context) {
  console.error(`[${new Date().toISOString()}] [github-app] error`, {
    message: error?.message || String(error),
    stack: error?.stack,
    context: context || {},
  });
}

module.exports = {
  logEvent,
  logError,
};
