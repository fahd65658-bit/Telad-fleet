'use strict';

const jwt = require('jsonwebtoken');

/**
 * Validate admin JWT for protected GitHub App routes.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireAdminJwt(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'مطلوب توكن JWT للوصول إلى هذا المسار.' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(503).json({ error: 'JWT_SECRET غير مُعد في الخادم.' });
    }

    const decoded = jwt.verify(token, secret);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'هذه العملية متاحة للمدير فقط.' });
    }

    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'توكن غير صالح أو منتهي الصلاحية.' });
  }
}

/**
 * Validate GitHub App installation context.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireInstallationAccess(req, res, next) {
  const installationId =
    req.query.installationId ||
    req.body?.installationId ||
    process.env.GITHUB_APP_INSTALLATION_ID;

  if (!installationId) {
    return res.status(400).json({ error: 'مطلوب installationId لتنفيذ هذه العملية.' });
  }

  req.githubInstallationId = String(installationId);
  return next();
}

module.exports = {
  requireAdminJwt,
  requireInstallationAccess,
};
