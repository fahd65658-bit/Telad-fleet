'use strict';

const jwt = require('jsonwebtoken');

function requireAdminJwt(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'غير مصرح: رمز المصادقة مطلوب.' });
  }

  const secret = process.env.GITHUB_APP_ADMIN_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    return res.status(401).json({ error: 'غير مصرح: إعدادات المصادقة غير مكتملة.' });
  }

  try {
    const decoded = jwt.verify(token, secret);
    if (decoded.role !== 'admin') {
      return res.status(401).json({ error: 'غير مصرح: صلاحية المدير مطلوبة.' });
    }
    req.admin = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: 'غير مصرح: رمز المصادقة غير صالح أو منتهي.' });
  }
}

module.exports = {
  requireAdminJwt,
};
