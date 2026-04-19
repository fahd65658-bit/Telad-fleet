'use strict';

const jwt = require('jsonwebtoken');

module.exports = function requireGitHubAppAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'telad-fleet-dev-only-not-for-production');
    if (payload?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
