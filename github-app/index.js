'use strict';

const { Octokit } = require('@octokit/rest');
const { generateJWT, verifyWebhookSignature, getTokenCacheSnapshot } = require('./auth');
const { createFleetIntegration } = require('./fleet-integration');
const { createWebhookHandlers } = require('./webhooks');

/**
 * Builds GitHub App core runtime used by backend routes.
 * @param {{
 *   io?: import('socket.io').Server,
 *   getDeployId?: function(): string,
 *   setDeployId?: function(string): void
 * }} options Runtime options.
 * @returns {{
 *   processWebhook: function(Buffer|string, string, object): Promise<object>,
 *   getStatus: function(): Promise<object>,
 *   listInstallations: function(): Promise<object[]>,
 *   getActivity: function(): object[]
 * }} GitHub App runtime API.
 */
function createGitHubAppCore(options = {}) {
  const fleetIntegration = createFleetIntegration({ io: options.io });
  const webhookHandlers = createWebhookHandlers({
    fleetIntegration,
    setDeployId: options.setDeployId,
  });
  const cachedPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY
    ? process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n')
    : require('fs').readFileSync(require('path').resolve(process.env.GITHUB_APP_PRIVATE_KEY_PATH || './github-app/private-key.pem'), 'utf8');

  /**
   * Creates app-level Octokit client authenticated via app JWT.
   * @returns {Octokit} Octokit client.
   */
  function createAppClient() {
    const appId = process.env.GITHUB_APP_ID;
    if (!appId) throw new Error('GITHUB_APP_ID is missing');
    const appJwt = generateJWT(appId, cachedPrivateKey);
    return new Octokit({ auth: appJwt });
  }

  /**
   * Verifies and processes incoming webhook payload.
   * @param {Buffer|string} rawPayload Raw request payload.
   * @param {string} signature Signature header.
   * @param {object} headers Request headers.
   * @returns {Promise<object>} Processing result.
   */
  async function processWebhook(rawPayload, signature, headers = {}) {
    const secret = process.env.GITHUB_APP_WEBHOOK_SECRET || '';
    const ok = verifyWebhookSignature(rawPayload, signature || '', secret);
    if (!ok) {
      return { ok: false, statusCode: 401, error: 'Webhook signature verification failed' };
    }

    const payloadText = Buffer.isBuffer(rawPayload) ? rawPayload.toString('utf8') : String(rawPayload);
    const payload = payloadText ? JSON.parse(payloadText) : {};
    const eventName = headers['x-github-event'] || headers['X-GitHub-Event'];
    if (!eventName) return { ok: false, statusCode: 400, error: 'Missing x-github-event header' };

    await webhookHandlers.processEvent(eventName, payload);
    return { ok: true, statusCode: 202, event: eventName };
  }

  /**
   * Returns basic diagnostics for GitHub App health endpoint.
   * @returns {Promise<object>} GitHub App status.
   */
  async function getStatus() {
    const hasAppId = Boolean(process.env.GITHUB_APP_ID);
    const hasWebhookSecret = Boolean(process.env.GITHUB_APP_WEBHOOK_SECRET);
    let appMeta = null;
    try {
      if (hasAppId) {
        const appClient = createAppClient();
        const appInfo = await appClient.request('GET /app');
        appMeta = {
          id: appInfo.data.id,
          slug: appInfo.data.slug,
          name: appInfo.data.name,
        };
      }
    } catch {
      appMeta = null;
    }

    return {
      status: hasAppId && hasWebhookSecret ? 'configured' : 'partial',
      app: appMeta,
      deployId: options.getDeployId ? options.getDeployId() : null,
      cachedTokens: getTokenCacheSnapshot(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Lists installations for the current GitHub App.
   * @returns {Promise<object[]>} Installation records.
   */
  async function listInstallations() {
    const appClient = createAppClient();
    const response = await appClient.request('GET /app/installations');
    return (response.data || []).map((installation) => ({
      id: installation.id,
      account: installation.account ? installation.account.login : null,
      repositorySelection: installation.repository_selection,
      suspendedAt: installation.suspended_at,
    }));
  }

  /**
   * Returns activity log snapshots from fleet integration.
   * @returns {object[]} Activity log list.
   */
  function getActivity() {
    return fleetIntegration.getActivityLog();
  }

  return {
    processWebhook,
    getStatus,
    listInstallations,
    getActivity,
  };
}

module.exports = {
  createGitHubAppCore,
};
