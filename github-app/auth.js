'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Octokit } = require('@octokit/rest');

const TOKEN_REFRESH_WINDOW_MS = 60 * 1000;
const installationTokenCache = new Map();

/**
 * Resolves GitHub App private key from env value or configured key path.
 * @returns {string} Private key text.
 */
function resolvePrivateKey() {
  if (process.env.GITHUB_APP_PRIVATE_KEY) {
    return process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH
    ? path.resolve(process.env.GITHUB_APP_PRIVATE_KEY_PATH)
    : path.resolve(__dirname, 'private-key.pem');
  return fs.readFileSync(keyPath, 'utf8');
}

/**
 * Generates a GitHub App JWT used for app-level API authentication.
 * @param {string|number} appId GitHub App ID.
 * @param {string} privateKey GitHub App private key in PEM format.
 * @returns {string} Signed JWT token.
 */
function generateJWT(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iat: now - 30,
      exp: now + 9 * 60,
      iss: String(appId),
    },
    privateKey,
    { algorithm: 'RS256' },
  );
}

/**
 * Requests a fresh installation access token from GitHub API.
 * @param {string|number} installationId GitHub App installation ID.
 * @returns {Promise<{token: string, expiresAt: string, installationId: string}>} Token payload.
 */
async function requestInstallationToken(installationId) {
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) throw new Error('GITHUB_APP_ID is missing');
  const privateKey = resolvePrivateKey();
  const appJwt = generateJWT(appId, privateKey);
  const octokit = new Octokit({ auth: appJwt });
  const response = await octokit.request(
    'POST /app/installations/{installation_id}/access_tokens',
    { installation_id: installationId },
  );
  return {
    token: response.data.token,
    expiresAt: response.data.expires_at,
    installationId: String(installationId),
  };
}

/**
 * Returns installation access token with in-memory caching.
 * @param {string|number} installationId GitHub App installation ID.
 * @returns {Promise<{token: string, expiresAt: string, installationId: string}>} Token payload.
 */
async function getInstallationToken(installationId) {
  const resolvedInstallationId = String(
    installationId || process.env.GITHUB_APP_INSTALLATION_ID || '',
  ).trim();
  if (!resolvedInstallationId) throw new Error('GITHUB_APP_INSTALLATION_ID is missing');

  const cached = installationTokenCache.get(resolvedInstallationId);
  if (cached) {
    const expiresAtMs = new Date(cached.expiresAt).getTime();
    if (expiresAtMs - Date.now() > TOKEN_REFRESH_WINDOW_MS) return cached;
  }

  const fresh = await requestInstallationToken(resolvedInstallationId);
  installationTokenCache.set(resolvedInstallationId, fresh);
  return fresh;
}

/**
 * Verifies GitHub webhook signature (`x-hub-signature-256`).
 * @param {Buffer|string} payload Raw webhook request body.
 * @param {string} signature Signature header value.
 * @param {string} secret Shared webhook secret.
 * @returns {boolean} True when signature is valid.
 */
function verifyWebhookSignature(payload, signature, secret) {
  if (!signature || !secret) return false;
  const payloadBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payloadBuffer)
    .digest('hex')}`;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * Refreshes token only when it is missing or expired.
 * @param {{token?: string, expiresAt?: string, installationId?: string}} tokenRecord Token state.
 * @returns {Promise<{token: string, expiresAt: string, installationId: string}|null>} Active token payload.
 */
async function refreshTokenIfExpired(tokenRecord) {
  if (!tokenRecord || !tokenRecord.token || !tokenRecord.expiresAt) return null;
  const expiresAtMs = new Date(tokenRecord.expiresAt).getTime();
  if (expiresAtMs - Date.now() > TOKEN_REFRESH_WINDOW_MS) return tokenRecord;
  if (!tokenRecord.installationId) return null;
  return getInstallationToken(tokenRecord.installationId);
}

/**
 * Returns shallow token cache snapshot for diagnostics.
 * @returns {Array<{installationId: string, expiresAt: string}>} Cached token metadata.
 */
function getTokenCacheSnapshot() {
  return Array.from(installationTokenCache.values()).map((item) => ({
    installationId: item.installationId,
    expiresAt: item.expiresAt,
  }));
}

module.exports = {
  generateJWT,
  getInstallationToken,
  verifyWebhookSignature,
  refreshTokenIfExpired,
  getTokenCacheSnapshot,
};
