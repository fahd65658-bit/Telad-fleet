'use strict';

const { IS_PROD } = require('../config/environment');

function log(level, ...args) {
  const ts = new Date().toISOString();
  if (level === 'error') {
    console.error(`[${ts}] [ERROR]`, ...args);
  } else if (!IS_PROD || level !== 'debug') {
    console.log(`[${ts}] [${level.toUpperCase()}]`, ...args);
  }
}

const logger = {
  info:  (...a) => log('info',  ...a),
  warn:  (...a) => log('warn',  ...a),
  error: (...a) => log('error', ...a),
  debug: (...a) => log('debug', ...a),
};

module.exports = logger;
