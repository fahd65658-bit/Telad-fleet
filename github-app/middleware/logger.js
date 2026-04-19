'use strict';

function pm2Line(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const eventType = meta.eventType || '-';
  const deliveryId = meta.deliveryId || '-';
  return `[${timestamp}] [GitHubApp] [${level}] event=${eventType} delivery=${deliveryId} ${message}`;
}

function githubEventLogger(req, _res, next) {
  const eventType = req.headers['x-github-event'] || 'unknown';
  const deliveryId = req.headers['x-github-delivery'] || 'unknown';
  console.log(pm2Line('INFO', 'Incoming webhook event', { eventType, deliveryId }));
  next();
}

function logError(error, meta = {}) {
  console.error(pm2Line('ERROR', error.message || 'Unknown error', meta));
  if (error.stack) {
    console.error(error.stack);
  }
}

module.exports = {
  githubEventLogger,
  logError,
  pm2Line,
};
