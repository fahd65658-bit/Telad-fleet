'use strict';

const rateLimit = require('express-rate-limit');

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد المسموح لطلبات Webhook. حاول لاحقاً.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'طلبات كثيرة جداً على واجهة GitHub App. حاول بعد دقيقة.' },
});

module.exports = {
  webhookLimiter,
  apiLimiter,
};
