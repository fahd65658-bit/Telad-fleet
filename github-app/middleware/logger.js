'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.GITHUB_APP_LOG_DIR || path.join(process.cwd(), 'github-app', 'logs');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function currentLogFile(prefix) {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `${prefix}-${day}.log`);
}

function appendLog(prefix, message) {
  ensureLogDir();
  fs.appendFileSync(currentLogFile(prefix), `${new Date().toISOString()} ${message}\n`, 'utf8');
}

function webhookLogger(req, _res, next) {
  const event = req.headers['x-github-event'] || 'unknown';
  const delivery = req.headers['x-github-delivery'] || 'n/a';
  appendLog('webhook', `[${event}] delivery=${delivery}`);
  next();
}

function errorLogger(err, req, _res, next) {
  appendLog('error', `[${req.method} ${req.originalUrl}] ${err.message}`);
  next(err);
}

module.exports = {
  webhookLogger,
  errorLogger,
  appendLog,
};
