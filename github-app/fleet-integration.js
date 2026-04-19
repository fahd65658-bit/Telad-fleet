'use strict';

const MAX_ACTIVITY_LOG = 500;

/**
 * Creates integration bridge between GitHub App events and TELAD Fleet runtime.
 * @param {{io?: import('socket.io').Server}} options Runtime options.
 * @returns {{
 *   logActivity: function(string, string, object=): object,
 *   createMaintenanceRequestFromIssue: function(object): object,
 *   notifyPrMerged: function(object): object,
 *   handleDeploymentStatus: function(object): object,
 *   getActivityLog: function(): object[]
 * }} Integration API.
 */
function createFleetIntegration(options = {}) {
  const io = options.io;
  const activityLog = [];

  /**
   * Stores activity and emits real-time dashboard event.
   * @param {string} type Event type.
   * @param {string} message Arabic-friendly message.
   * @param {object} [payload] Additional metadata.
   * @returns {object} Persisted activity entry.
   */
  function logActivity(type, message, payload = {}) {
    const entry = {
      id: `gha-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      type,
      message,
      payload,
      timestamp: new Date().toISOString(),
    };
    activityLog.unshift(entry);
    if (activityLog.length > MAX_ACTIVITY_LOG) activityLog.length = MAX_ACTIVITY_LOG;
    if (io) io.emit('github:activity', entry);
    return entry;
  }

  /**
   * Creates maintenance request activity when issue is marked as maintenance.
   * @param {object} issue GitHub issue payload.
   * @returns {object} Activity entry.
   */
  function createMaintenanceRequestFromIssue(issue) {
    const issueNumber = issue && issue.number ? issue.number : 'غير معروف';
    return logActivity('maintenance_issue', `تم إنشاء طلب صيانة تلقائي من Issue #${issueNumber}`, {
      issueNumber,
      title: issue && issue.title ? issue.title : '',
      htmlUrl: issue && issue.html_url ? issue.html_url : '',
    });
  }

  /**
   * Notifies managers when PR is merged.
   * @param {object} pullRequest GitHub pull request payload.
   * @returns {object} Activity entry.
   */
  function notifyPrMerged(pullRequest) {
    const entry = logActivity('pull_request_merged', 'تم دمج Pull Request وإشعار المديرين', {
      number: pullRequest && pullRequest.number,
      title: pullRequest && pullRequest.title,
      mergedBy: pullRequest && pullRequest.merged_by ? pullRequest.merged_by.login : null,
    });
    if (io) {
      io.emit('github:managers', {
        level: 'info',
        message: `تم دمج PR #${pullRequest.number} بنجاح`,
        data: entry,
      });
    }
    return entry;
  }

  /**
   * Handles deployment status updates and emits success/failure notifications.
   * @param {object} deploymentStatus GitHub deployment_status payload.
   * @returns {object} Activity entry.
   */
  function handleDeploymentStatus(deploymentStatus) {
    const state = deploymentStatus && deploymentStatus.state ? deploymentStatus.state : 'unknown';
    const isSuccess = state === 'success';
    const isFailure = state === 'failure' || state === 'error';
    const entry = logActivity(
      'deployment_status',
      isSuccess
        ? 'تم تحديث حالة النظام: النشر ناجح'
        : isFailure
          ? 'تنبيه: فشل في عملية النشر'
          : `تم تحديث حالة النشر: ${state}`,
      { state, environment: deploymentStatus && deploymentStatus.environment },
    );
    if (io) {
      io.emit('github:deployment', {
        state,
        level: isFailure ? 'critical' : isSuccess ? 'success' : 'info',
        message: entry.message,
      });
    }
    return entry;
  }

  /**
   * Returns read-only copy of activity log.
   * @returns {object[]} Activity entries.
   */
  function getActivityLog() {
    return activityLog.slice();
  }

  return {
    logActivity,
    createMaintenanceRequestFromIssue,
    notifyPrMerged,
    handleDeploymentStatus,
    getActivityLog,
  };
}

module.exports = { createFleetIntegration };
