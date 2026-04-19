'use strict';

const integration = require('./fleet-integration');
const { getAuthenticatedOctokit } = require('./auth');

/**
 * Handle incoming GitHub webhook event and map it to Fleet operations.
 * @param {string} eventName
 * @param {object} payload
 * @returns {Promise<{ok: boolean, event: string}>}
 */
async function handleWebhookEvent(eventName, payload) {
  try {
    const action = payload?.action;

    if (eventName === 'push') {
      integration.logActivity('github.push', {
        ref: payload.ref,
        commits: (payload.commits || []).map((c) => ({ id: c.id, message: c.message })),
        deployId: payload.after,
      });
      integration.notifyAllManagers('push', { deployId: payload.after, ref: payload.ref });
      return { ok: true, event: eventName };
    }

    if (eventName === 'pull_request' && action === 'opened') {
      integration.logActivity('github.pull_request.opened', {
        number: payload.pull_request?.number,
        title: payload.pull_request?.title,
      });

      const installationId = payload.installation?.id;
      if (installationId && payload.repository?.owner?.login && payload.repository?.name) {
        try {
          const octokit = await getAuthenticatedOctokit(installationId);
          await octokit.issues.createComment({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: payload.pull_request.number,
            body: 'شكراً لمساهمتك في TELAD FLEET 🚗\nتم استلام طلب الدمج وسيتم مراجعته قريباً.',
          });
        } catch (error) {
          integration.logActivity('github.pull_request.comment_failed', { error: error.message });
        }
      }

      return { ok: true, event: eventName };
    }

    if (eventName === 'pull_request' && action === 'closed' && payload.pull_request?.merged) {
      integration.notifyAllManagers('pull_request.merged', {
        number: payload.pull_request.number,
        title: payload.pull_request.title,
        mergedBy: payload.pull_request.merged_by?.login || null,
      });
      integration.logActivity('github.pull_request.merged', { number: payload.pull_request.number });
      return { ok: true, event: eventName };
    }

    if (eventName === 'issues' && action === 'opened') {
      const labels = (payload.issue?.labels || []).map((l) => l.name);
      if (labels.includes('maintenance')) {
        await integration.createMaintenanceFromIssue(payload.issue);
      }
      if (labels.includes('vehicle')) {
        integration.logActivity('github.vehicle.issue_opened', {
          issue: payload.issue?.number,
          title: payload.issue?.title,
        });
      }
      return { ok: true, event: eventName };
    }

    if (eventName === 'deployment') {
      integration.syncDeploymentStatus('started');
      integration.logActivity('github.deployment.started', { id: payload.deployment?.id });
      return { ok: true, event: eventName };
    }

    if (eventName === 'deployment_status') {
      const state = payload.deployment_status?.state;
      integration.syncDeploymentStatus(state || 'unknown');

      if (state === 'success') {
        integration.notifyAllManagers('deployment.success', { deploymentId: payload.deployment?.id });
      }

      if (state === 'failure') {
        integration.createEmergencyAlert('فشل في عملية النشر. يلزم تدخل عاجل من مسؤول النظام.');

        const installationId = payload.installation?.id;
        if (installationId && payload.repository?.owner?.login && payload.repository?.name) {
          try {
            const octokit = await getAuthenticatedOctokit(installationId);
            await octokit.issues.create({
              owner: payload.repository.owner.login,
              repo: payload.repository.name,
              title: '🚨 Deployment Failure Alert',
              body: 'فشل نشر النظام تلقائياً. يرجى مراجعة السجلات واتخاذ الإجراء المناسب.',
              labels: ['incident'],
            });
          } catch (error) {
            integration.logActivity('github.deployment.issue_failed', { error: error.message });
          }
        }
      }

      return { ok: true, event: eventName };
    }

    if (eventName === 'release' && action === 'published') {
      integration.updateSystemVersion(payload.release?.tag_name || 'unknown');
      return { ok: true, event: eventName };
    }

    if (eventName === 'workflow_run' && action === 'completed') {
      integration.logActivity('github.workflow.completed', {
        name: payload.workflow_run?.name,
        conclusion: payload.workflow_run?.conclusion,
      });
      integration.notifyAllManagers('workflow.completed', {
        workflow: payload.workflow_run?.name,
        conclusion: payload.workflow_run?.conclusion,
      });
      return { ok: true, event: eventName };
    }

    if (eventName === 'check_run' || eventName === 'check_suite') {
      integration.logActivity(`github.${eventName}`, {
        action,
        status: payload.check_run?.status || payload.check_suite?.status,
      });
      return { ok: true, event: eventName };
    }

    if (eventName === 'installation' && action === 'created') {
      integration.logActivity('github.installation.created', {
        installationId: payload.installation?.id,
        account: payload.installation?.account?.login,
      });
      integration.notifyAllManagers('installation.created', {
        message: 'تم تثبيت GitHub App بنجاح على المستودع. 🎉',
      });
      return { ok: true, event: eventName };
    }

    integration.logActivity('github.unhandled_event', { eventName, action });
    return { ok: true, event: eventName };
  } catch (error) {
    integration.logActivity('github.webhook_error', { eventName, error: error.message });
    throw error;
  }
}

module.exports = {
  handleWebhookEvent,
};
