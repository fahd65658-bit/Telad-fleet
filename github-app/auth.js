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
      // GitHub App JWT must expire within 10 minutes; use 9 minutes for safety margin.
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
  const normalizedInstallationId = String(installationId || '').trim();
  if (!/^\d+$/.test(normalizedInstallationId)) {
    throw new Error('installationId غير صالح.');
  }

  const response = await fetch(`${GITHUB_API_BASE}/app/installations/${encodeURIComponent(normalizedInstallationId)}/access_tokens`, {
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
const jwt = require('jsonwebtoken');

// GitHub installation tokens typically expire after ~1 hour; cache for 50 minutes.
const INSTALLATION_TOKEN_CACHE_TTL_MS = Number(process.env.GITHUB_APP_TOKEN_CACHE_MS || (50 * 60 * 1000));
const installationTokenCache = new Map();

let appClient = null;
let octokitRestCtor = null;

function getPrivateKey() {
  const key = process.env.GITHUB_APP_PRIVATE_KEY || '';
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}

function getAppClient() {
  if (appClient) return appClient;

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = getPrivateKey();

  if (!appId || !privateKey) {
    throw new Error('GitHub App is not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.');
  }

  let App;
  try {
    ({ App } = require('@octokit/app'));
  } catch (error) {
    throw new Error(`@octokit/app is not available: ${error.message}`);
  }

  appClient = new App({ appId, privateKey });
  return appClient;
}

function getOctokitCtor() {
  if (octokitRestCtor) return octokitRestCtor;

  try {
    ({ Octokit: octokitRestCtor } = require('@octokit/rest'));
  } catch (error) {
    throw new Error(`@octokit/rest is not available: ${error.message}`);
  }

  return octokitRestCtor;
}

/**
 * Generate a signed GitHub App JWT using environment configuration.
 *
 * @returns {string} Signed JWT valid for up to 10 minutes.
 * @throws {Error} If required environment variables are missing.
 */
function generateJWT() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = getPrivateKey();

  if (!appId || !privateKey) {
    throw new Error('GitHub App is not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.');
  }

  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iat: now - 60,
      exp: now + (10 * 60),
      iss: appId,
    },
    privateKey,
    { algorithm: 'RS256' },
  );
}

/**
 * Get a GitHub App installation access token with in-memory caching.
 *
 * @param {number|string} installationId - The GitHub App installation ID.
 * @returns {Promise<string>} Installation access token.
 * @throws {Error} If installation ID is missing or token cannot be created.
 */
async function getInstallationToken(installationId) {
  if (!installationId) {
    throw new Error('installationId is required to get an installation token.');
  }

  const cacheKey = String(installationId);
  const cached = installationTokenCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const app = getAppClient();

  const tokenResponse = await app.getInstallationAccessToken({
    installationId: Number(installationId),
  });

  let token = tokenResponse;
  let expiresAtMs = Date.now() + INSTALLATION_TOKEN_CACHE_TTL_MS;

  if (tokenResponse && typeof tokenResponse === 'object') {
    token = tokenResponse.token;
    if (tokenResponse.expiresAt) {
      expiresAtMs = Math.min(
        Date.parse(tokenResponse.expiresAt) - 30 * 1000,
        Date.now() + INSTALLATION_TOKEN_CACHE_TTL_MS,
      );
    }
  }

  installationTokenCache.set(cacheKey, {
    token,
    expiresAt: expiresAtMs,
  });

  return token;
}

/**
 * Verify GitHub webhook signature using HMAC SHA-256.
 *
 * @param {Buffer|string} rawBody - Raw request body as Buffer or string.
 * @param {string} signatureHeader - The value from x-hub-signature-256 header.
 * @returns {boolean} True when signature matches configured webhook secret.
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;

  if (!secret || !signatureHeader) {
    return false;
  }

  const payloadBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(payloadBuffer).digest('hex')}`;

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const signatureBuffer = Buffer.from(String(signatureHeader), 'utf8');

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

/**
 * Build an authenticated Octokit client for an installation.
 *
 * @param {number|string} installationId - The GitHub App installation ID.
 * @returns {Promise<object>} Authenticated Octokit REST client.
 */
async function getAuthenticatedOctokit(installationId) {
  const token = await getInstallationToken(installationId);
  const Octokit = getOctokitCtor();
  return new Octokit({ auth: token });
}

module.exports = {
  generateJWT,
  getInstallationToken,
  verifyWebhookSignature,
  refreshTokenIfExpired,
  getAuthenticatedOctokit,
  getPrivateKey,
  getAuthenticatedOctokit,
};
