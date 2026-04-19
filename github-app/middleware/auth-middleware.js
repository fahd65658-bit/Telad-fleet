'use strict';

const jwt = require('jsonwebtoken');

/**
 * Creates admin-only middleware for GitHub App setup routes.
 * @param {{jwtSecret?: string}} options Auth options.
 * @returns {import('express').RequestHandler} Express middleware.
 */
function createAdminAuthMiddleware(options = {}) {
  const secret = options.jwtSecret || process.env.JWT_SECRET;
  return (req, res, next) => {
    if (!secret) return res.status(500).json({ error: 'JWT_SECRET غير مضبوط في الخادم' });
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'رمز المصادقة مطلوب' });
    try {
      const decoded = jwt.verify(token, secret);
      if (decoded.role !== 'admin') return res.status(403).json({ error: 'يجب أن تكون مديراً' });
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ error: 'رمز المصادقة غير صالح' });
    }
  };
}

module.exports = { createAdminAuthMiddleware };
