'use strict';
/**
 * TELAD FLEET – JWT Auth Module
 * Access Token  (short-lived: 15m)  → sent in Authorization header
 * Refresh Token (long-lived: 7d)    → stored in HttpOnly Secure cookie
 * Rotation: each /auth/refresh issues a new pair and invalidates the old token
 */

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_SECRET  = process.env.JWT_SECRET        || 'telad-access-super-secret-2024!';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET|| 'telad-refresh-super-secret-2024!';
const ACCESS_TTL     = process.env.JWT_EXPIRES_IN    || '15m';  // short
const REFRESH_TTL    = '7d';

// In-memory refresh-token whitelist: Map<tokenId, { userId, expiresAt }>
// On a real deployment, store in Redis or Postgres
const _whitelist     = new Map();

// ── Token generation ────────────────────────────────────────────────────────
function issueTokens(user) {
  const jti    = crypto.randomUUID();        // unique token ID for the refresh token
  const payload = { id: user.id, username: user.username, name: user.name, role: user.role };

  const accessToken  = jwt.sign(payload, ACCESS_SECRET,  { expiresIn: ACCESS_TTL,  issuer: 'telad-fleet' });
  const refreshToken = jwt.sign({ ...payload, jti },     REFRESH_SECRET, { expiresIn: REFRESH_TTL, issuer: 'telad-fleet' });

  // Register refresh token
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  _whitelist.set(jti, { userId: user.id, expiresAt });

  // Prune expired entries lazily
  if (_whitelist.size > 5000) {
    const now = Date.now();
    for (const [k, v] of _whitelist) { if (v.expiresAt < now) _whitelist.delete(k); }
  }

  return { accessToken, refreshToken };
}

// ── Verify helpers ──────────────────────────────────────────────────────────
function verifyAccess(token) {
  return jwt.verify(token, ACCESS_SECRET, { issuer: 'telad-fleet' });
}

function verifyRefresh(token) {
  const payload = jwt.verify(token, REFRESH_SECRET, { issuer: 'telad-fleet' });
  const entry   = _whitelist.get(payload.jti);
  if (!entry || entry.expiresAt < Date.now()) throw new Error('revoked');
  // Rotate: revoke the used token immediately (one-time use)
  _whitelist.delete(payload.jti);
  return payload;
}

// ── Cookie helpers ──────────────────────────────────────────────────────────
const COOKIE_NAME = 'telad_rt';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict',
  secure:   process.env.NODE_ENV === 'production',
  maxAge:   7 * 24 * 60 * 60 * 1000,   // 7 days
  path:     '/api/auth',
};

function setRefreshCookie(res, refreshToken) {
  res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTS);
}

function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTS, maxAge: 0 });
}

function getRefreshFromCookie(req) {
  return (req.cookies && req.cookies[COOKIE_NAME]) || null;
}

// ── Express middleware ───────────────────────────────────────────────────────
const ROLES = { admin: 4, supervisor: 3, operator: 2, viewer: 1 };

function auth(minRole = 'viewer') {
  return (req, res, next) => {
    const hdr   = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });
    try {
      req.user = verifyAccess(token);
      if ((ROLES[req.user.role] || 0) < (ROLES[minRole] || 0))
        return res.status(403).json({ error: 'صلاحية غير كافية' });
      next();
    } catch (err) {
      const msg = err.name === 'TokenExpiredError'
        ? 'انتهت صلاحية الجلسة – يرجى تجديدها'
        : 'جلسة غير صالحة – سجّل دخولك مجدداً';
      res.status(401).json({ error: msg, code: err.name });
    }
  };
}

module.exports = { issueTokens, verifyAccess, verifyRefresh, setRefreshCookie, clearRefreshCookie, getRefreshFromCookie, auth, ROLES };
