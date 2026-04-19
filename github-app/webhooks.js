'use strict';

const {
  createMaintenanceFromIssue,
  notifyAllManagers,
  logActivity,
  createEmergencyAlert,
} = require('./fleet-integration');

function emit(context, eventName, payload) {
  if (typeof context?.emit === 'function') {
    context.emit(eventName, payload);
  }
}

async function handlePush(payload, _octokit, context) {
  const info = {
    repository: payload?.repository?.full_name,
    ref: payload?.ref,
    commitCount: Array.isArray(payload?.commits) ? payload.commits.length : 0,
    pusher: payload?.pusher?.name,
  };

  logActivity('github:push', info);
  emit(context, 'github:push', info);
}

async function handlePullRequest(payload, octokitAuth, context) {
  const action = payload?.action;
  const pr = payload?.pull_request;
  const repo = payload?.repository;

  if (action === 'opened' && pr && repo) {
    const commentBody = 'شكراً لفتح طلب السحب ✅\nسيتم مراجعته ضمن سير عمل TELAD FLEET.';
    try {
      await octokitAuth?.octokit?.rest?.issues?.createComment({
        owner: repo.owner.login,
        repo: repo.name,
        issue_number: pr.number,
        body: commentBody,
      });
    } catch (error) {
      logActivity('github:pr:comment-error', { number: pr.number, message: error.message });
    }
  }

  if (action === 'closed' && pr?.merged) {
    const data = {
      number: pr.number,
      title: pr.title,
      mergedBy: pr.merged_by?.login,
      repository: repo?.full_name,
    };
    logActivity('github:pr-merged', data);
    emit(context, 'github:pr-merged', notifyAllManagers('github:pr-merged', data));
  }
}

async function handleIssues(payload, _octokit, context) {
  const action = payload?.action;
  const issue = payload?.issue;
  if (action !== 'opened' || !issue) return;

  const labels = (issue.labels || []).map((label) => (typeof label === 'string' ? label : label.name || '')).filter(Boolean);

  if (labels.includes('maintenance')) {
    await createMaintenanceFromIssue(issue);
    const data = { issueNumber: issue.number, title: issue.title };
    logActivity('github:maintenance-issue', data);
    emit(context, 'github:issue-maintenance', notifyAllManagers('github:issue-maintenance', data));
  }

  if (labels.includes('vehicle')) {
    const data = { issueNumber: issue.number, title: issue.title };
    console.log('[github-app] Vehicle request issue opened:', data);
    logActivity('github:vehicle-issue', data);
  }
}

async function handleDeployment(payload, _octokit, context) {
  const data = {
    environment: payload?.deployment?.environment,
    sha: payload?.deployment?.sha,
    repository: payload?.repository?.full_name,
  };
  console.log('[github-app] Deployment started:', data);
  logActivity('github:deployment', data);
  emit(context, 'github:deployment', data);
}

async function handleDeploymentStatus(payload, octokitAuth, context) {
  const state = payload?.deployment_status?.state;
  const repository = payload?.repository;

  if (state === 'success') {
    const data = {
      state,
      environment: payload?.deployment_status?.environment,
      repository: repository?.full_name,
    };
    logActivity('github:deploy-success', data);
    emit(context, 'github:deploy-success', notifyAllManagers('github:deploy-success', data));
    return;
  }

  if (state === 'failure' || state === 'error') {
    const alert = createEmergencyAlert(`Deployment failed for ${repository?.full_name || 'repository'}`);
    logActivity('github:deploy-failure', {
      state,
      repository: repository?.full_name,
      alert,
    });
    emit(context, 'github:deploy-failure', notifyAllManagers('github:deploy-failure', alert));

    try {
      await octokitAuth?.octokit?.rest?.issues?.create({
        owner: repository?.owner?.login,
        repo: repository?.name,
        title: `🚨 Deployment failure: ${payload?.deployment?.sha || 'unknown sha'}`,
        body: `${alert.message}\n\nState: ${state}`,
        labels: ['incident', 'deployment'],
      });
    } catch (error) {
      logActivity('github:deploy-failure-issue-error', { message: error.message });
    }
  }
}

async function handleRelease(payload, _octokit, context) {
  const release = payload?.release;
  const data = {
    action: payload?.action,
    tag: release?.tag_name,
    name: release?.name,
    repository: payload?.repository?.full_name,
  };
  console.log('[github-app] Release event:', data);
  logActivity('github:release', data);
  emit(context, 'github:release', data);
}

async function handleWorkflowRun(payload, _octokit, context) {
  const run = payload?.workflow_run;
  const data = {
    name: run?.name,
    status: run?.status,
    conclusion: run?.conclusion,
    repository: payload?.repository?.full_name,
  };
  logActivity('github:workflow-run', data);
  emit(context, 'github:workflow-run', notifyAllManagers('github:workflow-run', data));
}

async function handleInstallation(payload) {
  const data = {
    action: payload?.action,
    installationId: payload?.installation?.id,
    account: payload?.installation?.account?.login,
  };
  console.log('[github-app] Installation event:', data);
  logActivity('github:installation', data);
}

module.exports = {
  handlePush,
  handlePullRequest,
  handleIssues,
  handleDeployment,
  handleDeploymentStatus,
  handleRelease,
  handleWorkflowRun,
  handleInstallation,
};
