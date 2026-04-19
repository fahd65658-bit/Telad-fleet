/**
 * GitHub App Authentication Module
 * يدير مصادقة GitHub App لنظام TELAD FLEET
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');

// Token cache to avoid hitting rate limits
const tokenCache = new Map();

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function readPrivateKey() {
  if (process.env.GITHUB_APP_PRIVATE_KEY) {
    return process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
  }

  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  if (!keyPath) return null;

  const resolvedPath = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath);
  if (!fs.existsSync(resolvedPath)) return null;

  return fs.readFileSync(resolvedPath, 'utf8');
}

function getGitHubAppConfig() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = readPrivateKey();
  const enabled = process.env.GITHUB_APP_ENABLED === 'true';
  return {
    enabled,
    appId,
    privateKey,
    ready: Boolean(enabled && appId && privateKey),
  };
}

/**
 * يولد JWT للمصادقة مع GitHub App
 * @param {string} appId - معرف التطبيق
 * @param {string} privateKey - المفتاح الخاص
 * @returns {string} JWT token صالح لمدة 10 دقائق
 */
function generateJWT(appId, privateKey) {
  if (!appId || !privateKey) {
    throw new Error('بيانات GitHub App غير مكتملة (App ID أو Private Key مفقود).');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60,
    exp: now + (9 * 60),
    iss: String(appId),
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${unsigned}.${signature}`;
}

/**
 * يحصل على Installation Access Token مع cache
 * @param {string} installationId
 * @returns {Promise<string|null>} token
 */
async function getInstallationToken(installationId) {
  const { ready, appId, privateKey } = getGitHubAppConfig();
  if (!ready || !installationId) return null;

  const cacheKey = String(installationId);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.token;
  }

  const jwt = generateJWT(appId, privateKey);

  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${jwt}`,
      'User-Agent': 'TELAD-FLEET-GitHub-App',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`تعذر إنشاء Installation Token: ${response.status} ${errText}`);
  }

  const payload = await response.json();
  const token = payload.token;

  const expiresAt = Date.now() + (50 * 60 * 1000);
  tokenCache.set(cacheKey, { token, expiresAt });

  return token;
}

/**
 * يتحقق من صحة Webhook signature
 * @param {Buffer} rawBody - الـ body الخام
 * @param {string} signature - X-Hub-Signature-256 header
 * @param {string} secret - GITHUB_APP_WEBHOOK_SECRET
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signature, secret) {
  if (!secret || !signature || !Buffer.isBuffer(rawBody)) return false;
  if (!signature.startsWith('sha256=')) return false;

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const provided = signature.trim();

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * ينشئ Octokit instance مصادق عليه
 * @param {string} installationId
 * @returns {Promise<Object|null>} Octokit instance
 */
async function getAuthenticatedOctokit(installationId) {
  const token = await getInstallationToken(installationId || process.env.GITHUB_APP_INSTALLATION_ID);
  if (!token) return null;

  return new Octokit({ auth: token });
}

module.exports = {
  generateJWT,
  getInstallationToken,
  verifyWebhookSignature,
  getAuthenticatedOctokit,
  getGitHubAppConfig,
  readPrivateKey,
};
