'use strict';

const {
  createMaintenanceFromIssue,
  notifyAllManagers,
  updateSystemVersion,
  logActivity,
  createEmergencyAlert,
  syncDeploymentStatus,
} = require('./fleet-integration');
const { getAuthenticatedOctokit } = require('./auth');

function hasLabel(issue, name) {
  return Array.isArray(issue?.labels) && issue.labels.some((label) => {
    if (typeof label === 'string') return label.toLowerCase() === name.toLowerCase();
    return String(label.name || '').toLowerCase() === name.toLowerCase();
  });
}

async function postCommentIfPossible(payload, body) {
  try {
    const installationId = payload.installation?.id || process.env.GITHUB_APP_INSTALLATION_ID;
    const octokit = await getAuthenticatedOctokit(installationId);
    if (!octokit) return;

    await octokit.issues.createComment({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.pull_request.number,
      body,
    });
  } catch (error) {
    logActivity('github_comment_failed', { error: error.message });
  }
}

async function createFailureIssue(payload) {
  try {
    const installationId = payload.installation?.id || process.env.GITHUB_APP_INSTALLATION_ID;
    const octokit = await getAuthenticatedOctokit(installationId);
    if (!octokit) return;

    await octokit.issues.create({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      title: 'تنبيه: فشل النشر',
      body: `تم تسجيل فشل في النشر.\n\nالبيانات: ${JSON.stringify(payload, null, 2)}`,
      labels: ['incident', 'deployment'],
    });
  } catch (error) {
    logActivity('deployment_failure_issue_failed', { error: error.message });
  }
}

async function postInstallationWelcome(payload) {
  try {
    const installationId = payload.installation?.id || process.env.GITHUB_APP_INSTALLATION_ID;
    const octokit = await getAuthenticatedOctokit(installationId);
    if (!octokit) return;

    const repositories = payload.repositories || [];
    const firstRepo = repositories[0];
    if (!firstRepo || !firstRepo.full_name) return;

    const [owner, repo] = firstRepo.full_name.split('/');
    if (!owner || !repo) return;

    await octokit.issues.create({
      owner,
      repo,
      title: 'مرحباً من GitHub App 🚗',
      body: 'تم تثبيت تطبيق TELAD Fleet Manager بنجاح. شكراً لتمكين التكامل.',
      labels: ['github-app'],
    });
  } catch (error) {
    logActivity('installation_welcome_failed', { error: error.message });
  }
}

async function handlePullRequest(payload, io) {
  if (payload.action === 'opened') {
    await postCommentIfPossible(payload, 'شكراً لمساهمتك في نظام TELAD FLEET 🚗');
    logActivity('pull_request_opened', {
      number: payload.pull_request.number,
      title: payload.pull_request.title,
    });
  }

  if (payload.action === 'closed' && payload.pull_request?.merged) {
    const data = {
      number: payload.pull_request.number,
      title: payload.pull_request.title,
      mergedBy: payload.pull_request.merged_by?.login || 'unknown',
    };
    notifyAllManagers('pull_request_merged', data);
    if (io) io.emit('github:pull_request:merged', data);
    logActivity('pull_request_merged', data);
  }
}

async function handleIssues(payload, io) {
  if (payload.action !== 'opened') return;

  if (hasLabel(payload.issue, 'maintenance')) {
    const result = await createMaintenanceFromIssue(payload.issue);
    logActivity('maintenance_issue_opened', {
      issueNumber: payload.issue.number,
      result,
    });
  }

  if (hasLabel(payload.issue, 'vehicle')) {
    logActivity('vehicle_issue_opened', {
      issueNumber: payload.issue.number,
      title: payload.issue.title,
    });
  }

  if (io) {
    io.emit('github:issue:opened', {
      number: payload.issue.number,
      title: payload.issue.title,
      labels: payload.issue.labels,
    });
  }
}

async function handleDeployment(payload, io) {
  logActivity('deployment_started', {
    id: payload.deployment?.id,
    environment: payload.deployment?.environment,
    ref: payload.deployment?.ref,
  });
  syncDeploymentStatus('started', payload.deployment?.url || payload.deployment_status?.target_url || null);
  if (io) io.emit('github:deployment:started', payload.deployment || payload);
}

async function handleDeploymentStatus(payload, io) {
  const state = payload.deployment_status?.state;
  const targetUrl = payload.deployment_status?.target_url;

  if (state === 'success') {
    syncDeploymentStatus('success', targetUrl);
    notifyAllManagers('deployment_success', {
      environment: payload.deployment?.environment,
      url: targetUrl,
    });
    logActivity('deployment_success', {
      environment: payload.deployment?.environment,
      url: targetUrl,
    });
    if (io) io.emit('github:deployment:success', payload.deployment_status);
  }

  if (state === 'failure') {
    createEmergencyAlert('🚨 تنبيه طارئ: فشل النشر في النظام.');
    await createFailureIssue(payload);
    logActivity('deployment_failure', {
      environment: payload.deployment?.environment,
      url: targetUrl,
    });
    if (io) io.emit('github:deployment:failure', payload.deployment_status);
  }
}

async function handleWebhookEvent(eventName, payload, { io, logger }) {
  try {
    switch (eventName) {
      case 'push': {
        const commits = Array.isArray(payload.commits) ? payload.commits : [];
        const pushData = {
          ref: payload.ref,
          before: payload.before,
          after: payload.after,
          commitCount: commits.length,
          commitMessages: commits.map((c) => c.message),
          deployId: process.env.DEPLOY_ID || payload.after || null,
        };
        logActivity('push', pushData);
        if (io) io.emit('github:push', pushData);
        break;
      }

      case 'pull_request':
        await handlePullRequest(payload, io);
        break;

      case 'issues':
        await handleIssues(payload, io);
        break;

      case 'deployment':
        await handleDeployment(payload, io);
        break;

      case 'deployment_status':
        await handleDeploymentStatus(payload, io);
        break;

      case 'release':
        if (payload.action === 'published') {
          updateSystemVersion(payload.release?.tag_name || 'unknown');
          if (io) io.emit('github:release:published', payload.release);
        }
        break;

      case 'workflow_run':
        if (payload.action === 'completed') {
          logActivity('workflow_run_completed', {
            workflow: payload.workflow_run?.name,
            conclusion: payload.workflow_run?.conclusion,
            html_url: payload.workflow_run?.html_url,
          });
          if (io) io.emit('github:workflow:completed', payload.workflow_run);
        }
        break;

      case 'installation':
        if (payload.action === 'created') {
          await postInstallationWelcome(payload);
          logActivity('installation_created', {
            id: payload.installation?.id,
            account: payload.installation?.account?.login,
          });
          if (io) io.emit('github:installation:created', payload.installation);
        }
        break;

      case 'check_run':
        logActivity('check_run', {
          action: payload.action,
          name: payload.check_run?.name,
          conclusion: payload.check_run?.conclusion,
        });
        if (io) io.emit('github:check_run', payload.check_run);
        break;

      default:
        logActivity('github_unhandled_event', {
          event: eventName,
          action: payload.action,
        });
        break;
    }
  } catch (error) {
    logger.error('❌ [GitHubApp] خطأ أثناء معالجة webhook:', error.message);
    logActivity('webhook_processing_error', {
      event: eventName,
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  handleWebhookEvent,
};
