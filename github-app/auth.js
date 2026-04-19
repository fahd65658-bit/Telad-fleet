'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const https = require('https');

const tokenCache = new Map();

function resolvePrivateKey() {
  if (process.env.GITHUB_APP_PRIVATE_KEY) {
    return process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
  }

  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  if (!keyPath) return '';

  try {
    return fs.readFileSync(path.resolve(keyPath), 'utf8');
  } catch (error) {
    console.error('[github-app/auth] Failed to read private key:', error.message);
    return '';
  }
}

function generateJWT(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat: now, exp: now + 600, iss: String(appId) },
    privateKey,
    { algorithm: 'RS256' }
  );
}

function postAccessTokenRequest(installationId, appJwt) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: `/app/installations/${installationId}/access_tokens`,
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${appJwt}`,
          'User-Agent': 'TELAD-FLEET-GitHubApp/2.0.1',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`GitHub token request failed (${res.statusCode}): ${raw}`));
          }

          try {
            resolve(JSON.parse(raw));
          } catch (error) {
            reject(new Error(`Invalid token response JSON: ${error.message}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

async function getInstallationToken(installationId) {
  const finalInstallationId = installationId || process.env.GITHUB_APP_INSTALLATION_ID;
  if (!finalInstallationId) throw new Error('Missing installation ID');

  const cacheKey = String(finalInstallationId);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = resolvePrivateKey();
  if (!appId || !privateKey) {
    throw new Error('Missing GITHUB_APP_ID or private key configuration');
  }

  const appJwt = generateJWT(appId, privateKey);
  const response = await postAccessTokenRequest(finalInstallationId, appJwt);

  tokenCache.set(cacheKey, {
    token: response.token,
    expiresAt: Date.now() + (50 * 60 * 1000),
  });

  return response.token;
}

function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false;

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(String(signatureHeader), 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function getAuthenticatedOctokit(installationId) {
  const token = await getInstallationToken(installationId);

  let Octokit;
  try {
    ({ Octokit } = require('@octokit/rest'));
  } catch (_error) {
    Octokit = null;
  }

  if (!Octokit) return { token };

  return {
    token,
    octokit: new Octokit({ auth: token }),
  };
}

module.exports = {
  generateJWT,
  getInstallationToken,
  verifyWebhookSignature,
  getAuthenticatedOctokit,
};
