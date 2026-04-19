'use strict';

const rateLimit = require('express-rate-limit');

const webhookRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'تم تجاوز الحد المسموح لطلبات Webhook. حاول لاحقاً.',
  },
});

const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'عدد الطلبات كبير جداً. الرجاء المحاولة بعد دقيقة.',
  },
});

module.exports = {
  webhookRateLimit,
  apiRateLimit,
};
