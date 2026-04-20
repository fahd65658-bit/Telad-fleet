'use strict';

const crypto = require('crypto');
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
  getAuthenticatedOctokit,
};
