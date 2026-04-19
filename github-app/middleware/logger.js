'use strict';

function logEvent(eventType, deliveryId, data) {
  console.log(`[${new Date().toISOString()}] [github-app] event=${eventType} delivery=${deliveryId || 'n/a'}`, data || {});
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
