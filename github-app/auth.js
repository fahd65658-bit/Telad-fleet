'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Octokit } = require('@octokit/rest');

const GITHUB_API_BASE = 'https://api.github.com';
const tokenCache = new Map();

/**
 * Read the GitHub App private key from env inline value or file path.
 * @returns {string}
 */
function getPrivateKey() {
  const inline = process.env.GITHUB_APP_PRIVATE_KEY;
  if (inline) {
    return inline.replace(/\\n/g, '\n');
  }

  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH || path.join(process.cwd(), 'github-app', 'private-key.pem');
  try {
    return fs.readFileSync(keyPath, 'utf8');
  } catch (error) {
    throw new Error(`تعذّر قراءة المفتاح الخاص للتطبيق: ${error.message}`);
  }
}

/**
 * Generate a short-lived JWT for GitHub App authentication.
 * @param {string|number} appId
 * @param {string} privateKey
 * @returns {string}
 */
function generateJWT(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iat: now - 60,
      exp: now + (9 * 60),
      iss: String(appId),
    },
    privateKey,
    { algorithm: 'RS256' }
  );
}

/**
 * Verify webhook signature using HMAC SHA-256.
 * @param {Buffer|string} payload
 * @param {string} signature
 * @param {string} secret
 * @returns {boolean}
 */
function verifyWebhookSignature(payload, signature, secret) {
  if (!signature || !secret) return false;

  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || '', 'utf8');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  const digest = `sha256=${hmac.digest('hex')}`;

  const digestBuffer = Buffer.from(digest, 'utf8');
  const sigBuffer = Buffer.from(signature, 'utf8');
  if (digestBuffer.length !== sigBuffer.length) return false;

  return crypto.timingSafeEqual(digestBuffer, sigBuffer);
}

/**
 * Fetch installation token from GitHub API.
 * @param {string|number} installationId
 * @param {string} jwtToken
 * @returns {Promise<{token: string, expires_at: string}>}
 */
async function getInstallationToken(installationId, jwtToken) {
  const response = await fetch(`${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${jwtToken}`,
      'User-Agent': process.env.GITHUB_APP_NAME || 'telad-fleet-manager',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`فشل توليد Installation Token (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Refresh a cached installation token when it is near expiry.
 * @param {{token: string, expiresAt: number, installationId: string|number}} cachedToken
 * @returns {Promise<{token: string, expiresAt: number, installationId: string|number}>}
 */
async function refreshTokenIfExpired(cachedToken) {
  const now = Date.now();
  const safeWindowMs = 60 * 1000;

  if (cachedToken && cachedToken.token && cachedToken.expiresAt > now + safeWindowMs) {
    return cachedToken;
  }

  if (!cachedToken || !cachedToken.installationId) {
    throw new Error('معلومة installationId مطلوبة لتحديث التوكن.');
  }

  const appId = process.env.GITHUB_APP_ID;
  if (!appId) throw new Error('GITHUB_APP_ID غير مضبوط.');

  const privateKey = getPrivateKey();
  const appJwt = generateJWT(appId, privateKey);
  const tokenPayload = await getInstallationToken(cachedToken.installationId, appJwt);

  return {
    installationId: cachedToken.installationId,
    token: tokenPayload.token,
    expiresAt: new Date(tokenPayload.expires_at).getTime(),
  };
}

/**
 * Build an authenticated Octokit instance for an installation.
 * @param {string|number} installationId
 * @returns {Promise<import('@octokit/rest').Octokit>}
 */
async function getAuthenticatedOctokit(installationId) {
  const cacheKey = String(installationId);
  const existing = tokenCache.get(cacheKey) || { installationId };
  const refreshed = await refreshTokenIfExpired(existing);
  tokenCache.set(cacheKey, refreshed);

  return new Octokit({ auth: refreshed.token });
}

module.exports = {
  generateJWT,
  getInstallationToken,
  verifyWebhookSignature,
  refreshTokenIfExpired,
  getAuthenticatedOctokit,
  getPrivateKey,
};
