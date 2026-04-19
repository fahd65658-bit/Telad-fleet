'use strict';

/**
 * Logs GitHub App request/response lifecycle.
 * @returns {import('express').RequestHandler} Middleware handler.
 */
function githubAppLogger() {
  return (req, _res, next) => {
    req._githubAppStartedAt = Date.now();
    next();
  };
}

/**
 * Finalizes route log line after response close.
 * @returns {import('express').RequestHandler} Middleware handler.
 */
function githubAppLoggerFinalize() {
  return (req, res, next) => {
    res.on('finish', () => {
      const startedAt = req._githubAppStartedAt || Date.now();
      const elapsedMs = Date.now() - startedAt;
      console.log(`[GitHubApp] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${elapsedMs}ms)`);
    });
    next();
  };
}

module.exports = {
  githubAppLogger,
  githubAppLoggerFinalize,
};
