'use strict';

const { Octokit } = require('@octokit/rest');
const { getInstallationToken } = require('./auth');

/**
 * Creates Octokit client for installation-scoped operations.
 * @param {string|number} installationId GitHub App installation ID.
 * @returns {Promise<Octokit|null>} Octokit instance or null when unavailable.
 */
async function createInstallationClient(installationId) {
  if (!installationId) return null;
  try {
    const tokenPayload = await getInstallationToken(installationId);
    return new Octokit({ auth: tokenPayload.token });
  } catch {
    return null;
  }
}

/**
 * Adds Arabic comment on issue or pull request thread.
 * @param {object} payload Webhook payload.
 * @param {string} body Comment text.
 * @returns {Promise<void>}
 */
async function addIssueComment(payload, body) {
  const repo = payload.repository;
  const issue = payload.pull_request || payload.issue;
  if (!repo || !issue || !issue.number) return;
  const octokit = await createInstallationClient(payload.installation && payload.installation.id);
  if (!octokit) return;
  await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
    owner: repo.owner.login,
    repo: repo.name,
    issue_number: issue.number,
    body,
  });
}

/**
 * Creates quality check run attached to PR commit.
 * @param {object} payload pull_request payload.
 * @returns {Promise<void>}
 */
async function createQualityCheck(payload) {
  const repo = payload.repository;
  const pullRequest = payload.pull_request;
  if (!repo || !pullRequest || !pullRequest.head || !pullRequest.head.sha) return;
  const octokit = await createInstallationClient(payload.installation && payload.installation.id);
  if (!octokit) return;
  await octokit.request('POST /repos/{owner}/{repo}/check-runs', {
    owner: repo.owner.login,
    repo: repo.name,
    name: 'TELAD Fleet Quality Gate',
    head_sha: pullRequest.head.sha,
    status: 'completed',
    conclusion: 'success',
    output: {
      title: 'فحص الجودة التلقائي',
      summary: 'تم تشغيل فحص الجودة التلقائي عبر GitHub App.',
      text: 'يمكن متابعة النتائج التفصيلية من لوحة GitHub Checks.',
    },
  });
}

/**
 * Checks if issue includes maintenance label.
 * @param {object} issue GitHub issue payload.
 * @returns {boolean} True when maintenance label is present.
 */
function hasMaintenanceLabel(issue) {
  if (!issue || !Array.isArray(issue.labels)) return false;
  return issue.labels.some((label) => String(label.name || '').toLowerCase() === 'maintenance');
}

/**
 * Creates event processors for required GitHub webhook events.
 * @param {{
 *   fleetIntegration: ReturnType<import('./fleet-integration').createFleetIntegration>,
 *   setDeployId?: function(string): void
 * }} context Runtime context.
 * @returns {{ processEvent: function(string, object): Promise<void> }} Event processor.
 */
function createWebhookHandlers(context) {
  const fleetIntegration = context.fleetIntegration;

  /**
   * Dispatches incoming webhook event.
   * @param {string} eventName Event name from x-github-event.
   * @param {object} payload Parsed webhook payload.
   * @returns {Promise<void>}
   */
  async function processEvent(eventName, payload) {
    const action = payload && payload.action ? payload.action : '';
    switch (eventName) {
      case 'push': {
        const commitCount = Array.isArray(payload.commits) ? payload.commits.length : 0;
        if (payload.after && typeof context.setDeployId === 'function') context.setDeployId(payload.after);
        fleetIntegration.logActivity('push', `تم استقبال Push بعدد ${commitCount} التزام`, {
          repository: payload.repository && payload.repository.full_name,
          ref: payload.ref,
          after: payload.after,
        });
        break;
      }
      case 'pull_request': {
        const pr = payload.pull_request || {};
        if (action === 'opened') {
          await addIssueComment(payload, 'شكراً لك 🙏 تم استلام طلب الدمج وسيتم مراجعته تلقائياً.');
          await createQualityCheck(payload);
          fleetIntegration.logActivity('pull_request', `تم فتح PR #${pr.number || ''}`, { action, number: pr.number });
        } else if (action === 'closed' && pr.merged) {
          await addIssueComment(payload, '✅ تم دمج Pull Request بنجاح. شكراً لمساهمتك.');
          fleetIntegration.notifyPrMerged(pr);
        } else {
          fleetIntegration.logActivity('pull_request', `حدث PR: ${action}`, { action, number: pr.number });
        }
        break;
      }
      case 'issues': {
        const issue = payload.issue || {};
        if ((action === 'opened' || action === 'labeled') && hasMaintenanceLabel(issue)) {
          fleetIntegration.createMaintenanceRequestFromIssue(issue);
        } else {
          fleetIntegration.logActivity('issues', `حدث Issue: ${action}`, {
            number: issue.number,
            title: issue.title,
          });
        }
        break;
      }
      case 'deployment':
        fleetIntegration.logActivity('deployment', 'تم إنشاء Deployment جديد', {
          id: payload.deployment && payload.deployment.id,
          environment: payload.deployment && payload.deployment.environment,
        });
        break;
      case 'deployment_status':
        fleetIntegration.handleDeploymentStatus(payload.deployment_status || {});
        break;
      case 'check_run':
        fleetIntegration.logActivity('check_run', 'تم تشغيل فحص check_run تلقائياً', {
          action,
          name: payload.check_run && payload.check_run.name,
        });
        break;
      case 'check_suite':
        fleetIntegration.logActivity('check_suite', 'تم تحديث check_suite', {
          action,
          headBranch: payload.check_suite && payload.check_suite.head_branch,
        });
        break;
      case 'release':
        fleetIntegration.logActivity('release', 'تم تحديث نسخة النظام عبر release', {
          action,
          tag: payload.release && payload.release.tag_name,
        });
        break;
      case 'workflow_run':
        fleetIntegration.logActivity('workflow_run', 'تم استقبال workflow_run', {
          action,
          name: payload.workflow_run && payload.workflow_run.name,
          status: payload.workflow_run && payload.workflow_run.status,
          conclusion: payload.workflow_run && payload.workflow_run.conclusion,
        });
        break;
      default:
        fleetIntegration.logActivity('unhandled_event', `حدث غير معالج: ${eventName}`, { action });
    }
  }

  return { processEvent };
}

module.exports = { createWebhookHandlers };
