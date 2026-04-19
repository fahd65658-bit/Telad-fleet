'use strict';

const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'مطلوب رمز المصادقة' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'إعدادات المصادقة غير مكتملة' });
  }

  try {
    req.user = jwt.verify(token, secret);
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'رمز المصادقة غير صالح أو منتهي' });
  }
}

module.exports = authMiddleware;
