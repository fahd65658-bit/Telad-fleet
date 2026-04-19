'use strict';

const rateLimit = require('express-rate-limit');

const webhookRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  webhookRateLimit,
  apiRateLimit,
};
