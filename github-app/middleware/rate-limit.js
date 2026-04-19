'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Creates dedicated rate limiter for GitHub App API routes.
 * @returns {import('express').RequestHandler} Rate limiter middleware.
 */
function createGitHubRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'تم تجاوز حد طلبات GitHub API مؤقتاً' },
  });
}

module.exports = { createGitHubRateLimiter };
