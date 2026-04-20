'use strict';

const { getAuthenticatedOctokit } = require('./auth');
const {
  createMaintenanceFromIssue,
  notifyAllManagers,
  logActivity,
  createEmergencyAlert,
} = require('./fleet-integration');
const { logEvent, logError } = require('./middleware/logger');

async function push(payload, context = {}) {
  logEvent('push', context.deliveryId, {
    repository: payload.repository?.full_name,
    ref: payload.ref,
    commits: Array.isArray(payload.commits) ? payload.commits.length : 0,
  });

  logActivity('push', 'تم استلام تحديث جديد على المستودع', {
    repository: payload.repository?.full_name,
    ref: payload.ref,
  });

  context.io?.emit('github:push', {
    message: 'تم استلام Push جديد من GitHub',
    repository: payload.repository?.full_name,
    ref: payload.ref,
    timestamp: new Date().toISOString(),
  });
}

async function pull_request(payload, context = {}) {
  const action = payload.action;
  const pr = payload.pull_request;
  if (!pr) return;

  logEvent('pull_request', context.deliveryId, {
    action,
    number: pr.number,
    merged: pr.merged,
    repository: payload.repository?.full_name,
  });

  if (action === 'opened') {
    logActivity('pull_request_opened', 'تم فتح طلب سحب جديد', {
      number: pr.number,
      title: pr.title,
      repository: payload.repository?.full_name,
    });

    try {
      const installationId = payload.installation?.id || process.env.GITHUB_APP_INSTALLATION_ID;
      const owner = payload.repository?.owner?.login;
      const repo = payload.repository?.name;

      if (installationId && owner && repo) {
        const octokit = await getAuthenticatedOctokit(installationId);
        await octokit.issues.createComment({
          owner,
          repo,
          issue_number: pr.number,
          body: 'شكراً لفتح طلب السحب ✅\nسيتم مراجعته ضمن سير عمل إدارة الأسطول في TELAD FLEET.',
        });
      }
    } catch (error) {
      logError(error, { event: 'pull_request_opened_comment', deliveryId: context.deliveryId });
    }
  }

  if (action === 'closed' && pr.merged) {
    const message = `تم دمج طلب السحب #${pr.number} بنجاح`; 
    notifyAllManagers(message, {
      number: pr.number,
      title: pr.title,
      repository: payload.repository?.full_name,
    });

    context.io?.emit('github:pull_request_merged', {
      message: 'تم دمج Pull Request جديد بنجاح',
      number: pr.number,
      title: pr.title,
      repository: payload.repository?.full_name,
      mergedBy: pr.merged_by?.login || null,
    });
  }
}

async function issues(payload, context = {}) {
  const issue = payload.issue;
  if (!issue) return;

  logEvent('issues', context.deliveryId, {
    action: payload.action,
    number: issue.number,
    repository: payload.repository?.full_name,
  });

  const labels = Array.isArray(issue.labels) ? issue.labels.map((label) => label.name) : [];
  if (labels.includes('maintenance')) {
    createMaintenanceFromIssue(issue);
  }
}

async function deployment(payload, context = {}) {
  logEvent('deployment', context.deliveryId, {
    environment: payload.deployment?.environment,
    repository: payload.repository?.full_name,
  });

  notifyAllManagers('تم إنشاء Deployment جديد', {
    environment: payload.deployment?.environment,
    repository: payload.repository?.full_name,
  });
}

async function deployment_status(payload, context = {}) {
  const state = payload.deployment_status?.state;
  logEvent('deployment_status', context.deliveryId, {
    state,
    environment: payload.deployment?.environment,
    repository: payload.repository?.full_name,
  });

  if (state === 'failure' || state === 'error') {
    createEmergencyAlert({
      message: `فشل النشر على البيئة ${payload.deployment?.environment || 'غير معروفة'}`,
      state,
      repository: payload.repository?.full_name,
      targetUrl: payload.deployment_status?.target_url || null,
    });
  }
}

async function release(payload, context = {}) {
  logEvent('release', context.deliveryId, {
    action: payload.action,
    tagName: payload.release?.tag_name,
    repository: payload.repository?.full_name,
  });

  logActivity('release', 'تم استلام حدث إصدار جديد', {
    action: payload.action,
    tagName: payload.release?.tag_name,
    repository: payload.repository?.full_name,
  });
}

async function workflow_run(payload, context = {}) {
  logEvent('workflow_run', context.deliveryId, {
    action: payload.action,
    workflowName: payload.workflow_run?.name,
    status: payload.workflow_run?.status,
    conclusion: payload.workflow_run?.conclusion,
    repository: payload.repository?.full_name,
  });

  logActivity('workflow_run', 'تم تحديث حالة Workflow', {
    workflowName: payload.workflow_run?.name,
    status: payload.workflow_run?.status,
    conclusion: payload.workflow_run?.conclusion,
  });
}

async function installation(payload, context = {}) {
  logEvent('installation', context.deliveryId, {
    action: payload.action,
    account: payload.installation?.account?.login,
  });

  notifyAllManagers('تم تحديث تثبيت GitHub App', {
    action: payload.action,
    account: payload.installation?.account?.login,
  });
}

module.exports = {
  push,
  pull_request,
  issues,
  deployment,
  deployment_status,
  release,
  workflow_run,
  installation,
};
