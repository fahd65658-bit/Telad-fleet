'use strict';

const rateLimit = require('express-rate-limit');

const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'عدد كبير من طلبات Webhook، حاول مرة أخرى لاحقاً' },
});

const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'عدد كبير من الطلبات، حاول مرة أخرى لاحقاً' },
});

module.exports = {
  webhookRateLimit,
  apiRateLimit,
};
